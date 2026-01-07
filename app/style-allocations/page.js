"use client";

import { useEffect, useMemo, useState } from "react";
import GraphicalPane from "../fgComponents/GraphicalPane";
import { Search, Trash2, Save, ArrowRightLeft } from "lucide-react";

const BUYERS = [
  "Decathlon - knit",
  "Decathlon - woven",
  "walmart",
  "Columbia",
  "ZXY",
  "CTC",
  "DIESEL",
  "Sports Group Denmark",
  "Identity",
  "Fifth Avenur",
];

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function cartonCbm(dim) {
  const w = n(dim?.w);
  const l = n(dim?.l);
  const h = n(dim?.h);
  return (w * l * h) / 1_000_000;
}

function sizesPerCartonText(sizes) {
  if (!Array.isArray(sizes) || !sizes.length) return "—";
  return sizes.map((r) => `${r.size}:${n(r.qty)}`).join(", ");
}

// ✅ sizes.qty is per carton => pieces per size = qty * cartonQty
function piecesBySizeFromEntry(entry) {
  const cartonQty = n(entry?.cartonQty);
  const sizes = Array.isArray(entry?.sizes) ? entry.sizes : [];
  const m = {};
  for (const r of sizes) {
    const size = String(r?.size || "").trim();
    const perCarton = n(r?.qty);
    if (!size || perCarton <= 0) continue;
    m[size] = (m[size] || 0) + perCarton * cartonQty;
  }
  return m;
}

