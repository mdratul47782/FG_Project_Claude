// app/fg/page.jsx
import FGEntryForm from "@/app/fgComponents/FGEntryForm";

export default function FGPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">
            Finished Goods Warehouse
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Entry creation, carton placement preview, and row allocation.
          </p>
        </div>

        <FGEntryForm />
      </div>
    </div>
  );
}
