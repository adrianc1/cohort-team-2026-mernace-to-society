
import { Link } from "react-router-dom"

function Sidebar() {
  return (
    <aside className="flex min-h-screen w-64 shrink-0 flex-col border-r border-[#2B405D] bg-[#192D4A] px-5 py-6">
      <h1 className="mb-10 text-2xl font-bold text-white">
        PropBill
      </h1>

      <nav className="flex flex-1 flex-col gap-2">
        <Link
          to="/dashboard"
          className="block rounded-lg bg-[#2861C5] px-4 py-3 font-medium text-white"
        >
          Dashboard
        </Link>

        <Link
          to="/bills"
          className="block rounded-lg px-4 py-3 text-slate-100 transition hover:bg-[#2B405D]"
        >
          All Bills
        </Link>

        <Link
          to="/properties"
          className="block rounded-lg px-4 py-3 text-slate-100 transition hover:bg-[#2B405D]"
        >
          Properties
        </Link>

        <Link
          to="/vendors"
          className="block rounded-lg px-4 py-3 text-slate-100 transition hover:bg-[#2B405D]"
        >
          Vendors
        </Link>

        <Link
          to="/approvals"
          className="block rounded-lg px-4 py-3 text-slate-100 transition hover:bg-[#2B405D]"
        >
          Approvals
        </Link>
      </nav>

      <div className="border-t border-[#2B405D] pt-5">
        <Link
          to="/settings"
          className="mb-5 block rounded-lg px-4 py-3 text-slate-100 transition hover:bg-[#2B405D]"
        >
          Account Settings
        </Link>

        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#8A9BB6] font-semibold text-[#192D4A]">
            RS
          </div>

          <div>
            <p className="text-sm font-medium text-white">
              Robert Smith
            </p>
            <p className="text-xs text-slate-300">
              Admin
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
