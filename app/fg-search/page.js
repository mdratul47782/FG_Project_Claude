"use client";

import { useEffect, useMemo, useState } from "react";
import Barcode from "react-barcode";
import {
  CalendarDays,
  UserRound,
  Hash,
  Shirt,
  Search,
  RotateCcw,
  Printer,
  X,
  Warehouse,
} from "lucide-react";

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

const WAREHOUSES = ["B1", "B2"];

function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function sizesText(sizes = []) {
  if (!Array.isArray(sizes) || sizes.length === 0) return "—";
  return sizes
    .map((s) => `${String(s.size || "").trim()}:${Number(s.qty || 0)}`)
    .filter((x) => !x.startsWith(":0"))
    .join(", ");
}

function pickSizeForLabel(sizes = []) {
  if (!Array.isArray(sizes) || sizes.length === 0) return "-";
  if (sizes.length === 1) return String(sizes[0]?.size || "-").trim() || "-";
  return sizesText(sizes);
}

function normalizeBuyer(buyer = "") {
  const b = String(buyer || "").trim();
  if (!b) return "-";
  return b
    .replace(/\s*-\s*/g, "-")
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ""))
    .join("-");
}

function makeCartonId(entry, cartonNo) {
  const base = entry?.code || entry?._id || "NA";
  const serial = String(cartonNo).padStart(3, "0");
  return `${base}-${serial}`;
}