export default function StyleAllocationsPage() {
  const [warehouse, setWarehouse] = useState("B1");
  const [style, setStyle] = useState("");
  const [buyer, setBuyer] = useState(""); // "" => all buyers
  const [color, setColor] = useState(""); // "" => all colors

  const [selectedRow, setSelectedRow] = useState(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const [poEdits, setPoEdits] = useState({});
  const [savingPoId, setSavingPoId] = useState("");

  const [paneRefreshKey, setPaneRefreshKey] = useState(0); // ✅ force GraphicalPane reload after PO save

  const highlightEntryIds = useMemo(() => data?.entryIds || [], [data]);
  const selectedRowId = selectedRow?._id ? String(selectedRow._id) : "";

  useEffect(() => {
    const next = {};
    for (const e of data?.entries || []) next[e._id] = e.poNumber || "";
    setPoEdits(next);
  }, [data?.entries]);

  // ✅ Buyer totals + Buyer×Size table (from current search result)
  const buyerSummary = useMemo(() => {
    const entries = data?.entries || [];
    const byBuyer = new Map(); // buyer -> { cartons, pcs, cbm, bySize:{} }

    for (const e of entries) {
      const b = String(e?.buyer || "Unknown");
      const prev = byBuyer.get(b) || { buyer: b, cartons: 0, pcs: 0, cbm: 0, bySize: {} };

      prev.cartons += n(e.cartonQty);
      prev.pcs += n(e.totalQty);
      prev.cbm += cartonCbm(e.cartonDimCm) * n(e.cartonQty);

      const pcsBySize = piecesBySizeFromEntry(e);
      for (const [sz, qty] of Object.entries(pcsBySize)) {
        prev.bySize[sz] = (prev.bySize[sz] || 0) + n(qty);
      }

      byBuyer.set(b, prev);
    }

    const rows = Array.from(byBuyer.values()).sort((a, b) => b.cartons - a.cartons);

    // sizes order uses API order if present (best)
    const sizes = data?.sizes?.length
      ? data.sizes
      : Array.from(
          new Set(rows.flatMap((r) => Object.keys(r.bySize || {})))
        ).sort();

    return { rows, sizes };
  }, [data?.entries, data?.sizes]);

  async function search() {
    setErr("");
    setData(null);

    const s = style.trim();
    if (!s) return setErr("Please enter style number.");

    setLoading(true);
    try {
      const qs = new URLSearchParams({ warehouse, style: s });
      if (buyer) qs.set("buyer", buyer);
      if (color.trim()) qs.set("color", color.trim());

      const res = await fetch(`/api/styles/search?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Search failed");

      setData(json);
    } catch (e) {
      setErr(e?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function savePo(entryId) {
    try {
      const poNumber = String(poEdits?.[entryId] || "").trim();
      setSavingPoId(entryId);

      const res = await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poNumber }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "PO update failed");

      // ✅ update left list immediately
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: (prev.entries || []).map((e) => (e._id === entryId ? { ...e, poNumber } : e)),
        };
      });

      // ✅ force right GraphicalPane to refetch /api/entries so tooltip shows new PO
      setPaneRefreshKey((x) => x + 1);
    } catch (e) {
      alert("Error: " + (e?.message || "PO update failed"));
    } finally {
      setSavingPoId("");
    }
  }

  async function bulkDeleteAllocations() {
    try {
      if (!data?.counts?.allocatedCount) {
        alert("No allocated entries found for this filter.");
        return;
      }

      const ok = confirm(
        `Delete ALL allocations for:\nWarehouse: ${warehouse}\nStyle: ${style.trim()}\nBuyer: ${
          buyer || "ALL"
        }\nColor: ${color.trim() || "ALL"}\n\nThis will set matching entries back to DRAFT.`
      );
      if (!ok) return;

      const res = await fetch("/api/styles/allocations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse, style: style.trim(), buyer, color: color.trim() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Delete failed");

      alert(`Done!\nDeleted allocations: ${json.deletedAllocations}\nUpdated entries: ${json.updatedEntries}`);
      await search();
    } catch (e) {
      alert("Error: " + (e?.message || "Delete failed"));
    }
  }

  async function reallocateToSelectedRow() {
    try {
      if (!data?.entries?.length) return alert("Search first.");
      if (!selectedRowId) return alert("Select a row from the right side first.");

      const ok = confirm(
        `Reallocate ALL matching entries to selected row?\n\nWarehouse: ${warehouse}\nStyle: ${style.trim()}\nBuyer: ${
          buyer || "ALL"
        }\nColor: ${color.trim() || "ALL"}\nRow: ${selectedRow?.name || selectedRowId}\n\nThis will MOVE previous allocations.`
      );
      if (!ok) return;

      const res = await fetch("/api/styles/reallocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse,
          style: style.trim(),
          buyer,
          color: color.trim(),
          rowId: selectedRowId,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Reallocate failed");

      alert(
        `Done!\nDeleted old allocations: ${json.deletedAllocations}\nCreated allocations: ${json.createdAllocations}\nUpdated entries: ${json.updatedEntries}`
      );

      await search();
    } catch (e) {
      alert("Error: " + (e?.message || "Reallocate failed"));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LEFT */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-slate-900">Style Allocation Search</div>
            <div className="text-xs text-slate-500">
              Warehouse + Style + (optional Buyer / Color). Select a row on the right to reallocate.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={search}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold ${
                loading ? "bg-slate-200 text-slate-500" : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              <Search className="h-4 w-4" />
              {loading ? "Searching..." : "Search"}
            </button>

            <button
              onClick={reallocateToSelectedRow}
              disabled={!data?.entries?.length || !selectedRowId}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold ${
                data?.entries?.length && selectedRowId
                  ? "bg-indigo-600 text-white hover:bg-indigo-500"
                  : "bg-slate-200 text-slate-500"
              }`}
              title="Move these filtered entries into the selected row"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Reallocate → Selected Row
            </button>

            <button
              onClick={bulkDeleteAllocations}
              disabled={!data?.counts?.allocatedCount}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold ${
                data?.counts?.allocatedCount ? "bg-rose-600 text-white hover:bg-rose-500" : "bg-slate-200 text-slate-500"
              }`}
              title="Delete all allocations in current results"
            >
              <Trash2 className="h-4 w-4" />
              Delete All Allocations
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="grid gap-1.5">
            <div className="text-xs font-bold text-slate-700">Warehouse</div>
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
            </select>
          </label>

          <label className="grid gap-1.5">
            <div className="text-xs font-bold text-slate-700">Style</div>
            <input className="input" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. 350836" />
          </label>

          <label className="grid gap-1.5">
            <div className="text-xs font-bold text-slate-700">Buyer</div>
            <select className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)}>
              <option value="">All buyers</option>
              {BUYERS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <div className="text-xs font-bold text-slate-700">Color</div>
            <input className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="All colors if empty" />
          </label>
        </div>

        {selectedRowId ? (
          <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
            Selected Row: <span className="font-extrabold">{selectedRow?.name || selectedRowId}</span>
            <span className="ml-2 text-xs text-indigo-700">(click another row on the right to change)</span>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            No row selected yet — click a row card on the right.
          </div>
        )}

        {err ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{err}</div> : null}

        {data ? (
          <>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-extrabold text-slate-900">
                Warehouse: {data.query.warehouse} • Style: {data.query.style} • Buyer: {data.query.buyer} • Color: {data.query.color}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Entries: <span className="font-bold">{data.counts.totalEntries}</span> • Allocated:{" "}
                <span className="font-bold">{data.counts.allocatedCount}</span>
              </div>
            </div>

            {/* ✅ RESTORED: Date × Size table (pieces) */}
            {data?.sizes?.length ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[680px] w-full text-sm">
                  <thead>
                    <tr className="bg-white">
                      <th className="px-3 py-2 text-left text-xs font-extrabold text-slate-600">Date</th>
                      {data.sizes.map((s) => (
                        <th key={s} className="px-3 py-2 text-right text-xs font-extrabold text-slate-600">
                          {s}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right text-xs font-extrabold text-slate-600">Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(data.rows || []).map((r) => (
                      <tr key={r.dateKey} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-bold text-slate-800">{r.date}</td>
                        {data.sizes.map((s) => (
                          <td key={s} className="px-3 py-2 text-right text-slate-700">
                            {n(r.bySize?.[s]) || ""}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-extrabold text-slate-900">{n(r.total)}</td>
                      </tr>
                    ))}

                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-3 py-2 font-extrabold text-slate-900">Total</td>
                      {data.sizes.map((s) => (
                        <td key={s} className="px-3 py-2 text-right font-extrabold text-slate-900">
                          {n(data.totalsBySize?.[s]) || ""}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-extrabold text-slate-900">{n(data.grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* ✅ NEW: Buyer totals (cartons/pcs/cbm) */}
            {buyerSummary?.rows?.length ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-sm font-extrabold text-slate-900">Buyer-wise totals (current search)</div>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left text-xs font-extrabold text-slate-600">Buyer</th>
                        <th className="px-3 py-2 text-right text-xs font-extrabold text-slate-600">Cartons</th>
                        <th className="px-3 py-2 text-right text-xs font-extrabold text-slate-600">Total Pcs</th>
                        <th className="px-3 py-2 text-right text-xs font-extrabold text-slate-600">CBM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buyerSummary.rows.map((r) => (
                        <tr key={r.buyer} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-bold text-slate-800">{r.buyer}</td>
                          <td className="px-3 py-2 text-right">{r.cartons}</td>
                          <td className="px-3 py-2 text-right">{r.pcs}</td>
                          <td className="px-3 py-2 text-right">{r.cbm.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* ✅ NEW: Buyer × Size (pieces) */}
            {buyerSummary?.rows?.length && buyerSummary?.sizes?.length ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[760px] w-full text-sm">
                  <thead>
                    <tr className="bg-white">
                      <th className="px-3 py-2 text-left text-xs font-extrabold text-slate-600">Buyer</th>
                      {buyerSummary.sizes.map((s) => (
                        <th key={s} className="px-3 py-2 text-right text-xs font-extrabold text-slate-600">
                          {s}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right text-xs font-extrabold text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyerSummary.rows.map((r) => {
                      const total = buyerSummary.sizes.reduce((sum, s) => sum + n(r.bySize?.[s]), 0);
                      return (
                        <tr key={r.buyer} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-bold text-slate-800">{r.buyer}</td>
                          {buyerSummary.sizes.map((s) => (
                            <td key={s} className="px-3 py-2 text-right text-slate-700">
                              {n(r.bySize?.[s]) || ""}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right font-extrabold text-slate-900">{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* All details */}
            <div className="mt-5">
              <div className="mb-2 text-sm font-extrabold text-slate-900">All Details</div>
              <div className="space-y-2">
                {(data.entries || []).map((e) => (
                  <div key={e._id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-[320px]">
                        <div className="text-sm font-extrabold text-slate-900">
                          {e.code} <span className="text-slate-500">({e.date})</span>
                        </div>

                        <div className="mt-1 text-xs text-slate-600">
                          Buyer: <span className="font-bold">{e.buyer}</span> • Color:{" "}
                          <span className="font-bold">{e.color || "—"}</span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div className="text-xs font-bold text-slate-700">PO:</div>
                          <input
                            className="input !w-[220px]"
                            value={poEdits?.[e._id] ?? ""}
                            onChange={(ev) => setPoEdits((p) => ({ ...p, [e._id]: ev.target.value }))}
                            placeholder="PO number"
                          />
                          <button
                            onClick={() => savePo(e._id)}
                            disabled={savingPoId === e._id}
                            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${
                              savingPoId === e._id ? "bg-slate-200 text-slate-500" : "bg-slate-900 text-white hover:bg-slate-800"
                            }`}
                          >
                            <Save className="h-4 w-4" />
                            {savingPoId === e._id ? "Saving..." : "Save PO"}
                          </button>
                        </div>

                        <div className="mt-2 text-xs text-slate-600">
                          Cartons: <span className="font-bold">{e.cartonQty}</span> • Pcs/Carton:{" "}
                          <span className="font-bold">{e.pcsPerCarton}</span> • Total pcs:{" "}
                          <span className="font-bold">{e.totalQty}</span>
                        </div>

                        <div className="mt-1 text-xs text-slate-600">
                          Sizes/Carton: <span className="font-bold">{sizesPerCartonText(e.sizes)}</span> • Dims:{" "}
                          <span className="font-bold">
                            {n(e.cartonDimCm?.w)}×{n(e.cartonDimCm?.l)}×{n(e.cartonDimCm?.h)} cm
                          </span>
                        </div>
                      </div>

                      <div className="text-xs font-bold">
                        {e.alloc ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                            Allocated: {e.alloc.rowName} • {e.alloc.rowStartAtCm} → {e.alloc.rowEndAtCm} cm
                          </div>
                        ) : (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">Not allocated</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <style jsx global>{`
          .input {
            width: 100%;
            border: 1px solid rgb(226 232 240);
            border-radius: 0.85rem;
            padding: 0.55rem 0.75rem;
            font-size: 0.875rem;
            outline: none;
            background: white;
          }
          .input:focus {
            border-color: rgb(148 163 184);
            box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.25);
          }
        `}</style>
      </div>

      {/* RIGHT */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-lg font-extrabold text-slate-900">Where This Style Is Allocated</div>

        <GraphicalPane
          warehouse={warehouse}
          selectedRowId={selectedRowId || null}
          preview={null}
          highlightEntryIds={highlightEntryIds}
          dimOthers={true}
          refreshKey={paneRefreshKey}
          onSelectRow={(row) => setSelectedRow({ _id: String(row?._id), name: row?.name })}
        />
      </div>
    </div>
  );
}
