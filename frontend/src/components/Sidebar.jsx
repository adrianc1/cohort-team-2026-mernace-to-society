
import { Link } from "react-router-dom"

function Sidebar() {
  return (
    <aside className="flex min-h-screen w-64 flex-col border-r bg-white px-5 py-6">
      <h1 className="mb-10 text-2xl font-bold text-blue-700">
        PropBill
      </h1>

      <nav className="flex flex-col flex-1 space-y-2">
        <Link
          to="/dashboard"
          className="block rounded-lg bg-blue-50 px-4 py-3 font-medium text-blue-700"
        >
          Dashboard
        </Link>

        <Link
          to="/bills"
          className="block rounded-lg px-4 py-3 text-gray-600 hover:bg-gray-100"
        >
          All Bills
        </Link>

        <Link
          to="/properties"
          className="block rounded-lg px-4 py-3 text-gray-600 hover:bg-gray-100"
        >
          Properties
        </Link>

        <Link
          to="/vendors"
          className="block rounded-lg px-4 py-3 text-gray-600 hover:bg-gray-100"
        >
          Vendors
        </Link>

        <Link
          to="/approvals"
          className="block rounded-lg px-4 py-3 text-gray-600 hover:bg-gray-100"
        >
          Approvals
        </Link>
      </nav>

      <div className="border-t pt-5">
        <Link
          to="/settings"
          className="mb-5 block text-sm text-gray-600 hover:text-blue-700"
        >
          Account Settings
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-700">
            RS
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900">
              Robert Smith
            </p>
            <p className="text-xs text-gray-500">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
