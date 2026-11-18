import { Link } from "react-router-dom";
import BillDetailsForm from "../components/BillDetailsForm";

function ManualBillIntakePage() {
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
        <BillDetailsForm allowCreateRecords />
      </section>
    </div>
  );
}

export default ManualBillIntakePage;
