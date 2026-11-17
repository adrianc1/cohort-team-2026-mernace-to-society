// ==========================================
// ACTIONS: FIND BILL-PAY & ACCOUNT NUMBER
// ==========================================

import { z } from "zod";
import { isTrustedDomain } from "../../utils/security.js";

/**
 * Navigates the authenticated dashboard to the billing section and matches account context.
 */
export async function navigateToBillPay(page, stagehand, vendorName, accountNumber, trustedDomains) {
  console.log("\n=================================");
  console.log("FINDING BILL-PAY & PROPERTY ACCOUNT");
  console.log("=================================\n");

  const visitedUrls = new Set();
  const maxSteps = 5;

  for (let step = 1; step <= maxSteps; step++) {
    console.log(`Bill-pay navigation step ${step}/${maxSteps}`);

    const currentUrl = await page.url();

    if (visitedUrls.has(currentUrl)) {
      throw new Error("Repeated page detected during bill-pay navigation.");
    }
    visitedUrls.add(currentUrl);

    if (!isTrustedDomain(currentUrl, trustedDomains)) {
      throw new Error(`Unapproved domain: ${currentUrl}`);
    }

    // Check if account number is already visible/selected on page
    const pageText = await page.locator("body").innerText();
    const accountMatched = accountNumber ? pageText.includes(accountNumber) : true;

    if (accountMatched) {
      console.log(`Property account number ${accountNumber || "N/A"} verified on page.`);
    } else {
      console.log(`Account number ${accountNumber} not yet active on view. Looking to select it...`);
      await stagehand.act(
        `Locate and select the property account or service address corresponding to account number ${accountNumber}. Click it to view that specific account's billing details.`
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Inspect if we are on the bill-pay page
    const { data: inspection } = await stagehand.extract(
      `Inspect the current page for ${vendorName}. Determine if this is the bill viewing or payment balance page. Look for current balance, statements, or invoice history. Do not click payment execution buttons.`,
      z.object({
        isBillPayPage: z.boolean(),
        explanation: z.string(),
      })
    );

    if (inspection.isBillPayPage) {
      console.log("\nBILL-PAY PAGE IDENTIFIED!");
      return { success: true, url: currentUrl, pageType: "BILLPAY_PAGE" };
    }

    console.log("Navigating to billing section...");

    const action = await stagehand.act(
      `You are navigating the authenticated customer account for ${vendorName}.
Find and click the billing, statements, or account balance link (e.g., Billing, View Bill, Pay My Bill, Account Balance).
Do not click final payment submission or authorization buttons.`
    );

    if (action?.data?.success !== true) {
      throw new Error("Could not identify a suitable billing navigation element.");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newUrl = await page.url();
    if (!isTrustedDomain(newUrl, trustedDomains)) {
      throw new Error(`Billing navigation reached an unapproved domain: ${newUrl}`);
    }

    if (newUrl === currentUrl) {
      throw new Error("Billing navigation did not change the page.");
    }
  }

  throw new Error("Bill-pay page was not found within five navigation steps.");
}