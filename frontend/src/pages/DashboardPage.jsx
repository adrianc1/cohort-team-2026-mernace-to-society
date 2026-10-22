import Sidebar from "../components/Sidebar"

function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8">
        <section className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Welcome Back, Robert
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              Review pending property bills, track expenses, and record
              payments.
            </p>
          </div>

          <div className="flex gap-3">
            <button className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700">
              + Add Bill
            </button>

            <button className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100">
              Add Property
            </button>

            <button className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100">
              Add Vendor
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default DashboardPage