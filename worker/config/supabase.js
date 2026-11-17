// ==========================================
// CONFIG: SUPABASE CLIENT & QUERIES
// ==========================================

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the project root folder
dotenv.config({
  path: path.join(__dirname, "../../.env"),
});

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables in worker configuration.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fetches the bill with property context, vendor account number, 
 * master vendor portal_url, and associated organization payment methods.
 */
export async function fetchBillWithContext(billId) {
  console.log(`\nFetching bill ID ${billId} with context from Supabase...`);

  const { data: bill, error } = await supabase
    .from("bill")
    .select(`
      id,
      amount,
      invoice_number,
      status,
      org_id,
      property:property_id (
        id,
        name,
        street,
        city,
        state,
        zip
      ),
      vendor_account:vendor_account_id (
        id,
        account_number,
        service,
        vendor:vendor_id (
          id,
          name,
          portal_url
        )
      )
    `)
    .eq("id", billId)
    .single();

  if (error || !bill) {
    throw new Error(`Failed to retrieve bill context: ${error?.message || "Bill not found"}`);
  }

  // Fetch saved payment methods using org_id safely
  let paymentMethods = [];
  if (bill.org_id) {
    const { data: pmData, error: pmError } = await supabase
      .from("payment_method")
      .select("id, type, name_on_card, card_number, account_number, expiration_date")
      .eq("org_id", bill.org_id);

    if (pmError) {
      console.warn("Could not fetch saved payment methods:", pmError.message);
    } else {
      paymentMethods = pmData || [];
    }
  } else {
    console.warn("⚠️ Bill record is missing org_id, skipping payment methods lookup.");
  }

  const portalUrl = bill.vendor_account?.vendor?.portal_url;

  if (!portalUrl) {
    throw new Error("Missing master portal_url for this vendor.");
  }

  console.log("Bill and vendor context retrieved successfully.");

  return {
    ...bill,
    portalUrl,
    accountNumber: bill.vendor_account?.account_number,
    vendorName: bill.vendor_account?.vendor?.name,
    property: bill.property,
    paymentMethods,
  };
}

/**
 * Writes execution history and status transitions back to the audit_trail table.
 */
export async function updateAudit({ billId, action, fromStatus, toStatus, note, userId = null }) {
  const { error } = await supabase.from("audit_trail").insert({
    bill_id: billId,
    user_id: userId,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    note,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to write audit trail record:", error.message);
  }
}