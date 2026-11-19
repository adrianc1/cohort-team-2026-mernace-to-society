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
  const [auditError, setAuditError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showEditForm, setShowEditForm] = useState(false);
  const [signedInvoiceUrl, setSignedInvoiceUrl] = useState(null);
  const [signedReceiptUrl, setSignedReceiptUrl] = useState(null);
  
  const [approving, setApproving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [actionError, setActionError] = useState("");

  const fetchPaymentDetails = useCallback(async (currentBillId) => {
    const { data } = await supabase
      .from("payment")
      .select("*")
      .eq("bill_id", currentBillId)
      .maybeSingle();
    if (data) setPaymentRecord(data);
  }, []);

  const fetchAuditTrail = useCallback(async (currentBillId) => {
    const { data, error: auditFetchError } = await supabase.rpc(
      "get_bill_audit_history",
      { p_bill_id: currentBillId },
    );

    if (auditFetchError) {
      console.error("Failed to load bill audit history:", auditFetchError);
      setAuditLogs([]);
      setAuditError("Could not load audit history. Please try again.");
      return;
    }

    setAuditError("");
    setAuditLogs(data || []);
  }, []);

  function formatAuditValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  useEffect(() => {
    fetchBillDetails(billId).then(() => {
      if (billId) {
        fetchPaymentDetails(billId);
        fetchAuditTrail(billId);
      }
    });
  }, [billId, fetchBillDetails, fetchPaymentDetails, fetchAuditTrail]);

  // Generate secure signed URL for private receipt PDFs
  useEffect(() => {
    async function getSignedReceipt() {
      if (paymentRecord?.receipt_url) {
        if (
          paymentRecord.receipt_url.startsWith("file://") || 
          paymentRecord.receipt_url.startsWith("http://") || 
          paymentRecord.receipt_url.startsWith("https://")
        ) {
          setSignedReceiptUrl(paymentRecord.receipt_url);
          return;
        }

        const { data, error } = await supabase.storage
          .from("receipts")
          .createSignedUrl(paymentRecord.receipt_url, 3600);

        if (!error && data?.signedUrl) {
          setSignedReceiptUrl(data.signedUrl);
        }
      }
    }
    getSignedReceipt();
  }, [paymentRecord]);

  // Generate secure signed URL for original invoice PDFs
  useEffect(() => {
    async function getSignedInvoice() {
      if (!bill?.file_path) {
        setSignedInvoiceUrl(null);
        return;
      }

      const { data, error } = await supabase.storage
        .from("invoices")
        .createSignedUrl(bill.file_path, 3600);

      if (!error && data?.signedUrl) {
        setSignedInvoiceUrl(data.signedUrl);
      }
    }

    getSignedInvoice();
  }, [bill?.file_path]);

  async function handleBillSaved(updatedBill) {
    setSuccessMessage("Bill updated successfully.");
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
      const { error } = await supabase.functions.invoke("decide-bill", {
        body: {
          billId: bill.id,
          decision: "approved",
          note: null,
        },
      });

      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error || "Failed to approve bill.");
      }

      setSuccessMessage("Bill approved successfully! Ready for automated payment execution.");
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
      // Calls your local worker bridge server (worker/server.js running on port 3000)
      const response = await fetch("http://localhost:3000/api/trigger-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId: bill.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to trigger local worker.");

      setSuccessMessage("Payment automation triggered! Watch your terminal—Stagehand is executing the payment...");

      // Poll and refresh page after 10 seconds to show the new PAID status and receipt PDF
      setTimeout(async () => {
        await fetchBillDetails(billId);
        window.location.reload();
      }, 10000);

    } catch (err) {
      setActionError(err.message || "Failed to trigger payment execution.");
    } finally {
      setPaying(false);
    }
  }

  const vendorName = bill?.vendor_account?.vendor?.name || bill?.extracted_vendor_name || "—";
  const serviceName = bill?.vendor_account?.service;
  const accountNumber = bill?.vendor_account?.account_number;

  const infoFields = [
    { label: "Invoice Number", value: bill?.invoice_number },
    { label: "Property", value: bill?.property?.name },
    { label: "Vendor", value: vendorName },
    { label: "Service / Account", value: accountNumber ? `${serviceName || "Service"} (Acct: ${accountNumber})` : serviceName },
    { label: "Issue Date", value: formatDate(bill?.issue_date) },
    { label: "Due Date", value: formatDate(bill?.due_date) },
    { label: "Amount", value: formatCurrency(bill?.amount) },
    { label: "Status", value: <StatusBadge status={bill?.status} /> },
  ];

  const isUnfinished = bill && UNFINISHED.includes(bill.status);
  const canEdit = canEditRecords && bill?.status === "pending";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button type="button" onClick={() => navigate("/bills")} className="link text-sm">
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

      {successMessage && <div role="status" className="alert-success mb-6">{successMessage}</div>}
      {actionError && <div role="alert" className="alert-error mb-6">{actionError}</div>}

      {loading ? (
        <div className="py-16 text-center text-gray-600">Loading bill details...</div>
      ) : error ? (
        <div role="alert" className="alert-error">{error}</div>
      ) : !bill ? (
        <div className="py-16 text-center text-gray-600">Bill not found.</div>
      ) : (
        <>
          <section className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="page-title md:text-3xl">Invoice #{bill.invoice_number || "—"}</h1>
              <p className="page-subtitle">{vendorName} {serviceName ? `· ${serviceName}` : ""}</p>
            </div>
            <StatusBadge status={bill.status} />
          </section>

          {/* Pending Approval Banner */}
          {bill.status === "pending" && canEditRecords && (
            <section className="card mt-6 border-l-4 border-amber-500 bg-amber-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-amber-900">Awaiting Approval</h3>
                  <p className="text-sm text-amber-700">This bill has passed AI extraction and is pending your review. Click approve to authorize.</p>
                </div>
                <button
                  type="button"
                  disabled={approving}
                  onClick={handleApproveBill}
                  className="btn-primary px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                >
                  {approving ? "Approving..." : "Approve Bill"}
                </button>
              </div>
            </section>
          )}

          {/* Approved Banner & Pay Button */}
          {bill.status === "approved" && canEditRecords && (
            <section className="card mt-6 border-l-4 border-emerald-500 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-emerald-900">Bill Approved</h3>
                  <p className="text-sm text-emerald-700">Ready for automated payment execution and receipt capture.</p>
                </div>
                <button
                  type="button"
                  disabled={paying}
                  onClick={handlePayBill}
                  className="btn-primary px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {paying ? "Executing Automation..." : `Pay ${formatCurrency(bill.amount)} Now`}
                </button>
              </div>
            </section>
          )}

          {/* Paid Status & Payment Details Card */}
          {bill.status === "paid" && paymentRecord && (
            <section className="card mt-6 border-l-4 border-blue-500 bg-blue-50/40 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-blue-900 text-lg">Verified Payment Receipt</h3>
                  <p className="text-sm text-blue-700">Payment successfully processed and receipt PDF captured.</p>
                </div>
                <span className="badge bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold">PAID</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 border-t border-blue-200 pt-4 text-sm">
                <div><p className="text-gray-500">Confirmation Number</p><p className="font-mono font-bold text-gray-800">{paymentRecord.confirmation_number}</p></div>
                <div><p className="text-gray-500">Paid Amount</p><p className="font-semibold text-gray-800">{formatCurrency(paymentRecord.amount)}</p></div>
                <div><p className="text-gray-500">Payment Method</p><p className="font-semibold text-gray-800 uppercase">{paymentRecord.method?.join(", ")}</p></div>
                <div><p className="text-gray-500">Processed On</p><p className="font-semibold text-gray-800">{formatDate(paymentRecord.attempted_at)}</p></div>
              </div>
            </section>
          )}

          <section className="card mt-8">
            <h2 className="section-title mb-5">Bill Information</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {infoFields.map(({ label, value }) => (
                <div key={label}><p className="text-sm text-gray-500">{label}</p><p className="mt-1 font-semibold">{value || "—"}</p></div>
              ))}
            </div>
          </section>

          {/* Original Invoice PDF Viewer */}
          <section className="card mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Original Invoice Document</h2>
              {signedInvoiceUrl && (
                <a href={signedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary px-4 py-2 text-xs">
                  Open Invoice PDF ↗
                </a>
              )}
            </div>
            {signedInvoiceUrl ? (
              <iframe src={`${signedInvoiceUrl}#view=FitH`} title="Invoice PDF" className="w-full h-[600px] border-0 rounded-lg bg-gray-50" />
            ) : (
              <p className="text-sm text-gray-500 py-4">No invoice attached to this bill record.</p>
            )}
          </section>

          {/* Official Payment Receipt PDF Viewer (Shown when Paid) */}
          {bill.status === "paid" && (
            <section className="card mt-8 border-t-4 border-blue-500">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">Official Payment Receipt PDF</h2>
                {signedReceiptUrl && (
                  <a href={signedReceiptUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary px-4 py-2 text-xs">
                    Open Receipt PDF ↗
                  </a>
                )}
              </div>
              {signedReceiptUrl ? (
                <iframe src={`${signedReceiptUrl}#view=FitH`} title="Receipt PDF" className="w-full h-[600px] border-0 rounded-lg bg-gray-50" />
              ) : (
                <p className="text-sm text-gray-500 py-4">Receipt PDF loading or not yet captured.</p>
              )}
            </section>
          )}

          {/* Audit Trail History Log */}
          <section className="card mt-8">
            <h2 className="section-title mb-4">Audit Trail History</h2>
            {auditError ? (
              <p role="alert" className="alert-error">{auditError}</p>
            ) : auditLogs.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-3 flex flex-wrap justify-between items-center gap-4 text-sm">
                    <div>
                      <span className="font-semibold uppercase text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 mr-3">{log.action}</span>
                      <span className="text-gray-600">
                        {log.actor_name || "Unknown user"}
                      </span>
                      {log.from_status !== log.to_status && (
                        <p className="mt-1 text-gray-800">
                          Status changed from <strong className="text-gray-600">{log.from_status || "none"}</strong> to <strong className="text-gray-900">{log.to_status}</strong>
                        </p>
                      )}
                      {log.note && <p className="text-xs text-gray-500 mt-1 italic">Note: {log.note}</p>}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <dl className="mt-2 space-y-1 text-xs text-gray-600">
                          {Object.entries(log.details).map(([field, change]) => (
                            <div key={field}>
                              <dt className="inline font-semibold">{field}: </dt>
                              <dd className="inline">
                                {formatAuditValue(change.old)} → {formatAuditValue(change.new)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 font-mono">{new Date(log.created_at).toLocaleString()}</span>
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
              <FinishBillPanel key={`${bill.id}-${bill.status}`} bill={bill} onSaved={handleBillSaved} />
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
            <BillDetailsForm key={bill.id} bill={bill} onSaved={handleBillSaved} onCancel={() => setShowEditForm(false)} />
          </div>
        </div>
      )}
    </>
  );
}

export default BillDetailsPage;