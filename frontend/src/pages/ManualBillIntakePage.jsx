import { useState } from "react";
import { Link } from "react-router-dom";
import BillDetailsForm from "../components/BillDetailsForm";
import { formatCurrency, formatDate } from "../utils/format";

function ManualBillIntakePage() {
  // The bill create-bill just saved; replaces the form until "Add another bill"
  const [savedBill, setSavedBill] = useState(null);

  return (
    <div className="mx-auto max-w-3xl">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Add bill details manually</h1>
          <p className="page-subtitle">
            Enter the same details used when reviewing an uploaded bill.
          </p>
        </div>
        <Link to="/bills" className="link text-sm">
          &larr; Back to Bills
        </Link>
      </section>

      <section className="card mt-6">
        {savedBill ? (
          <div role="status" className="alert-success">
            <p className="font-semibold">
              {savedBill.status === "needs_review"
                ? "Saved for review"
                : "Sent for approval"}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {[
                savedBill.invoice_number && `Invoice ${savedBill.invoice_number}`,
                formatCurrency(savedBill.amount),
                savedBill.due_date && `due ${formatDate(savedBill.due_date)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Link to={`/bills/${savedBill.id}`} className="link">
                View bill
              </Link>
              <button
                type="button"
                onClick={() => setSavedBill(null)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Add another bill
              </button>
            </div>
          </div>
        ) : (
          <BillDetailsForm allowCreateRecords onSaved={setSavedBill} />
        )}
      </section>
    </div>
  );
}

export default ManualBillIntakePage;
