// ==========================================
// ACTIONS: EXECUTE BILL PAYMENT & GRAB RECEIPT
// ==========================================

import { z } from "zod";
import fetch from "node-fetch";

export async function executeBillPayment(page, stagehand, bill, supabase) {
  console.log("\n=================================");
  console.log("EXECUTING BILL PAYMENT & CAPTURING RECEIPT");
  console.log("=================================\n");

  console.log(`Target Amount: $${bill.amount}`);
  console.log(`Target Invoice: ${bill.invoice_number || "N/A"}`);

  const paymentMethods = bill.paymentMethods || [];
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

  // 2. Final submission and live execution
  console.log("\n🚀 Submitting live payment on vendor portal...");
  
  const submitAction = await stagehand.act(
    `Click the final "Submit Payment", "Pay Now", or "Authorize Payment" button to complete the transaction for $${bill.amount}.`
  );

  if (submitAction?.data?.success !== true) {
    throw new Error("Failed to click final payment submission button.");
  }

  // Wait briefly for the payment gateway response and confirmation screen to render
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 3. Extract page state to check success and extract confirmation + receipt link
  const { data: paymentResult } = await stagehand.extract(
    "Analyze the payment result on the screen. Determine if the payment was successful, extract the confirmation number, and look for a PDF receipt download link or button URL if available.",
    z.object({
      isSuccessful: z.boolean(),
      errorCode: z.string().optional(),
      errorMessage: z.string().optional(),
      confirmationNumber: z.string().optional(),
      receiptUrl: z.string().optional(),
      explanation: z.string(),
    })
  );

  console.log(`Payment Gateway Response: ${paymentResult.explanation}`);

  if (!paymentResult.isSuccessful) {
    const failureReason = paymentResult.errorMessage || paymentResult.errorCode || "Unknown gateway decline";
    throw new Error(`Payment failed on vendor portal: ${failureReason}`);
  }

  const confirmationNumber = paymentResult.confirmationNumber || `CONF-${Date.now()}`;
  console.log(`Payment successful! Confirmation: ${confirmationNumber}`);

  let receiptStoragePath = null;

  // 4. Download and store the PDF receipt if a link was found
  console.log("STAGEHAND RECEIPT URL:", paymentResult.receiptUrl);
  if (paymentResult.receiptUrl) {
    try {
      console.log(`Downloading receipt PDF from portal...`);
      const pdfResponse = await fetch(paymentResult.receiptUrl);
      
      if (pdfResponse.ok) {
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const fileName = `receipt-${bill.id}-${Date.now()}.pdf`;

        // Upload directly to your private Supabase 'receipts' bucket
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, Buffer.from(pdfBuffer), { contentType: "application/pdf" });

        if (!uploadError && uploadData) {
          receiptStoragePath = uploadData.path;
          console.log(`Receipt PDF securely stored at path: ${receiptStoragePath}`);
        } else {
          console.error(`Warning: Failed to upload PDF to storage:`, uploadError?.message);
        }
      }
    } catch (pdfErr) {
      console.error(`Non-fatal: Could not download receipt PDF:`, pdfErr.message);
    }
  }

  return {
    success: true,
    methodUsed: methodDescription,
    amountPaid: bill.amount,
    confirmationNumber: confirmationNumber,
    receiptUrl: receiptStoragePath, // Passed back to save into your payment table!
  };
}