// ==========================================
// ACTIONS: VERIFY BILL DETAILS
// ==========================================

import { z } from "zod";

/**
 * Extracts current invoice data from the active bill-pay page using Stagehand
 * and cross-references it against the database bill record.
 */
export async function verifyBillDetails(page, stagehand, bill) {
  console.log("\n=================================");
  console.log("EXTRACTING & VERIFYING BILL DETAILS");
  console.log("=================================\n");

  // Ask Stagehand to extract current balance and invoice number from the DOM
  const { data: extracted } = await stagehand.extract(
    "Extract the current active bill details from this page. Look for the current balance due, amount due, invoice number, and due date.",
    z.object({
      invoiceNumber: z.string().nullable(),
      amountDue: z.number().nullable(),
      dueDate: z.string().nullable(),
      statementFound: z.boolean(),
    })
  );

  console.log("Extracted from portal:", extracted);
  console.log("Expected from Database - Amount:", bill.amount, "| Invoice:", bill.invoice_number);

  if (!extracted.statementFound) {
    throw new Error("Could not find an active statement or balance on the bill page.");
  }

  // Cross-reference amount if available (allowing for minor float formatting differences)
  if (extracted.amountDue !== null && bill.amount !== null) {
    const diff = Math.abs(Number(extracted.amountDue) - Number(bill.amount));
    if (diff > 0.05) {
      console.warn(`⚠️ Amount mismatch detected! Portal shows ${extracted.amountDue}, DB expects ${bill.amount}`);
    } else {
      console.log("✓ Bill amount verified successfully.");
    }
  }

  return {
    success: true,
    extracted,
  };
}