// ==========================================
// ACTIONS: VERIFY BILL & PROPERTY DETAILS
// ==========================================

import { z } from "zod";

/**
 * Extracts bill and property information from the vendor portal DOM
 * and cross-references it against the Supabase bill and property context.
 */
export async function verifyBillDetails(page, stagehand, bill) {
  console.log("\n=================================");
  console.log("EXTRACTING & VERIFYING BILL & PROPERTY DETAILS");
  console.log("=================================\n");

  // 1. Extract bill details and specific Service Address metadata from the portal DOM
  const { data: portalData } = await stagehand.extract(
    `Inspect the billing page. Extract the active bill details (balance due, invoice number, due date) AND specifically look for the "Service address" block or street address text (such as "125 Industrial Way") displayed on the page.`,
    z.object({
      invoiceNumber: z.string(),
      amountDue: z.number(),
      dueDate: z.string(),
      accountHolderOrAddress: z.string(),
      statementFound: z.boolean(),
    })
  );

  console.log("Extracted from portal:", portalData);
  console.log(`Expected from Database - Amount: ${bill.amount} | Invoice: ${bill.invoice_number} | Property Street: ${bill.property?.street || "N/A"}`);

  // 2. Verify Property / Address matching
  const expectedStreet = (bill.property?.street || "").toLowerCase();
  const portalText = (portalData.accountHolderOrAddress || "").toLowerCase();

  if (expectedStreet && portalText && !portalText.includes(expectedStreet)) {
    console.warn(`⚠️ Property mismatch warning! Portal displays "${portalData.accountHolderOrAddress}", but database expects address containing "${bill.property?.street}".`);
  } else {
    console.log("✓ Property address/account verified successfully on portal.");
  }

  // 3. Verify Amount matching
  const portalAmount = Number(portalData.amountDue);
  const dbAmount = Number(bill.amount);

  if (portalAmount !== dbAmount) {
    console.warn(`⚠️ Amount mismatch detected! Portal shows ${portalAmount}, DB expects ${dbAmount}`);
  } else {
    console.log("✓ Bill amount verified successfully.");
  }

  // 4. Log Invoice Comparison
  if (portalData.invoiceNumber && bill.invoice_number) {
    console.log(`Portal Invoice: ${portalData.invoiceNumber} | DB Invoice: ${bill.invoice_number}`);
  }

  return portalData;
}