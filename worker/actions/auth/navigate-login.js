// ==========================================
// ACTIONS: NAVIGATE TO LOGIN PAGE
// ==========================================

import { z } from "zod";
import { isTrustedDomain } from "../../utils/security.js";

/**
 * Inspects the current page state using Stagehand.
 */
async function inspectCurrentPage(page, stagehand, vendorName) {
  const currentUrl = await page.url();
  const pageTitle = await page.title();

  const emailCount = await page.locator('input[type="email"]').count();
  const passwordCount = await page.locator('input[type="password"]').count();

  if (emailCount > 0 && passwordCount > 0) {
    return {
      pageType: "LOGIN_PAGE",
      explanation: "Email and password input fields are visible on the page.",
    };
  }

  const { data: inspection } = await stagehand.extract(
    `You are inspecting the website for ${vendorName}.
Current URL: ${currentUrl}
Page title: ${pageTitle}

Classify the current page:
- LOGIN_PAGE: A username/email and password sign-in form is currently visible.
- LOGIN_NAVIGATION: A button, link, or tab explicitly labeled "Sign In", "Log In", or "Customer Portal" is visible to access login.
- DASHBOARD: The user is already logged in.
- BILLPAY_PAGE: Bill viewing or payment sections are visible.
- MFA_REQUIRED: Multi-factor verification is requested.
- OTHER: None of the above.`,
    z.object({
      pageType: z.enum([
        "LOGIN_PAGE",
        "LOGIN_NAVIGATION",
        "DASHBOARD",
        "BILLPAY_PAGE",
        "MFA_REQUIRED",
        "OTHER",
      ]),
      explanation: z.string(),
    })
  );

  return inspection;
}

/**
 * Guides Stagehand from the portal landing page to the login form.
 */
export async function navigateToLogin(page, stagehand, vendorName, trustedDomains) {
  console.log("\n=================================");
  console.log("NAVIGATING TO LOGIN PAGE");
  console.log("=================================\n");

  const visitedStates = new Set();

  for (let step = 1; step <= 6; step++) {
    console.log(`Navigation step ${step} of 6`);

    // Use full URL including hash state for state tracking
    const currentState = await page.evaluate(() => window.location.href);

    if (visitedStates.has(currentState)) {
      console.log("State already visited, forcing a different interaction or waiting...");
    } else {
      visitedStates.add(currentState);
    }

    const currentDomain = await page.url();
    if (!isTrustedDomain(currentDomain, trustedDomains)) {
      throw new Error(`Untrusted website encountered: ${currentDomain}`);
    }

    const inspection = await inspectCurrentPage(page, stagehand, vendorName);
    console.log(`Page inspection classification: ${inspection.pageType} (${inspection.explanation})`);

    if (inspection.pageType === "LOGIN_PAGE") {
      console.log("\nLOGIN PAGE FOUND!");
      return { success: true, pageType: "LOGIN_PAGE", url: currentState };
    }

    if (inspection.pageType === "MFA_REQUIRED") {
      return { success: false, pageType: "MFA_REQUIRED", url: currentState };
    }

    console.log("Searching for and clicking the Sign In / Login button...");

    const action = await stagehand.act(
      `You are on the website for ${vendorName}. 
Your goal is to reach the customer sign-in form. 
Find and click the specific button or link that opens or leads to the "Sign In" or "Log In" view. 
Do not click register, create account, pay bill without logging in, or footer links.`
    );

    if (action?.data?.success !== true) {
      throw new Error("Stagehand could not interact with the login navigation element.");
    }

    // Give the Single Page App / router time to render the new view
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error("Login page was not found within the maximum navigation steps.");
}