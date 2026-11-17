// ==========================================
// ACTIONS: AUTHENTICATE CUSTOMER
// ==========================================

import { z } from "zod";

/**
 * Fills credentials and handles login submission, error detection, and MFA.
 */
export async function authenticateCustomer(page, stagehand) {
  console.log("\n=================================");
  console.log("AUTHENTICATING CUSTOMER");
  console.log("=================================\n");

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  const emailCount = await emailInput.count();
  const passwordCount = await passwordInput.count();

  if (emailCount !== 1 || passwordCount !== 1) {
    throw new Error("Could not identify exactly one email and password field.");
  }

  await emailInput.fill(process.env.PORTAL_EMAIL);
  await passwordInput.fill(process.env.PORTAL_PASSWORD);
  console.log("Credentials entered successfully.");

  console.log("Identifying login button...");
  const loginAction = await stagehand.act(
    "Identify the actual Sign In or Login button belonging to the customer login form. The email and password fields have already been filled. Click only that login button. Do not click registration, password recovery, payment, or unrelated buttons."
  );

  if (loginAction?.data?.success !== true) {
    throw new Error("Stagehand could not confirm the login button action.");
  }

  console.log("Waiting for authentication response...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const pageText = (await page.locator("body").innerText()).toLowerCase();

  const loginErrors = [
    "invalid password",
    "incorrect password",
    "invalid credentials",
    "login failed",
    "unable to sign in",
    "incorrect email",
  ];

  if (loginErrors.some((err) => pageText.includes(err))) {
    throw new Error("The website reported a login error.");
  }

  const mfaKeywords = [
    "verification code",
    "two-factor authentication",
    "multi-factor authentication",
    "authenticator app",
    "verify your identity",
  ];

  if (mfaKeywords.some((keyword) => pageText.includes(keyword))) {
    return { success: false, status: "MFA_REQUIRED" };
  }

  // Ask Stagehand to verify the resulting page state
  const { data: verification } = await stagehand.extract(
    "Inspect the current website after login submission. Determine whether the customer is authenticated. Look for visible account identity, dashboard, account menu, or sign-out controls. Do not click anything.",
    z.object({
      authenticated: z.boolean(),
      evidence: z.string(),
      mfaRequired: z.boolean(),
    })
  );

  if (verification.mfaRequired) {
    return { success: false, status: "MFA_REQUIRED" };
  }

  if (!verification.authenticated) {
    throw new Error("Customer authentication could not be verified.");
  }

  console.log("Customer authentication verified.");
  return { success: true, status: "AUTHENTICATED" };
}