export default function FGSearchPage() {
  const [warehouse, setWarehouse] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [buyer, setBuyer] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [style, setStyle] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState([]);

  const [printEntry, setPrintEntry] = useState(null);
  const [printing, setPrinting] = useState(false);

  const [cartonFrom, setCartonFrom] = useState(1);
  const [cartonTo, setCartonTo] = useState(1);
  const [printCartons, setPrintCartons] = useState([]);

  useEffect(() => {
    if (!printEntry) return;
    const total = Math.max(1, n(printEntry.cartonQty));
    setCartonFrom(1);
    setCartonTo(total);
    setPrintCartons([]);
  }, [printEntry]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (warehouse) p.set("warehouse", warehouse);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (buyer) p.set("buyer", buyer);
    if (poNumber) p.set("poNumber", poNumber);
    if (style) p.set("style", style);
    return p.toString();
  }, [warehouse, from, to, buyer, poNumber, style]);

  async function handleSearch() {
    setLoading(true);
    setErr("");
    try {
      const url = `/api/fg-search${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Search failed");
      setResults(data.results || []);
    } catch (e) {
      setErr(e?.message || "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setWarehouse("");
    setFrom("");
    setTo("");
    setBuyer("");
    setPoNumber("");
    setStyle("");
    setErr("");
    setResults([]);
  }

  async function markPrinted(entryId) {
    const res = await fetch(`/api/entries?id=${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printed: true }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || "Failed to update printed");
    return data.entry;
  }

  async function handlePrintNow() {
    if (!printEntry?._id) return;
    setPrinting(true);

    try {
      const total = Math.max(1, n(printEntry.cartonQty));
      // ✅ FIX: Properly convert string inputs to numbers
      const start = clamp(Number(cartonFrom) || 1, 1, total);
      const end = clamp(Number(cartonTo) || total, start, total);

      // ✅ Build array of carton numbers (e.g., 1 to 22)
      const cartons = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      
      console.log(`Printing cartons ${start} to ${end} (${cartons.length} labels)`);
      setPrintCartons(cartons);

      // ✅ Wait for DOM to update with all labels
      await new Promise(resolve => setTimeout(resolve, 100));

      window.print();

      // Reset after print dialog closes
      setPrintCartons([]);

      // Mark as printed
      const updated = await markPrinted(printEntry._id);

      setResults((prev) =>
        prev.map((r) => {
          if (String(r.entry?._id) !== String(updated._id)) return r;
          return { ...r, entry: { ...r.entry, ...updated } };
        })
      );

      setPrintEntry((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (e) {
      alert("Print/Update failed: " + (e?.message || "Unknown error"));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-screen-2xl px-3 py-3">
        {/* Filters */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">FG Search</h1>
          <p className="mt-1 text-sm text-slate-600">
            Search entries and print barcode labels (Buyer, Style, PO, Color, Size + carton serial).
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field icon={Warehouse} label="Warehouse">
              <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                <option value="">All</option>
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Field>

            <Field icon={CalendarDays} label="From (date)">
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>

            <Field icon={CalendarDays} label="To (date)">
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>

            <Field icon={UserRound} label="Buyer">
              <select className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)}>
                <option value="">All</option>
                {BUYERS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>

            <Field icon={Hash} label="PO Number">
              <input
                className="input"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. 4523636402"
              />
            </Field>

            <Field icon={Shirt} label="Style">
              <input className="input" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="e.g. 326668" />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSearch}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition ${
                loading ? "cursor-not-allowed bg-slate-200 text-slate-500" : "bg-amber-400 text-slate-950 hover:bg-amber-300"
              }`}
            >
              <Search className="h-4 w-4" />
              {loading ? "Searching..." : "Search"}
            </button>

            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>

            <div className="ml-auto text-xs text-slate-500">
              Results: <span className="font-extrabold text-slate-800">{results.length}</span>
            </div>
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{err}</div>
          ) : null}
        </div>

        {/* Table */}
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[1350px] w-full text-left">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200">
                  <TH>Date</TH>
                  <TH>WH</TH>
                  <TH>Buyer</TH>
                  <TH>PO</TH>
                  <TH>Style</TH>
                  <TH>Item</TH>
                  <TH>Color</TH>
                  <TH>Size</TH>
                  <TH className="text-right">Pcs/Carton</TH>
                  <TH className="text-right">Carton Qty</TH>
                  <TH className="text-center">Print</TH>
                </tr>
              </thead>

              <tbody>
                {results.map(({ entry }) => {
                  const sizeStr = sizesText(entry.sizes);
                  const btnLabel = entry.printed ? "Print again" : "Print";

                  return (
                    <tr key={entry._id} className="border-b border-slate-100 hover:bg-slate-50">
                      <TD className="whitespace-nowrap">{fmtDate(entry.createdAt)}</TD>
                      <TD className="whitespace-nowrap font-extrabold">{entry.warehouse || "-"}</TD>
                      <TD className="max-w-[220px] truncate" title={entry.buyer}>
                        {entry.buyer || "-"}
                      </TD>
                      <TD className="whitespace-nowrap">{entry.poNumber || "-"}</TD>
                      <TD className="whitespace-nowrap">{entry.style || "-"}</TD>
                      <TD className="max-w-[220px] truncate" title={entry.item}>
                        {entry.item || "-"}
                      </TD>
                      <TD className="whitespace-nowrap">{entry.color || "-"}</TD>
                      <TD className="max-w-[340px] truncate" title={sizeStr}>
                        {sizeStr}
                      </TD>
                      <TD className="text-right tabular-nums">{n(entry.pcsPerCarton)}</TD>
                      <TD className="text-right tabular-nums">{n(entry.cartonQty)}</TD>
                      <TD className="text-center">
                        <button
                          type="button"
                          onClick={() => setPrintEntry(entry)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800 hover:bg-slate-100"
                        >
                          <Printer className="h-4 w-4" />
                          {btnLabel}
                        </button>
                        <div className="mt-1 text-[10px] text-slate-500">{entry.printed ? "Printed ✓" : "Not printed"}</div>
                      </TD>
                    </tr>
                  );
                })}

                {results.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-sm text-slate-600">
                      No data. Set filters and click <span className="font-bold">Search</span>.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PRINT MODAL */}
      {printEntry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 no-print">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900">Print Label</div>
                <div className="text-xs text-slate-500">
                  Total cartons: <b>{Math.max(1, n(printEntry.cartonQty))}</b>. Select range to print.
                </div>
              </div>
              <button
                onClick={() => {
                  setPrintCartons([]);
                  setPrintEntry(null);
                }}
                className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Close"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Field icon={Hash} label="Carton From">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={Math.max(1, n(printEntry.cartonQty))}
                    value={cartonFrom}
                    onChange={(e) => setCartonFrom(e.target.value)}
                  />
                </Field>
                <Field icon={Hash} label="Carton To">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={Math.max(1, n(printEntry.cartonQty))}
                    value={cartonTo}
                    onChange={(e) => setCartonTo(e.target.value)}
                  />
                </Field>
              </div>

              <div className="mb-3 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                <strong>Preview:</strong> Will print {Math.max(1, Math.min(Number(cartonTo) || 1, Math.max(1, n(printEntry.cartonQty))) - Math.max(1, Number(cartonFrom) || 1) + 1)} label(s) 
                (Carton {Math.max(1, Number(cartonFrom) || 1)} to {Math.min(Number(cartonTo) || 1, Math.max(1, n(printEntry.cartonQty)))})
              </div>

              {/* Preview Area */}
              <div className="rounded-xl border border-slate-300 bg-white p-3 max-h-[300px] overflow-y-auto">
                <CartonLabel entry={printEntry} cartonNo={Number(cartonFrom) || 1} total={Math.max(1, n(printEntry.cartonQty))} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 pb-4">
              <button
                onClick={() => {
                  setPrintCartons([]);
                  setPrintEntry(null);
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={handlePrintNow}
                disabled={printing}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition ${
                  printing ? "cursor-not-allowed bg-slate-200 text-slate-500" : "bg-amber-400 text-slate-950 hover:bg-amber-300"
                }`}
              >
                <Printer className="h-4 w-4" />
                {printing ? "Printing..." : printEntry.printed ? "Print again" : "Print"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* HIDDEN PRINT AREA - Only visible during printing */}
      <div id="print-area" style={{ display: 'none' }}>
        {printCartons.map((cartonNo) => (
          <CartonLabel key={cartonNo} entry={printEntry} cartonNo={cartonNo} total={Math.max(1, n(printEntry?.cartonQty || 0))} />
        ))}
      </div>

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
          border-color: rgb(251 191 36);
          box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.25);
        }

        /* ✅ Print styles - each label on separate page */
        @media print {
          /* Hide everything except print area */
          body * {
            visibility: hidden !important;
          }
          
          #print-area,
          #print-area * {
            visibility: visible !important;
          }

          /* Position print area to fill page */
          #print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
          }

          /* Each label gets its own page */
          .label-page {
            page-break-after: always;
            break-after: page;
            min-height: 100vh;
            display: flex !important;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 20mm;
          }

          /* Remove page break from last label */
          .label-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          @page {
            margin: 10mm;
            size: auto;
          }
        }

        /* Regular screen styles for labels */
        .label-page {
          text-align: center;
          padding: 20px;
          background: white;
        }
        
        .label-line {
          font-size: 16px;
          font-weight: 700;
          line-height: 1.6;
          margin: 8px 0;
          white-space: nowrap;
        }
        
        .label-id {
          font-size: 14px;
          font-weight: 800;
          margin-top: 12px;
          margin-bottom: 12px;
        }
        
        .label-code {
          font-size: 20px;
          font-weight: 900;
          margin-top: 12px;
          letter-spacing: 2px;
        }

        /* Print-specific label sizing */
        @media print {
          .label-line {
            font-size: 18px;
            margin: 10px 0;
          }
          
          .label-id {
            font-size: 16px;
            margin: 14px 0;
          }
          
          .label-code {
            font-size: 22px;
            margin-top: 14px;
          }
        }
      `}</style>
    </div>
  );
}

function CartonLabel({ entry, cartonNo, total }) {
  const buyer = normalizeBuyer(entry?.buyer);
  const po = entry?.poNumber || "TBA";
  const size = pickSizeForLabel(entry?.sizes);
  const style = entry?.style || "-";
  const color = String(entry?.color || "-").toUpperCase();
  const cartonId = makeCartonId(entry, cartonNo);

  return (
    <div className="label-page">
      <div className="label-line">
        Customer : {buyer} &nbsp;&nbsp;&nbsp; PO No : {po} &nbsp;&nbsp;&nbsp; Size : {size}
      </div>

      <div className="label-line">
        Style No : {style} &nbsp;&nbsp;&nbsp; Color : {color} &nbsp;&nbsp;&nbsp; Qty : {total}
      </div>

      <div className="label-id">Car Id : {cartonId}</div>

      <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
        <Barcode 
          value={cartonId} 
          format="CODE128" 
          renderer="svg" 
          height={80} 
          width={2.5} 
          displayValue={false} 
          margin={0} 
        />
      </div>

      <div className="label-code">{cartonId}</div>
    </div>
  );
}

function Field({ label, icon: Icon, children }) {
  return (
    <label className="grid gap-1.5">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
        {Icon ? <Icon className="h-4 w-4 text-slate-600" /> : null}
        <span>{label}</span>
      </div>
      {children}
    </label>
  );
}

function TH({ children, className = "" }) {
  return <th className={`px-3 py-2 text-[11px] font-extrabold text-slate-700 ${className}`}>{children}</th>;
}

function TD({ children, className = "", title }) {
  return (
    <td title={title} className={`px-3 py-2 text-sm text-slate-800 ${className}`}>
      {children}
    </td>
  );
}