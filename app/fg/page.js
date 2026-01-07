// app/fg/page.jsx
import FGEntryForm from "@/app/fgComponents/FGEntryForm";

export default function FGPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ✅ wider container so Form + PlacementInfo + GraphicalPane fit side-by-side */}
      <div className="mx-auto max-w-screen-2xl px-3 py-0.5">
        <div className="mb-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">Finished Goods Warehouse</h1>
          <p className="mt-1 text-sm text-slate-600">Entry creation, carton placement preview, and row allocation.</p>
        </div>

        <FGEntryForm />
      </div>
    </div>
  );
}
