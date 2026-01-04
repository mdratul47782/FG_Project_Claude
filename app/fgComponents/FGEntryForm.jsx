// app/fgComponents/FGEntryForm.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import GraphicalPane from "./GraphicalPane";
import {
  Building2,
  Warehouse,
  UserRound,
  LayoutGrid,
  CalendarDays,
  Hash,
  Shirt,
  Tag,
  Package,
  Ruler,
  Layers,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
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

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// Mock auth - replace with actual auth context
const mockAuth = {
  assigned_building: "A-2",
  factory: "K-2",
};

export default function FGEntryForm() {
  const [floor] = useState(mockAuth.assigned_building);
  const [warehouse, setWarehouse] = useState("B1");
  const [buyer, setBuyer] = useState(BUYERS[0]);

  const [rows, setRows] = useState([]);
  const [rowId, setRowId] = useState("");

  const [season, setSeason] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [style, setStyle] = useState("");
  const [model, setModel] = useState("");
  const [item, setItem] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");

  const [pcsPerCarton, setPcsPerCarton] = useState(0);
  const [cartonQty, setCartonQty] = useState(0);
  const [w, setW] = useState(0);
  const [l, setL] = useState(0);
  const [h, setH] = useState(0);
  const [fobPerPcs, setFobPerPcs] = useState(0);

  // Manual orientation controls
  const [manualOrientation, setManualOrientation] = useState("LENGTH_WISE");
  const [manualAcross, setManualAcross] = useState(2);

  const totalQty = useMemo(() => n(pcsPerCarton) * n(cartonQty), [pcsPerCarton, cartonQty]);
  const perCartonCbm = useMemo(() => (n(w) * n(l) * n(h)) / 1_000_000, [w, l, h]);
  const totalCbm = useMemo(() => perCartonCbm * n(cartonQty), [perCartonCbm, cartonQty]);
  const totalFob = useMemo(() => totalQty * n(fobPerPcs), [totalQty, fobPerPcs]);

  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState("");
  const [saving, setSaving] = useState(false);

  const previewColumnsUsed = useMemo(() => {
    if (!preview?.columnsBySegment) return 0;
    return preview.columnsBySegment.reduce((sum, s) => sum + n(s.columnsUsed), 0);
  }, [preview]);

  const previewCartonsPlaced = useMemo(() => {
    if (!preview?.columnsBySegment) return 0;
    return preview.columnsBySegment.reduce((sum, s) => sum + n(s.qtyPlaced), 0);
  }, [preview]);

  const previewAllocatedCbm = useMemo(
    () => perCartonCbm * previewCartonsPlaced,
    [perCartonCbm, previewCartonsPlaced]
  );

  async function loadRows() {
    const res = await fetch(`/api/rows?warehouse=${warehouse}`);
    const data = await res.json();
    const list = data.rows || [];
    setRows(list);
    if (!rowId && list[0]?._id) setRowId(list[0]._id);
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse]);

  async function loadPreview() {
    setPreview(null);
    setPreviewErr("");

    if (!rowId) return;
    if (!buyer) return;
    if (n(cartonQty) <= 0) return;
    if (n(w) <= 0 || n(l) <= 0 || n(h) <= 0) return;

    const res = await fetch("/api/allocations/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rowId,
        buyer,
        cartonQty: n(cartonQty),
        cartonDimCm: { w: n(w), l: n(l), h: n(h) },
        manualOrientation,
        manualAcross: n(manualAcross),
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      setPreviewErr(data.message || "Preview failed");
      return;
    }
    setPreview(data.preview);
  }

  useEffect(() => {
    const t = setTimeout(loadPreview, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId, buyer, cartonQty, w, l, h, manualOrientation, manualAcross]);

  function resetForm() {
    setSeason("");
    setPoNumber("");
    setStyle("");
    setModel("");
    setItem("");
    setColor("");
    setSize("");
    setPcsPerCarton(0);
    setCartonQty(0);
    setW(0);
    setL(0);
    setH(0);
    setFobPerPcs(0);
    setManualOrientation("LENGTH_WISE");
    setManualAcross(2);
    setPreview(null);
    setPreviewErr("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (!preview?.rowId) throw new Error("No valid preview for this row.");

      // 1) Save Entry with auth info
      const entryRes = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          floor,
          buyer,
          season,
          poNumber,
          style,
          model,
          item,
          color,
          size,
          warehouse,
          pcsPerCarton: n(pcsPerCarton),
          cartonQty: n(cartonQty),
          cartonDimCm: { w: n(w), l: n(l), h: n(h) },
          fobPerPcs: n(fobPerPcs),
          status: "DRAFT",
          factory: mockAuth.factory,
          assigned_building: mockAuth.assigned_building,
        }),
      });

      const entryData = await entryRes.json();
      if (!entryData.ok) throw new Error(entryData.message || "Entry save failed");

      // 2) Save Allocation
      const allocRes = await fetch("/api/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entryData.entry._id,
          rowId: preview.rowId,
          manualOrientation,
          manualAcross: n(manualAcross),
        }),
      });

      const allocData = await allocRes.json();
      if (!allocData.ok) throw new Error(allocData.message || "Allocation save failed");

      alert(
        `Saved!\nEntry: ${entryData.entry.code}\nRow: ${preview.rowName}\nStart: ${preview.metrics.rowStartAtCm}cm\nEnd: ${preview.metrics.rowEndAtCm}cm\nRemaining: ${preview.metrics.rowRemainingAfterCm}cm`
      );

      resetForm();
      await loadPreview();
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!preview?.rowId && !saving;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LEFT */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Entry Form</h2>
            <p className="mt-1 text-xs text-slate-500">
              Fill details, choose row, set orientation, and preview placement.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Building2 className="h-4 w-4 text-slate-700" />
            <div className="text-xs">
              <div className="font-semibold text-slate-900">{mockAuth.assigned_building}</div>
              <div className="text-slate-500">Factory: {mockAuth.factory}</div>
            </div>
          </div>
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field icon={Building2} label="Floor (auto)">
            <input className="input" value={floor} disabled />
          </Field>

          <Field icon={Warehouse} label="Warehouse">
            <select
              className="input"
              value={warehouse}
              onChange={(e) => {
                setWarehouse(e.target.value);
                setRowId("");
              }}
            >
              <option value="B1">B1</option>
              <option value="B2">B2</option>
            </select>
          </Field>

          <Field icon={UserRound} label="Buyer">
            <select className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)}>
              {BUYERS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>

          <Field icon={LayoutGrid} label="Choose Row">
            <select className="input" value={rowId} onChange={(e) => setRowId(e.target.value)}>
              {rows.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name} ({r.type === "continuous" ? `${r.lengthCm}cm` : "segmented"})
                </option>
              ))}
            </select>
          </Field>

          <Field icon={CalendarDays} label="Season">
            <input className="input" value={season} onChange={(e) => setSeason(e.target.value)} />
          </Field>

          <Field icon={Hash} label="PO Number">
            <input className="input" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </Field>

          <Field icon={Shirt} label="Style">
            <input className="input" value={style} onChange={(e) => setStyle(e.target.value)} />
          </Field>

          <Field icon={Tag} label="Model">
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>

          <Field icon={Package} label="Item">
            <input className="input" value={item} onChange={(e) => setItem(e.target.value)} />
          </Field>

          <Field icon={Tag} label="Color">
            <input className="input" value={color} onChange={(e) => setColor(e.target.value)} />
          </Field>

          <Field icon={Tag} label="Size">
            <input className="input" value={size} onChange={(e) => setSize(e.target.value)} />
          </Field>

          <Field icon={Package} label="Pcs per Carton">
            <input
              className="input"
              type="number"
              value={pcsPerCarton}
              onChange={(e) => setPcsPerCarton(e.target.value)}
            />
          </Field>

          <Field icon={Package} label="Carton Qty">
            <input
              className="input"
              type="number"
              value={cartonQty}
              onChange={(e) => setCartonQty(e.target.value)}
            />
          </Field>

          <Field icon={Ruler} label="Carton W (cm)">
            <input className="input" type="number" value={w} onChange={(e) => setW(e.target.value)} />
          </Field>

          <Field icon={Ruler} label="Carton L (cm)">
            <input className="input" type="number" value={l} onChange={(e) => setL(e.target.value)} />
          </Field>

          <Field icon={Ruler} label="Carton H (cm)">
            <input className="input" type="number" value={h} onChange={(e) => setH(e.target.value)} />
          </Field>

          <Field icon={Tag} label="FOB (per pcs)">
            <input
              className="input"
              type="number"
              value={fobPerPcs}
              onChange={(e) => setFobPerPcs(e.target.value)}
            />
          </Field>

          <Field icon={Layers} label="Carton Orientation">
            <select className="input" value={manualOrientation} onChange={(e) => setManualOrientation(e.target.value)}>
              <option value="LENGTH_WISE">Length-wise (L into depth)</option>
              <option value="WIDTH_WISE">Width-wise (W into depth)</option>
            </select>
          </Field>

          <Field icon={LayoutGrid} label="Cartons Across Row">
            <select className="input" value={manualAcross} onChange={(e) => setManualAcross(Number(e.target.value))}>
              <option value={1}>1 carton</option>
              <option value={2}>2 cartons</option>
              <option value={3}>3 cartons</option>
            </select>
          </Field>
        </div>

        {/* Orientation Diagram */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-700" />
              <div className="text-sm font-extrabold text-slate-900">Orientation Preview</div>
            </div>
            <div className="text-xs text-slate-600">
              {manualOrientation === "LENGTH_WISE" ? "Length-wise" : "Width-wise"} • Across:{" "}
              <span className="font-bold text-slate-900">{manualAcross}</span>
            </div>
          </div>

          <OrientationDiagram
            orientation={manualOrientation}
            across={manualAcross}
            cartonW={n(w)}
            cartonL={n(l)}
            rowWidth={120}
          />
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <KPI label="Total Qty" value={totalQty} />
          <KPI label="Per Carton CBM" value={perCartonCbm.toFixed(6)} />
          <KPI label="Total CBM" value={totalCbm.toFixed(6)} />
          <KPI label="Total FOB" value={totalFob.toFixed(2)} />
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition ${
              canSave
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "cursor-not-allowed bg-slate-200 text-slate-500"
            }`}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Entry + Allocation"}
          </button>

          <button
            onClick={resetForm}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      {/* RIGHT */}
      <div className="grid gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-lg font-extrabold text-slate-900">Placement Info</div>
            {preview?.metrics ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Preview OK
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                <AlertCircle className="h-4 w-4" />
                Waiting
              </div>
            )}
          </div>

          {preview?.metrics ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <KPI label="Row Start (cm)" value={preview.metrics.rowStartAtCm} />
                <KPI label="Row End (cm)" value={preview.metrics.rowEndAtCm} />
                <KPI label="Remaining Length (cm)" value={preview.metrics.rowRemainingAfterCm} />
                <KPI label="Allocated Height (cm)" value={preview.metrics.allocatedHeightCm} />
                <KPI label="Remaining Height (cm)" value={preview.metrics.remainingHeightCm} />
                <KPI label="Across" value={preview.metrics.across} />
                <KPI label="Layers" value={preview.metrics.layers} />
                <KPI label="Column Depth (cm)" value={preview.metrics.columnDepthCm} />
                <KPI label="Columns Used" value={previewColumnsUsed} />
                <KPI label="Cartons / Column" value={preview.metrics.perColumnCapacity} />
                <KPI label="Cartons Placed" value={previewCartonsPlaced} />
                <KPI label="Allocated CBM" value={previewAllocatedCbm.toFixed(6)} />
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <span className="font-extrabold text-slate-900">Orientation:</span>{" "}
                {preview.metrics.orientation}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {previewErr || "Fill carton qty + dimensions to see preview."}
            </div>
          )}
        </div>

        <GraphicalPane warehouse={warehouse} selectedRowId={rowId} preview={preview} />
      </div>

      {/* Tailwind helpers (keep inside file to stay “full code”) */}
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

function KPI({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-base font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function OrientationDiagram({ orientation, across, cartonW, cartonL, rowWidth }) {
  const svgW = 420;
  const svgH = 220;
  const margin = 18;

  const isLengthWise = orientation === "LENGTH_WISE";
  const a = Math.max(1, Math.min(3, Number(across) || 1));

  // Across width depends on orientation
  const cartonAcrossWidth = isLengthWise ? cartonW : cartonL; // cm along row width
  const cartonDepth = isLengthWise ? cartonL : cartonW; // cm into row depth

  const totalAcrossWidth = n(cartonAcrossWidth) * a;
  const fits = totalAcrossWidth > 0 ? totalAcrossWidth <= n(rowWidth) : true;

  const maxWidth = svgW - 2 * margin;
  const scale = Math.min(maxWidth / Math.max(n(rowWidth), totalAcrossWidth || 1), 1.6);

  const rowWidthPx = n(rowWidth) * scale;
  const cartonWidthPx = n(cartonAcrossWidth) * scale;
  const cartonDepthPx = Math.max(36, Math.min(n(cartonDepth) * scale, 82));

  const startX = margin;
  const rowY = svgH / 2 - cartonDepthPx / 2;

  return (
    <div className="grid gap-2">
      <svg
        width={svgW}
        height={svgH}
        className="w-full rounded-xl border border-slate-200 bg-white"
      >
        {/* Row area */}
        <rect
          x={startX}
          y={rowY - 18}
          width={rowWidthPx}
          height={cartonDepthPx + 36}
          fill="#f1f5f9"
          stroke="#0f172a"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          rx="10"
        />
        <text
          x={startX + rowWidthPx / 2}
          y={rowY - 24}
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="#0f172a"
        >
          Row Width: {n(rowWidth)}cm
        </text>

        {/* Cartons */}
        {Array.from({ length: a }).map((_, i) => {
          const x = startX + i * cartonWidthPx;
          return (
            <g key={i}>
              <rect
                x={x}
                y={rowY}
                width={cartonWidthPx}
                height={cartonDepthPx}
                rx="10"
                fill={fits ? "#10b981" : "#ef4444"}
                fillOpacity="0.18"
                stroke={fits ? "#047857" : "#b91c1c"}
                strokeWidth="2"
              />
              <text
                x={x + cartonWidthPx / 2}
                y={rowY + cartonDepthPx / 2 - 6}
                textAnchor="middle"
                fontSize="10"
                fontWeight="900"
                fill={fits ? "#065f46" : "#7f1d1d"}
              >
                Carton {i + 1}
              </text>
              <text
                x={x + cartonWidthPx / 2}
                y={rowY + cartonDepthPx / 2 + 10}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#334155"
              >
                W:{n(cartonAcrossWidth).toFixed(0)} • D:{n(cartonDepth).toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Total width */}
        <line
          x1={startX}
          y1={rowY + cartonDepthPx + 18}
          x2={startX + a * cartonWidthPx}
          y2={rowY + cartonDepthPx + 18}
          stroke={fits ? "#047857" : "#b91c1c"}
          strokeWidth="2"
        />
        <text
          x={startX + (a * cartonWidthPx) / 2}
          y={rowY + cartonDepthPx + 34}
          textAnchor="middle"
          fontSize="10"
          fontWeight="900"
          fill={fits ? "#065f46" : "#7f1d1d"}
        >
          Total: {totalAcrossWidth.toFixed(0)}cm {fits ? "FITS" : "TOO WIDE"}
        </text>

        <text x={startX} y={svgH - 10} fontSize="10" fontWeight="700" fill="#64748b">
          {isLengthWise ? "Length goes into depth →" : "Width goes into depth →"}
        </text>
      </svg>

      <div className="text-xs text-slate-600">
        <div className="font-bold text-slate-800">Top view explanation:</div>
        <div>
          • Depth uses <span className="font-bold text-slate-900">{isLengthWise ? "L" : "W"}</span>{" "}
          ({isLengthWise ? n(cartonL) : n(cartonW)}cm)
        </div>
        <div>
          • Across uses <span className="font-bold text-slate-900">{isLengthWise ? "W" : "L"}</span>{" "}
          ({n(cartonAcrossWidth)}cm) × {a} = {totalAcrossWidth.toFixed(0)}cm
        </div>
        {!fits ? (
          <div className="mt-1 font-extrabold text-rose-700">
            Doesn’t fit — reduce “Across” or change orientation.
          </div>
        ) : null}
      </div>
    </div>
  );
}
