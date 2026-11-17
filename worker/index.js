// ==========================================
// WORKER ENTRY POINT: MAIN ORCHESTRATOR
// ==========================================

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { fetchBillWithContext, updateAudit } from "./config/supabase.js";
import { initializeBrowser } from "./core/browser.js";
import { navigateToLogin } from "./actions/auth/navigate-login.js";
import { authenticateCustomer } from "./actions/auth/authenticate.js";
import { navigateToBillPay } from "./actions/navigation/find-billpay.js";
import { verifyBillDetails } from "./actions/verification/verify-bill.js";
import { executeBillPayment } from "./actions/payment/pay-bill.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the project root folder
dotenv.config({
  path: path.join(__dirname, "../.env"),
});

console.log("Environment variables loaded.");

async function runAutomation(billId) {
  let browser;
  let stagehand;

  try {
    console.log(`\n=================================`);
    console.log(`STARTING AUTOMATION FOR BILL: ${billId}`);
    console.log(`=================================\n`);

    // 1. Fetch bill context, master portal_url, property account number, and payment methods
    const bill = await fetchBillWithContext(billId);

    console.log(`Vendor Name: ${bill.vendorName}`);
    console.log(`Master Portal URL: ${bill.portalUrl}`);
    console.log(`Target Account Number: ${bill.accountNumber || "N/A"}`);
    console.log(`Property Address: ${bill.property?.street}, ${bill.property?.city}`);
    console.log(`Loaded Payment Methods: ${bill.paymentMethods.length}`);

    // 2. Configure trusted domains for security checks
    const initialDomain = new URL(bill.portalUrl).hostname.toLowerCase();
    const trustedDomains = new Set([initialDomain]);

    const additionalDomains = process.env.TRUSTED_AUTH_DOMAINS || "";
    additionalDomains
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean)
      .forEach((domain) => trustedDomains.add(domain));

    console.log("Trusted domains:", [...trustedDomains]);

    // 3. Initialize Browser & Stagehand
    const browserSession = await initializeBrowser();
    browser = browserSession.browser;
    stagehand = browserSession.stagehand;
    const page = browserSession.page;

    // 4. Open Master Biller Portal
    console.log(`\nOpening vendor portal website...`);
    await page.goto(bill.portalUrl);
    console.log("Website opened. Current URL:", await page.url());

    // 5. Navigate to Login Page
    const loginResult = await navigateToLogin(
      page,
      stagehand,
      bill.vendorName,
      trustedDomains
    );

    if (!loginResult.success) {
      console.log(`Login requires special handling: ${loginResult.pageType}`);
      return;
    }

    // 6. Authenticate Customer
    const authentication = await authenticateCustomer(page, stagehand);

    if (authentication.status === "MFA_REQUIRED") {
      console.log("\n⚠️ Multi-Factor Authentication (MFA) required.");
      console.log("Automation paused for manual customer verification.");
      
      await updateAudit({
        billId: bill.id,
        action: "automation_paused",
        fromStatus: bill.status,
        toStatus: "needs_review",
        note: "Paused due to MFA requirement.",
      });
      return;
    }

    if (!authentication.success) {
      throw new Error("Customer authentication failed.");
    }

    // 7. Navigate to Bill-Pay Page & Match Account Number
    await navigateToBillPay(
      page,
      stagehand,
      bill.vendorName,
      bill.accountNumber,
      trustedDomains
    );

    // 8. Extract & Verify Bill Details from Page DOM
    await verifyBillDetails(page, stagehand, bill);

    // 9. If bill is approved, proceed to automated payment execution
    if (bill.status === "approved") {
      console.log("\nBill status is 'approved'. Proceeding to payment execution...");
      await executeBillPayment(page, stagehand, bill);
    } else {
      console.log(`\nBill status is '${bill.status}'. Stopping before payment execution.`);
    }

    // 10. Final Success Logging
    console.log(`\n=================================`);
    console.log("AUTOMATION COMPLETED SUCCESSFULLY");
    console.log(`=================================\n`);
    console.log("Vendor:", bill.vendorName);
    console.log("Account Number:", bill.accountNumber);
    console.log("Current Page URL:", await page.url());

  } catch (error) {
    console.error(`\n❌ AUTOMATION ERROR: ${error.message}`);
    process.exitCode = 1;
  } finally {
    console.log(`\n=================================`);
    console.log("CLEANING UP BROWSER RESOURCES");
    console.log(`=================================\n`);

    if (stagehand) {
      try {
        await stagehand.close();
        console.log("Stagehand closed.");
      } catch (e) {
        console.error("Stagehand close error:", e.message);
      }
    }

    if (browser) {
      try {
        await browser.close();
        console.log("Browser closed.");
      } catch (e) {
        console.error("Browser close error:", e.message);
      }
    }
  }
}

// ==========================================
// EXECUTION ENTRYPOINT
// ==========================================

const BILL_ID = process.env.BILL_ID;

if (!BILL_ID) {
  throw new Error("Missing BILL_ID environment variable. Run with BILL_ID=<uuid> node worker/index.js");
}

runAutomation(BILL_ID);