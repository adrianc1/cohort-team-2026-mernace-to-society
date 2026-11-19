// ==========================================
// CONFIG: SUPABASE CLIENT & QUERIES
// ==========================================

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * master vendor portal_url, and available payment methods (bypassing org_id).
 */
export async function fetchBillWithContext(billId) {
  console.log(`\nFetching bill ID ${billId} with context from Supabase...`);

  const { data: bill, error: billError } = await supabase
    .from("bill")
    .select("*")
    .eq("id", billId)
    .single();

  if (billError || !bill) {
    throw new Error(`Failed to retrieve bill: ${billError?.message || "Bill not found"}`);
  }

  let property = null;
  if (bill.property_id) {
    const { data: propData } = await supabase
      .from("property")
      .select("id, name, street, city, state, zip")
      .eq("id", bill.property_id)
      .maybeSingle();
    property = propData;
  }

  let vendorAccount = null;
  let vendor = null;
  if (bill.vendor_account_id) {
    const { data: vaData } = await supabase
      .from("vendor_account")
      .select("id, account_number, service, vendor_id")
      .eq("id", bill.vendor_account_id)
      .maybeSingle();
    
    vendorAccount = vaData;

    if (vaData?.vendor_id) {
      const { data: vData } = await supabase
        .from("vendor")
        .select("id, name, portal_url")
        .eq("id", vaData.vendor_id)
        .maybeSingle();
      vendor = vData;
    }
  }

  // Fetch available payment methods directly (ignoring org_id)
  let paymentMethods = [];
  const { data: pmData, error: pmError } = await supabase
    .from("payment_method")
    .select("id, type, name_on_card, card_number, account_number, expiration_date");

  if (pmError) {
    console.warn("Could not fetch saved payment methods:", pmError.message);
  } else {
    paymentMethods = pmData || [];
    console.log(`Loaded ${paymentMethods.length} payment method(s) from table.`);
  }

  const portalUrl = vendor?.portal_url || bill.bill_url;

  if (!portalUrl) {
    throw new Error("Missing master portal_url for this vendor or bill.");
  }

  console.log("Bill and vendor context retrieved successfully.");

  return {
    ...bill,
    portalUrl,
    accountNumber: vendorAccount?.account_number || bill.extracted_account_number,
    vendorName: vendor?.name || bill.extracted_vendor_name || "Unknown Vendor",
    property,
    paymentMethods,
  };
}

/**
 * Writes execution history and status transitions back to the audit_trail table with safe userId handling.
 */
export async function updateAudit({ billId, action, fromStatus, toStatus, note, userId = null }) {
  const cleanUserId = userId && userId !== "null" && userId !== "undefined" ? userId : null;

  const { error } = await supabase.from("audit_trail").insert({
    bill_id: billId,
    user_id: cleanUserId,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    note,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to write audit trail record:", error.message);
  } else {
    console.log(`Audit trail recorded: [${action}] ${fromStatus || "start"} -> ${toStatus}`);
  }
}