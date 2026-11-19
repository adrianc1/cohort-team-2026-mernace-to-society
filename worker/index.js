// ==========================================
// WORKER ENTRY POINT: MAIN ORCHESTRATOR
// ==========================================

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { supabase, fetchBillWithContext, updateAudit } from "./config/supabase.js";
import { initializeBrowser } from "./core/browser.js";
import { navigateToLogin } from "./actions/auth/navigate-login.js";
import { authenticateCustomer } from "./actions/auth/authenticate.js";
import { navigateToBillPay } from "./actions/navigation/find-billpay.js";
import { verifyBillDetails } from "./actions/verification/verify-bill.js";
import { executeBillPayment } from "./actions/payment/pay-bill.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    const bill = await fetchBillWithContext(billId);

    console.log(`Vendor Name: ${bill.vendorName}`);
    console.log(`Master Portal URL: ${bill.portalUrl}`);
    console.log(`Target Account Number: ${bill.accountNumber || "N/A"}`);
    console.log(`Property Address: ${bill.property?.street}, ${bill.property?.city}`);
    console.log(`Loaded Payment Methods: ${bill.paymentMethods.length}`);

    const initialDomain = new URL(bill.portalUrl).hostname.toLowerCase();
    const trustedDomains = new Set([initialDomain]);

    const additionalDomains = process.env.TRUSTED_AUTH_DOMAINS || "";
    additionalDomains
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean)
      .forEach((domain) => trustedDomains.add(domain));

    const browserSession = await initializeBrowser();
    browser = browserSession.browser;
    stagehand = browserSession.stagehand;
    const page = browserSession.page;

    console.log(`\nOpening vendor portal website...`);
    await page.goto(bill.portalUrl);
    console.log("Website opened. Current URL:", await page.url());

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

    const authentication = await authenticateCustomer(page, stagehand);

    if (authentication.status === "MFA_REQUIRED") {
      console.log("\n⚠️ Multi-Factor Authentication (MFA) required.");
      await updateAudit({
        billId: bill.id,
        action: "automation_paused",
        fromStatus: bill.status,
        toStatus: "needs_review",
        note: "Paused due to MFA requirement.",
        userId: bill.created_by,
      });
      return;
    }

    if (!authentication.success) {
      throw new Error("Customer authentication failed.");
    }

    await navigateToBillPay(
      page,
      stagehand,
      bill.vendorName,
      bill.accountNumber,
      trustedDomains
    );

    await verifyBillDetails(page, stagehand, bill);

    if (bill.status === "approved") {
      console.log("\nBill status is 'approved'. Proceeding to live payment execution...");
      const paymentResult = await executeBillPayment(page, stagehand, bill, supabase);

      if (paymentResult.success) {
        const methodUsed = paymentResult.methodUsed || "card";
        const confirmationNumber =
          paymentResult.confirmationNumber || `CONF-${Date.now()}`;
        const { error: finalizationError } = await supabase.rpc(
          "mark_bill_paid_with_audit",
          {
            p_bill_id: bill.id,
            p_method: methodUsed,
            p_confirmation_number: confirmationNumber,
            p_receipt_url: paymentResult.receiptUrl,
          },
        );

        if (finalizationError) {
          console.error(
            "Failed to save payment, bill status, and audit history in Supabase:",
            finalizationError.message,
          );
          throw new Error("Payment succeeded, but database finalization failed.");
        }

        console.log("Payment record, bill status, and audit history saved atomically.");
      }
    } else {
      console.log(`\nBill status is '${bill.status}'. Stopping before payment execution.`);
    }

    console.log(`\n=================================`);
    console.log("AUTOMATION COMPLETED SUCCESSFULLY");
    console.log(`=================================\n`);

  } catch (error) {
    console.error(`\n❌ AUTOMATION ERROR: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (stagehand) {
      try { await stagehand.close(); } catch (e) {}
    }
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

const BILL_ID = process.env.BILL_ID;

if (!BILL_ID) {
  throw new Error("Missing BILL_ID environment variable. Run with BILL_ID=<uuid> node worker/index.js");
}

runAutomation(BILL_ID);