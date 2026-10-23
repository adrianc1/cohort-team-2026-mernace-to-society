
import Sidebar from "../components/Sidebar"

function PropertiesPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <main className="min-w-0 flex-1 p-8">
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Properties
            </h2>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="rounded-lg bg-[#192D4A] px-5 py-3 text-sm font-medium text-white hover:bg-blue-700">
              + Add Property
            </button>
          </div>
        </section>
        <section className="mt-8 flex flex-row gap-4">
          <div className="overflow-hidden rounded-2xl border border-gray-300 bg-white p-8 w-60">
            <h4 className="text-gray-600" >Total Properties</h4>
            <p className="text-[#192D4A] text-3xl pt-3 pb-3">12</p>
            <p className="text-gray-600">Across 4 property types</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-300 bg-white p-8 w-60">
            <h4 className="text-gray-600">Residential</h4>
            <p className="text-[#192D4A] text-3xl pt-3 pb-3">4</p>
            <p className="text-gray-600">60 units total</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-300 bg-white p-8 w-60">
            <h4 className="text-gray-600">Commercial</h4>
            <p className="text-[#192D4A] text-3xl pt-3 pb-3">3</p>
            <p className="text-gray-600">22,400 sq ft</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-300 bg-white p-8 w-60">
            <h4 className="text-gray-600">Active Properties</h4>
            <p className="text-[#192D4A] text-3xl pt-3 pb-3">12</p>
            <p className="text-gray-600">All properties active</p>
          </div>
        </section>
        <section className="mt-8">
          <h3 className="text-xl">Properties by type</h3>
        </section>
      </main>
    </div>
  )
}

export default PropertiesPage
