// ==========================================
// ACTIONS: EXECUTE BILL PAYMENT WITH ERROR DETECTION
// ==========================================

import { z } from "zod";

export async function executeBillPayment(page, stagehand, bill) {
  console.log("\n=================================");
  console.log("EXECUTING BILL PAYMENT & CHECKING FAILURES");
  console.log("=================================\n");

  console.log(`Target Amount: $${bill.amount}`);
  console.log(`Target Invoice: ${bill.invoice_number || "N/A"}`);

  const paymentMethods = bill.paymentMethods || [];
  console.log(`Found ${paymentMethods.length} saved payment method(s) in Supabase.`);

  const selectedMethod = paymentMethods[0];

  if (!selectedMethod) {
    throw new Error("No saved payment methods found in Supabase for this organization.");
  }

  const rawNumber = selectedMethod.card_number || selectedMethod.account_number || "";
  const lastFour = rawNumber.slice(-4) || "0000";
  const methodType = selectedMethod.type || "card";

  const methodDescription = `${methodType} ending in ${lastFour}`;
  console.log(`\nSelected Payment Method from DB: ${methodDescription}`);

  // 1. Select the payment method on the portal
  console.log("Selecting payment method on vendor portal...");
  const paymentMethodAction = await stagehand.act(
    `On the payment screen, select the payment method corresponding to: ${methodDescription}. Look for cards or bank accounts matching these details and click to select it.`
  );

  if (paymentMethodAction?.data?.success !== true) {
    throw new Error(`Stagehand could not select the payment method: ${methodDescription}`);
  }

  console.log("Payment method selected successfully.");

  // 2. Final submission and error checking
  console.log("\n⚠️ SAFETY CHECK: Ready to submit payment.");
  
  /* 
  // UNCOMMENT BELOW FOR LIVE PRODUCTION EXECUTION:
  
  console.log("Submitting payment on vendor portal...");
  const submitAction = await stagehand.act(
    `Click the final "Submit Payment", "Pay Now", or "Authorize Payment" button to complete the transaction for $${bill.amount}.`
  );

  if (submitAction?.data?.success !== true) {
    throw new Error("Failed to click final payment submission button.");
  }

  // Wait briefly for the payment gateway response
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // Extract page state to check for success or card decline errors
  const { data: paymentResult } = await stagehand.extract(
    "Analyze the payment result on the screen. Determine if the payment was successful, or if there was an error such as a card decline, insufficient funds, or invalid expiration date.",
    z.object({
      isSuccessful: z.boolean(),
      errorCode: z.string().optional(),
      errorMessage: z.string().optional(),
      confirmationNumber: z.string().optional(),
      explanation: z.string(),
    })
  );

  console.log(`Payment Gateway Response: ${paymentResult.explanation}`);

  if (!paymentResult.isSuccessful) {
    const failureReason = paymentResult.errorMessage || paymentResult.errorCode || "Unknown gateway decline";
    throw new Error(`Payment failed on vendor portal: ${failureReason}`);
  }

  console.log(`Payment successful! Confirmation: ${paymentResult.confirmationNumber || "N/A"}`);
  
  return {
    success: true,
    methodUsed: methodDescription,
    amountPaid: bill.amount,
    confirmationNumber: paymentResult.confirmationNumber,
  };
  */

  console.log("Payment simulation complete (live submission commented out for testing).");

  return {
    success: true,
    methodUsed: methodDescription,
    amountPaid: bill.amount,
  };
}