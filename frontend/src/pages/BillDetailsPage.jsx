import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BillDetailsForm from "../components/BillDetailsForm";
import FinishBillPanel from "../components/FinishBillPanel";
import { useUserProfile } from "../hooks/useUserProfile";
import { useBillDetails } from "../hooks/useBillDetails";
import { canManageRecords } from "../utils/permissions";
import StatusBadge from "../components/StatusBadge";
import { formatCurrency, formatDate } from "../utils/format";
import { supabase } from "../../utils/supabase";

const UNFINISHED = ["needs_review", "extraction_failed"];

function BillDetailsPage() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const canEditRecords = canManageRecords(profile?.role);

  const { bill, loading, error, fetchBillDetails } = useBillDetails();
  const [paymentRecord, setPaymentRecord] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [showEditForm, setShowEditForm] = useState(false);
  const [signedInvoiceUrl, setSignedInvoiceUrl] = useState(null);
  
  const [approving, setApproving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [actionError, setActionError] = useState("");

  // State to hold the secure signed URL for private receipt PDFs
  const [signedReceiptUrl, setSignedReceiptUrl] = useState(null);

  const fetchPaymentDetails = useCallback(async (currentBillId) => {
    const { data } = await supabase
      .from("payment")
      .select("*")
      .eq("bill_id", currentBillId)
      .maybeSingle(); // Use maybeSingle() to avoid 406 error when no payment record exists yet
    if (data) setPaymentRecord(data);
  }, []);

  const fetchAuditTrail = useCallback(async (currentBillId) => {
    const { data } = await supabase
      .from("audit_trail")
      .select("*")
      .eq("bill_id", currentBillId)
      .order("created_at", { ascending: false });
    if (data) setAuditLogs(data);
  }, []);

  useEffect(() => {
    fetchBillDetails(billId).then(() => {
      if (billId) {
        fetchPaymentDetails(billId);
        fetchAuditTrail(billId);
      }
    });
  }, [billId, fetchBillDetails, fetchPaymentDetails, fetchAuditTrail]);

  // Generate a secure signed URL when payment record and receipt path become available
  useEffect(() => {
    async function getSignedReceipt() {
      if (paymentRecord?.receipt_url) {
        // Safeguard: If it's somehow a local file path or full URL, handle it gracefully
        if (
          paymentRecord.receipt_url.startsWith("file://") || 
          paymentRecord.receipt_url.startsWith("http://") || 
          paymentRecord.receipt_url.startsWith("https://")
        ) {
          setSignedReceiptUrl(paymentRecord.receipt_url);
          return;
        }

        // Otherwise, generate a secure signed URL from the private Supabase bucket
        const { data, error } = await supabase.storage
          .from("receipts")
          .createSignedUrl(paymentRecord.receipt_url, 3600); // Valid for 1 hour

        if (!error && data?.signedUrl) {
          setSignedReceiptUrl(data.signedUrl);
        } else {
          console.error("Failed to generate signed URL for receipt:", error?.message);
        }
      }
    }
    getSignedReceipt();
  }, [paymentRecord]);

  useEffect(() => {
    async function getSignedInvoice() {
      if (!bill?.file_path || bill.status === "paid") {
        setSignedInvoiceUrl(null);
        return;
      }

      const { data, error } = await supabase.storage
        .from("invoices")
        .createSignedUrl(bill.file_path, 3600);

      if (error) {
        console.error("Invoice signed URL error:", error);
        return;
      }

      setSignedInvoiceUrl(data.signedUrl);
    }

    getSignedInvoice();
  }, [bill?.file_path, bill?.status]);

  async function handleBillSaved(updatedBill) {
    setSuccessMessage(
      updatedBill?.status === "pending"
        ? "Bill saved and sent for approval."
        : "Bill updated successfully.",
    );
    setShowEditForm(false);
    if (updatedBill) {
      await fetchBillDetails(billId);
      await fetchAuditTrail(billId);
    }
  }

  async function handleApproveBill() {
    setApproving(true);
    setActionError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};

      const { error: funcError } = await supabase.functions.invoke("decide-bill", {
        body: { 
          billId: bill.id, 
          decision: "approved", 
          note: "Approved via frontend review dashboard." 
        },
        headers,
      });

      if (funcError) throw funcError;

      setSuccessMessage("Bill approved successfully! Ready for payment execution.");
      await fetchBillDetails(billId);
      await fetchAuditTrail(billId);
    } catch (err) {
      setActionError(err.message || "Failed to approve bill.");
    } finally {
      setApproving(false);
    }
  }

  async function handlePayBill() {
    setPaying(true);
    setActionError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("You must be logged in to execute payments.");
      }

      const { error: funcError } = await supabase.functions.invoke("execute-payment", {
        body: { billId: bill.id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (funcError) throw funcError;

      setSuccessMessage("Payment executed successfully via Stagehand! Receipt PDF extracted and saved.");
      await fetchBillDetails(billId);
      await fetchPaymentDetails(bill.id);
      await fetchAuditTrail(bill.id);
    } catch (err) {
      setActionError(err.message || "Payment execution failed on portal.");
    } finally {
      setPaying(false);
    }
  }

  const vendorName =
    bill?.vendor_account?.vendor?.name ||
    bill?.extracted_vendor_name ||
    bill?.extracted_data?.vendor_name ||
    "—";

  const serviceName = bill?.vendor_account?.service;
  const accountNumber = bill?.vendor_account?.account_number;

  const infoFields = [
    { label: "Invoice Number", value: bill?.invoice_number },
    { label: "Property", value: bill?.property?.name },
    { label: "Vendor", value: vendorName },
    {
      label: "Service / Account",
      value: accountNumber
        ? `${serviceName || "Service"} (Acct: ${accountNumber})`
        : serviceName,
    },
    { label: "Issue Date", value: formatDate(bill?.issue_date) },
    { label: "Due Date", value: formatDate(bill?.due_date) },
    { label: "Amount", value: formatCurrency(bill?.amount) },
    { label: "Status", value: <StatusBadge status={bill?.status} /> },
  ];

  const isUnfinished = bill && UNFINISHED.includes(bill.status);
  const canEdit = canEditRecords && bill?.status === "pending";

  // Use the secure signed URL for paid receipts, or fallback to public invoices bucket
  const activePdfUrl = bill?.status === "paid"
    ? signedReceiptUrl
    : signedInvoiceUrl;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate("/bills")}
          className="link text-sm"
        >
          ← Back to Bills
        </button>

        {canEdit && !loading && !error && (
          <button
            type="button"
            onClick={() => setShowEditForm(true)}
            className="btn-primary px-4 py-2 text-sm"
          >
            Edit Bill
          </button>
        )}
      </div>

      {successMessage && (
        <div role="status" className="alert-success mb-6">
          {successMessage}
        </div>
      )}

      {actionError && (
        <div role="alert" className="alert-error mb-6">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-600">
          Loading bill details...
        </div>
      ) : error ? (
        <div role="alert" className="alert-error">
          {error}
        </div>
      ) : !bill ? (
        <div className="py-16 text-center text-gray-600">Bill not found.</div>
      ) : (
        <>
          <section className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="page-title md:text-3xl">
                Invoice #{bill.invoice_number || "—"}
              </h1>
              <p className="page-subtitle">
                {vendorName} {serviceName ? `· ${serviceName}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={bill.status} />
            </div>
          </section>

          {/* Pending Approval Banner */}
          {bill.status === "pending" && canEditRecords && (
            <section className="card mt-6 border-l-4 border-amber-500 bg-amber-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-amber-900">Awaiting Approval</h3>
                  <p className="text-sm text-amber-700">
                    This bill has passed AI extraction and is pending your review. Click approve to authorize payment.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={approving}
                  onClick={handleApproveBill}
                  className="btn-primary px-6 py-3 text-sm font-semibold whitespace-nowrap bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {approving ? "Approving Bill..." : "Approve Bill"}
                </button>
              </div>
            </section>
          )}

          {/* Approved Payment Banner */}
          {bill.status === "approved" && canEditRecords && (
            <section className="card mt-6 border-l-4 border-emerald-500 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-emerald-900">Ready for Stagehand Automation</h3>
                  <p className="text-sm text-emerald-700">
                    This bill is approved. Click below to execute payment and automatically retrieve the PDF receipt.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={paying}
                  onClick={handlePayBill}
                  className="btn-primary px-6 py-3 text-sm font-semibold whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {paying ? "Automating Payment & Extracting Receipt..." : `Pay ${formatCurrency(bill.amount)} Now`}
                </button>
              </div>
            </section>
          )}

          {/* Paid Status: Receipt & Confirmation Details Card */}
          {bill.status === "paid" && (
            <section className="card mt-6 border-l-4 border-blue-500 bg-blue-50/40 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-blue-900 text-lg">Verified Payment Receipt</h3>
                  <p className="text-sm text-blue-700">Payment successfully processed and receipt PDF captured.</p>
                </div>
                <span className="badge bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold">PAID</span>
              </div>

              {paymentRecord ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 border-t border-blue-200 pt-4 text-sm">
                  <div>
                    <p className="text-gray-500">Confirmation Number</p>
                    <p className="font-mono font-bold text-gray-800">{paymentRecord.confirmation_number || "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Paid Amount</p>
                    <p className="font-semibold text-gray-800">{formatCurrency(paymentRecord.amount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Payment Method</p>
                    <p className="font-semibold text-gray-800 uppercase">{paymentRecord.method?.join(", ") || "ACH"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Processed On</p>
                    <p className="font-semibold text-gray-800">{formatDate(paymentRecord.attempted_at)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">Loading payment receipt details...</p>
              )}
            </section>
          )}

          {/* Bill Information & Metadata Section */}
          <section className="card mt-8">
            <h2 className="section-title mb-5">Bill Information</h2>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {infoFields.map(({ label, value }) => (
                <div key={label}>
                  <p className="text-sm text-gray-500">{label}</p>
                  <p className="mt-1 font-semibold">{value || "—"}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Document / Receipt PDF Viewer Section */}
          <section className="card mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">
                {bill.status === "paid" ? "Official Payment Receipt PDF" : "Original Invoice Document"}
              </h2>
              {activePdfUrl && (
                <a
                  href={activePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary px-4 py-2 text-xs font-medium"
                >
                  Download / Open PDF ↗
                </a>
              )}
            </div>

            {activePdfUrl ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                <iframe
                  src={`${activePdfUrl}#view=FitH`}
                  title="PDF Viewer"
                  className="w-full h-[600px] border-0"
                />
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500 text-sm">
                {bill.status === "paid" 
                  ? "Receipt PDF is being processed..." 
                  : "No document file attached to this bill record."}
              </div>
            )}
          </section>

          {/* Audit Trail History Log Section */}
          <section className="card mt-8">
            <h2 className="section-title mb-4">Audit Trail History</h2>
            {auditLogs.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-3 flex flex-wrap items-center justify-between gap-4 text-sm">
                    <div>
                      <span className="font-semibold uppercase tracking-wide text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 mr-3">
                        {log.action}
                      </span>
                      <span className="text-gray-800">
                        Status changed from <strong className="text-gray-600">{log.from_status || "none"}</strong> to <strong className="text-gray-900">{log.to_status}</strong>
                      </span>
                      {log.note && <p className="text-xs text-gray-500 mt-1 italic">Note: {log.note}</p>}
                    </div>
                    <span className="text-xs text-gray-400 font-mono">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4">No audit history recorded for this bill yet.</p>
            )}
          </section>

          {isUnfinished && (
            <section className="card mt-8">
              <h2 className="section-title">Finish this bill</h2>
              <FinishBillPanel
                key={`${bill.id}-${bill.status}`}
                bill={bill}
                onSaved={handleBillSaved}
              />
            </section>
          )}
        </>
      )}

      {canEdit && showEditForm && bill && (
        <div className="modal-overlay">
          <div className="my-auto w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Edit Bill</h2>
              <button
                type="button"
                onClick={() => setShowEditForm(false)}
                className="rounded-lg p-2 text-2xl leading-none text-gray-500 hover:text-black"
                aria-label="Close form"
              >
                &times;
              </button>
            </div>

            <BillDetailsForm
              key={bill.id}
              bill={bill}
              onSaved={handleBillSaved}
              onCancel={() => setShowEditForm(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default BillDetailsPage;