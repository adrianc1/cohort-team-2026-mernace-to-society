import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BillDetailsForm from "../components/BillDetailsForm";
import FinishBillPanel from "../components/FinishBillPanel";
import { useUserProfile } from "../hooks/useUserProfile";
import { useBillDetails } from "../hooks/useBillDetails";
import { canManageRecords } from "../utils/permissions";
import StatusBadge from "../components/StatusBadge";
import { formatCurrency, formatDate } from "../utils/format";
import { supabase } from "../../utils/supabase";

// Saved bills that can't go to approval until someone fills in what's missing
const UNFINISHED = ["needs_review", "extraction_failed"];

// Only link to real web pages, never javascript: or other schemes
function isWebUrl(url) {
  return /^https?:\/\//i.test(url ?? "");
}

function BillDetailsPage() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const canEditRecords = canManageRecords(profile?.role);

  const { bill, loading, error, fetchBillDetails } = useBillDetails();
  const [successMessage, setSuccessMessage] = useState("");
  const [showEditForm, setShowEditForm] = useState(false);
  
  // Action and execution states
  const [approving, setApproving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    fetchBillDetails(billId);
  }, [billId, fetchBillDetails]);

  async function handleBillSaved(updatedBill) {
    setSuccessMessage(
      updatedBill?.status === "pending"
        ? "Bill saved and sent for approval."
        : "Bill updated successfully.",
    );
    setShowEditForm(false);
    if (updatedBill) {
      await fetchBillDetails(billId);
    }
  }

  // Calls your decide-bill Edge Function to approve the bill
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
    } catch (err) {
      setActionError(err.message || "Failed to approve bill.");
    } finally {
      setApproving(false);
    }
  }

  // Calls your payment execution pipeline with the explicit auth session token
  async function handlePayBill() {
    setPaying(true);
    setActionError("");
    try {
      // 1. Fetch active session token to satisfy verify_jwt = true in config.toml
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("You must be logged in to execute payments.");
      }

      // 2. Invoke execute-payment edge function with authorization header
      const { error: funcError } = await supabase.functions.invoke("execute-payment", {
        body: { billId: bill.id },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (funcError) throw funcError;

      setSuccessMessage("Payment executed successfully! Receipt and audit record saved.");
      await fetchBillDetails(billId);
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

  return (
    <>
      {/* Back Navigation & Edit Action Header */}
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
          {/* Bill Header */}
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

          {/* Pending Status: Approval Banner */}
          {bill.status === "pending" && canEditRecords && (
            <section className="card mt-6 border-l-4 border-amber-500 bg-amber-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-amber-900">Awaiting Approval</h3>
                  <p className="text-sm text-amber-700">
                    This bill has passed AI extraction and is pending your review. Click approve to authorize payment execution.
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

          {/* Approved Status: Payment Banner */}
          {bill.status === "approved" && canEditRecords && (
            <section className="card mt-6 border-l-4 border-emerald-500 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-emerald-900">Bill Approved & Ready for Payment</h3>
                  <p className="text-sm text-emerald-700">
                    This bill is approved. Click below to execute payment and generate your receipt.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={paying}
                  onClick={handlePayBill}
                  className="btn-primary px-6 py-3 text-sm font-semibold whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {paying ? "Processing Payment..." : `Pay ${formatCurrency(bill.amount)} Now`}
                </button>
              </div>
            </section>
          )}

          {/* Bill Information Section */}
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

            {isWebUrl(bill.bill_url) && (
              <div className="mt-6 border-t border-secondary pt-4">
                <p className="text-sm text-gray-500">Bill URL</p>
                <p className="mt-1">
                  <a
                    href={bill.bill_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link text-sm break-all"
                  >
                    {bill.bill_url}
                  </a>
                </p>
              </div>
            )}

            {bill.review_reason && !isUnfinished && (
              <div className="mt-6 border-t border-secondary pt-4">
                <p className="text-sm text-gray-500">
                  Review Comments / Reason
                </p>
                <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                  {bill.review_reason}
                </p>
              </div>
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

      {/* Edit Bill Modal */}
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