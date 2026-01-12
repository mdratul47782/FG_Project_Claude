// app/fgComponents/FGEntryForm.jsx
"use client";

import { useAuth } from "@/app/hooks/useAuth";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Plus,
  Trash2,
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

const FLOORS = ["A-2", "B-2", "A-3", "B-3", "A-4", "B-4", "A-5", "B-5"];
const SIZES = [
  "38",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
  "52",
  "10/11",
  "10-11",
  "12/13",
  "12M",
  "14-15",
  "18M",
  "2/3Y",
  "2-3Y",
  "24M",
  "2XL",
  "3/4Y",
  "3-4Y",
  "3XL",
  "4/5Y",
  "4-5Y",
  "4XL",
  "54",
  "5-6",
  "6M",
  "7/8",
  "7-8",
  "8/9",
  "8-9",
  "ADULT",
  "EU40",
  "EU42",
  "EU44",
  "EU46",
  "EU48",
  "EU50",
  "L",
  "M",
  "ONE SIZE",
  "S",
  "XL",
  "XS",
];

const PACK_TYPES = [
  { value: "SOLID_COLOR_SOLID_SIZE", label: "Solid Color Solid Size" },
  { value: "SOLID_COLOR_ASSORT_SIZE", label: "Solid Color Assort Size" },
  { value: "ASSORT_COLOR_SOLID_SIZE", label: "Assort Color Solid Size" },
  { value: "ASSORT_COLOR_ASSORT_SIZE", label: "Assort Color Assort Size" },
];

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// ✅ auto uppercase helper (manual inputs)
function upper(v) {
  return String(v ?? "").toUpperCase();
}

function useDebouncedValue(value, delay = 650) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

export default function FGEntryForm() {
  const { auth } = useAuth();

  const user = useMemo(() => {
    if (!auth) return null;

    let a = auth;

    if (typeof a === "string") {
      try {
        a = JSON.parse(a);
      } catch {
        return null;
      }
    }

    if (Array.isArray(a)) a = a[0];
    if (a?.user) a = a.user;

    if (!a) return null;
    if (!a._id && a.id) a._id = a.id;

    return a;
  }, [auth]);

  const createdByPayload = useMemo(() => {
    const userId = user?._id || user?.id || undefined;
    return {
      userId,
      user_name: user?.user_name || "",
      role: user?.role || "",
      assigned_building: user?.assigned_building || "",
      factory: user?.factory || "",
    };
  }, [user]);

  const [floor, setFloor] = useState("");
  const [warehouse, setWarehouse] = useState("B1");
  const [buyer, setBuyer] = useState(BUYERS[0]);

  const [rows, setRows] = useState([]);
  const [rowId, setRowId] = useState("");

  // ✅ manual inputs (uppercase)
  const [season, setSeason] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [style, setStyle] = useState("");
  const [model, setModel] = useState("");
  const [item, setItem] = useState("");
  const [color, setColor] = useState("");

  const [packType, setPackType] = useState(PACK_TYPES[0].value);
  const [sizes, setSizes] = useState([{ size: "", qty: "" }]);

  const [pcsPerCarton, setPcsPerCarton] = useState("");
  const [cartonQty, setCartonQty] = useState("");
  const [w, setW] = useState("");
  const [l, setL] = useState("");
  const [h, setH] = useState("");
  const [fobPerPcs, setFobPerPcs] = useState("");

  const [manualOrientation, setManualOrientation] = useState("LENGTH_WISE");
  const [manualAcross, setManualAcross] = useState(2);

  // ✅ for diagrams (1..3)
  const acrossCount = Math.max(1, Math.min(3, n(manualAcross)));

  const dCartonQty = useDebouncedValue(cartonQty, 650);
  const dW = useDebouncedValue(w, 650);
  const dL = useDebouncedValue(l, 650);
  const dH = useDebouncedValue(h, 650);

  const isTypingDimsOrQty = useMemo(() => {
    return cartonQty !== dCartonQty || w !== dW || l !== dL || h !== dH;
  }, [cartonQty, dCartonQty, w, dW, l, dL, h, dH]);

  const pcsPerCartonFromSizes = useMemo(() => {
    return (sizes || []).reduce((sum, r) => sum + n(r.qty), 0);
  }, [sizes]);

  const pcsPerCartonFinal = useMemo(() => {
    return pcsPerCartonFromSizes > 0 ? pcsPerCartonFromSizes : n(pcsPerCarton);
  }, [pcsPerCartonFromSizes, pcsPerCarton]);

  useEffect(() => {
    if (pcsPerCartonFromSizes > 0) setPcsPerCarton(String(pcsPerCartonFromSizes));
  }, [pcsPerCartonFromSizes]);

  const totalQty = useMemo(() => pcsPerCartonFinal * n(cartonQty), [pcsPerCartonFinal, cartonQty]);
  const perCartonCbm = useMemo(() => (n(w) * n(l) * n(h)) / 1_000_000, [w, l, h]);
  const totalCbm = useMemo(() => perCartonCbm * n(cartonQty), [perCartonCbm, cartonQty]);
  const totalFob = useMemo(() => totalQty * n(fobPerPcs), [totalQty, fobPerPcs]);

  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const previewReqIdRef = useRef(0);
  const previewCtrlRef = useRef(null);

  const previewColumnsUsed = useMemo(() => {
    if (!preview?.columnsBySegment) return 0;
    return preview.columnsBySegment.reduce((sum, s) => sum + n(s.columnsUsed), 0);
  }, [preview]);

  const previewCartonsPlaced = useMemo(() => {
    if (preview?.capacity?.placedCartons != null) return n(preview.capacity.placedCartons);
    if (!preview?.columnsBySegment) return 0;
    return preview.columnsBySegment.reduce((sum, s) => sum + n(s.qtyPlaced), 0);
  }, [preview]);

  const previewAllocatedCbm = useMemo(() => perCartonCbm * previewCartonsPlaced, [perCartonCbm, previewCartonsPlaced]);

  const maxFits = useMemo(() => n(preview?.capacity?.maxCartons), [preview]);
  const requested = useMemo(() => n(preview?.capacity?.requestedCartons ?? n(dCartonQty)), [preview, dCartonQty]);
  const unplaced = useMemo(() => n(preview?.capacity?.unplacedCartons), [preview]);
  const moreCanFit = useMemo(() => Math.max(0, maxFits - requested), [maxFits, requested]);

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

  useEffect(() => {
    if (isTypingDimsOrQty) {
      setPreview(null);
      setPreviewErr("");
      setPreviewLoading(false);
      if (previewCtrlRef.current) previewCtrlRef.current.abort();
    }
  }, [isTypingDimsOrQty]);

  async function loadPreview() {
    if (isTypingDimsOrQty) return;

    setPreview(null);
    setPreviewErr("");

    if (!rowId) return;
    if (!buyer) return;

    const qty = n(dCartonQty);
    const ww = n(dW);
    const ll = n(dL);
    const hh = n(dH);

    if (qty <= 0) return;
    if (ww <= 0 || ll <= 0 || hh <= 0) return;

    if (previewCtrlRef.current) previewCtrlRef.current.abort();
    const ctrl = new AbortController();
    previewCtrlRef.current = ctrl;

    const reqId = ++previewReqIdRef.current;
    setPreviewLoading(true);

    try {
      const res = await fetch("/api/allocations/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          rowId,
          buyer,
          cartonQty: qty,
          cartonDimCm: { w: ww, l: ll, h: hh },
          manualOrientation,
          manualAcross: n(manualAcross),
        }),
      });

      const data = await res.json();

      if (reqId !== previewReqIdRef.current) return;

      if (!data.ok) {
        setPreviewErr(data.message || "Preview failed");
        setPreview(null);
        return;
      }

      setPreview(data.preview);

      if (data.preview?.capacity?.unplacedCartons > 0) {
        setPreviewErr(
          `Not enough space. Max fits: ${data.preview.capacity.maxCartons} cartons. Reduce qty or choose another row.`
        );
      } else {
        setPreviewErr("");
      }
    } catch (e) {
      if (e?.name !== "AbortError") setPreviewErr("Preview failed");
    } finally {
      if (reqId === previewReqIdRef.current) setPreviewLoading(false);
    }
  }

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId, buyer, dCartonQty, dW, dL, dH, manualOrientation, manualAcross]);

  function addSizeRow() {
    setSizes((prev) => [...prev, { size: "", qty: "" }]);
  }
  function removeSizeRow(idx) {
    setSizes((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateSizeRow(idx, patch) {
    setSizes((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function resetForm() {
    setFloor("");
    setSeason("");
    setPoNumber("");
    setStyle("");
    setModel("");
    setItem("");
    setColor("");

    setPackType(PACK_TYPES[0].value);
    setSizes([{ size: "", qty: "" }]);

    setPcsPerCarton("");
    setCartonQty("");
    setW("");
    setL("");
    setH("");
    setFobPerPcs("");

    setManualOrientation("LENGTH_WISE");
    setManualAcross(2);

    setPreview(null);
    setPreviewErr("");
    setPreviewLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (!user) throw new Error("Auth not loaded. Please login again / refresh.");
      if (!user?.factory) throw new Error("Factory missing in auth. Please login again / refresh.");

      if (!floor) throw new Error("Please select Floor first.");
      if (!preview?.rowId) throw new Error("No valid preview for this row.");
      if (preview?.capacity?.unplacedCartons > 0) {
        throw new Error(`Only ${preview.capacity.maxCartons} cartons fit in remaining space. Reduce qty.`);
      }

      const cleanedSizes = (sizes || [])
        .map((r) => ({ size: (r.size || "").trim(), qty: n(r.qty) }))
        .filter((r) => r.size && r.qty > 0);

      if (cleanedSizes.length > 0 && pcsPerCartonFinal <= 0) throw new Error("Invalid size qty per carton.");
      if (n(cartonQty) <= 0) throw new Error("Carton Qty must be > 0.");
      if (n(w) <= 0 || n(l) <= 0 || n(h) <= 0) throw new Error("Carton dimensions must be > 0.");
      if (n(fobPerPcs) <= 0) throw new Error("FOB per pcs must be > 0.");

      const entryRes = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          floor,
          buyer,
          season: upper(season),
          poNumber: upper(poNumber),
          style: upper(style),
          model: upper(model),
          item: upper(item),
          color: upper(color),

          packType,
          sizes: cleanedSizes,

          warehouse,
          pcsPerCarton: pcsPerCartonFinal,
          cartonQty: n(cartonQty),
          cartonDimCm: { w: n(w), l: n(l), h: n(h) },
          fobPerPcs: n(fobPerPcs),

          status: "DRAFT",
          createdBy: createdByPayload,
        }),
      });

      const entryData = await entryRes.json();
      if (!entryData.ok) throw new Error(entryData.message || "Entry save failed");

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
    } catch (e) {
      alert("Error: " + (e?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    !!user?.factory &&
    !!floor &&
    !!preview?.rowId &&
    !saving &&
    n(preview?.capacity?.unplacedCartons) === 0;

  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-12 lg:items-start">
      {/* FORM (big) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-4">
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
              <div className="font-semibold text-slate-900">
                Factory: {user?.factory || "—"}
              </div>
              <div className="text-slate-500">Floor: {floor || "—"}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field icon={Building2} label="Floor">
            <select className="input" value={floor} onChange={(e) => setFloor(e.target.value)}>
              <option value="" disabled>
                select Floor
              </option>
              {FLOORS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
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

          {/* ✅ manual text inputs -> uppercase */}
          <Field icon={CalendarDays} label="Season">
            <input className="input" value={season} onChange={(e) => setSeason(upper(e.target.value))} />
          </Field>

          <Field icon={Hash} label="PO Number">
            <input className="input" value={poNumber} onChange={(e) => setPoNumber(upper(e.target.value))} />
          </Field>

          <Field icon={Shirt} label="Style">
            <input className="input" value={style} onChange={(e) => setStyle(upper(e.target.value))} />
          </Field>

          <Field icon={Tag} label="Model">
            <input className="input" value={model} onChange={(e) => setModel(upper(e.target.value))} />
          </Field>

          <Field icon={Package} label="Item">
            <input className="input" value={item} onChange={(e) => setItem(upper(e.target.value))} />
          </Field>

          <Field icon={Tag} label="Color">
            <input className="input" value={color} onChange={(e) => setColor(upper(e.target.value))} />
          </Field>

          <Field icon={Package} label="Pack Type">
            <select className="input" value={packType} onChange={(e) => setPackType(e.target.value)}>
              {PACK_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                <Tag className="h-4 w-4 text-slate-600" />
                Size + Qty (per carton)
              </div>

              <button
                type="button"
                onClick={addSizeRow}
                className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800 hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" />
                Add size
              </button>
            </div>

            <div className="grid gap-2">
              {sizes.map((r, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <select
                      className="input"
                      value={r.size}
                      onChange={(e) => updateSizeRow(idx, { size: e.target.value })}
                    >
                      <option value="">Select size</option>
                      {SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-4">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={r.qty}
                      onChange={(e) => updateSizeRow(idx, { qty: e.target.value })}
                      placeholder="Pcs"
                    />
                  </div>

                  <div className="col-span-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => removeSizeRow(idx)}
                      disabled={sizes.length === 1}
                      className={`rounded-xl p-2 ${
                        sizes.length === 1
                          ? "cursor-not-allowed text-slate-300"
                          : "text-rose-600 hover:bg-rose-50"
                      }`}
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 text-[11px] text-slate-600">
              Pcs / Carton from sizes:{" "}
              <span className="font-extrabold text-slate-900">{pcsPerCartonFromSizes}</span>
            </div>
          </div>

          <Field icon={Package} label="Pcs per Carton">
            <input
              className="input"
              inputMode="numeric"
              value={pcsPerCarton}
              onChange={(e) => setPcsPerCarton(e.target.value)}
              placeholder="e.g. 24"
              disabled={pcsPerCartonFromSizes > 0}
            />
          </Field>

          <Field icon={Package} label="Carton Qty">
            <input
              className="input"
              inputMode="numeric"
              value={cartonQty}
              onChange={(e) => setCartonQty(e.target.value)}
              placeholder="e.g. 120"
            />
          </Field>

          <Field icon={Ruler} label="Carton W (cm)">
            <input className="input" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} placeholder="e.g. 40" />
          </Field>

          <Field icon={Ruler} label="Carton L (cm)">
            <input className="input" inputMode="numeric" value={l} onChange={(e) => setL(e.target.value)} placeholder="e.g. 60" />
          </Field>

          <Field icon={Ruler} label="Carton H (cm)">
            <input className="input" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} placeholder="e.g. 50" />
          </Field>

          <Field icon={Tag} label="FOB (per pcs)">
            <input className="input" inputMode="decimal" value={fobPerPcs} onChange={(e) => setFobPerPcs(e.target.value)} placeholder="e.g. 1.25" />
          </Field>

          {/* ✅ VISUAL ORIENTATION PICKER */}
          <div className="sm:col-span-2">
            <div className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-600" />
              <span>Carton Orientation / কার্টন ওরিয়েন্টেশন</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* LENGTH_WISE */}
              <button
                type="button"
                onClick={() => setManualOrientation("LENGTH_WISE")}
                className={`rounded-xl border-2 p-4 transition-all text-left ${
                  manualOrientation === "LENGTH_WISE"
                    ? "border-emerald-500 bg-emerald-50 shadow-lg ring-2 ring-emerald-200"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow"
                }`}
              >
                <div className="font-bold text-sm text-slate-900 mb-1">Length-wise</div>
                <div className="text-[11px] text-slate-600 mb-3">রো-এর দৈর্ঘ্য বরাবর বক্সের দৈর্ঘ্য</div>

                {/* Visual Diagram (✅ depends on Across) */}
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <div className="text-[10px] text-slate-500 text-center mb-2 font-semibold">
                    Top View / উপর থেকে
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    {Array.from({ length: acrossCount }).map((_, i) => (
                      <div
                        key={i}
                        className="w-7 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded border-2 border-emerald-700 flex flex-col items-center justify-center shadow-md"
                      >
                        <div className="text-white text-[9px] font-bold mb-0.5">W</div>
                        <div className="text-white text-xs font-extrabold">L</div>
                        <div className="text-white text-[10px]">→</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-emerald-700 text-center mt-2 font-bold">
                    Length (L) goes into depth
                  </div>
                  <div className="text-[9px] text-emerald-600 text-center font-semibold">
                    রো-এর দৈর্ঘ্য বরাবর বক্সের দৈর্ঘ্য
                  </div>
                </div>
              </button>

              {/* WIDTH_WISE */}
              <button
                type="button"
                onClick={() => setManualOrientation("WIDTH_WISE")}
                className={`rounded-xl border-2 p-4 transition-all text-left ${
                  manualOrientation === "WIDTH_WISE"
                    ? "border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-200"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow"
                }`}
              >
                <div className="font-bold text-sm text-slate-900 mb-1">Width-wise</div>
                <div className="text-[11px] text-slate-600 mb-3">রো-এর দৈর্ঘ্যের বরাবর বক্সের প্রস্থ</div>

                {/* Visual Diagram (✅ depends on Across) */}
                <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                  <div className="text-[10px] text-slate-500 text-center mb-2 font-semibold">
                    Top View / উপর থেকে
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    {Array.from({ length: acrossCount }).map((_, i) => (
                      <div
                        key={i}
                        className="w-10 h-7 bg-gradient-to-br from-blue-400 to-blue-600 rounded border-2 border-blue-700 flex flex-col items-center justify-center shadow-md"
                      >
                        <div className="text-white text-[9px] font-bold mb-0.5">L</div>
                        <div className="text-white text-xs font-extrabold">W</div>
                        <div className="text-white text-[10px]">→</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-blue-700 text-center mt-2 font-bold">
                    Width (W) goes into depth
                  </div>
                  <div className="text-[9px] text-blue-600 text-center font-semibold">
                    প্রস্থ গভীরতায় যায়
                  </div>
                </div>
              </button>
            </div>

            {/* Info box */}
            <div className="mt-3 rounded-lg bg-slate-100 border border-slate-200 p-3 text-xs">
              <div className="font-bold text-slate-900 mb-1">
                Selected:{" "}
                <span className={manualOrientation === "LENGTH_WISE" ? "text-emerald-600" : "text-blue-600"}>
                  {manualOrientation === "LENGTH_WISE"
                    ? "Length-wise (দৈর্ঘ্য বরাবর)"
                    : "Width-wise (প্রস্থ বরাবর)"}
                </span>
              </div>
              <div className="text-slate-600 text-[11px]">
                {manualOrientation === "LENGTH_WISE"
                  ? "Best for longer cartons where L > W"
                  : "Best for wider cartons where W > L"}
              </div>
            </div>
          </div>

          <Field icon={LayoutGrid} label="Cartons Across Row">
            <select
              className="input"
              value={manualAcross}
              onChange={(e) => setManualAcross(Number(e.target.value))}
            >
              <option value={1}>1 carton</option>
              <option value={2}>2 cartons</option>
              <option value={3}>3 cartons</option>
            </select>
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <KPI label="Total Qty" value={totalQty} />
          <KPI label="Pcs / Carton (final)" value={pcsPerCartonFinal} />
          <KPI label="Per Carton CBM" value={perCartonCbm.toFixed(6)} />
          <KPI label="Total CBM" value={totalCbm.toFixed(6)} />
          <KPI label="Total FOB" value={totalFob.toFixed(2)} />
        </div>

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

      {/* PLACEMENT INFO (small column beside form) */}
      <div className="lg:col-span-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-base font-extrabold text-slate-900">Placement Info</div>

            {isTypingDimsOrQty ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                <AlertCircle className="h-4 w-4" />
                Typing...
              </div>
            ) : previewLoading ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                <AlertCircle className="h-4 w-4" />
                Updating...
              </div>
            ) : preview?.metrics ? (
              unplaced > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                  <AlertCircle className="h-4 w-4" />
                  Partial
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  OK
                </div>
              )
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                <AlertCircle className="h-4 w-4" />
                Waiting
              </div>
            )}
          </div>

          {preview?.metrics ? (
            <>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <KPI label="Max Fit" value={maxFits || 0} />
                <KPI label="Requested" value={requested || 0} />
                <KPI label="Placed Now" value={previewCartonsPlaced} />
                <KPI label="Unplaced" value={unplaced || 0} />
                <KPI label="More Can Fit" value={moreCanFit || 0} />
                <KPI label="Columns Used" value={previewColumnsUsed} />
                <KPI label="Row Start (cm)" value={preview.metrics.rowStartAtCm} />
                <KPI label="Row End (cm)" value={preview.metrics.rowEndAtCm} />
                <KPI label="Remaining (cm)" value={preview.metrics.rowRemainingAfterCm} />
                <KPI label="Across" value={preview.metrics.across} />
                <KPI label="Layers" value={preview.metrics.layers} />
                <KPI label="Col Depth (cm)" value={preview.metrics.columnDepthCm} />
                <KPI label="Cartons/Col" value={preview.metrics.perColumnCapacity} />
                <KPI label="Allocated CBM" value={previewAllocatedCbm.toFixed(6)} />
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <span className="font-extrabold text-slate-900">Orientation:</span>{" "}
                {preview.metrics.orientation}
              </div>

              {previewErr ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {previewErr}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {isTypingDimsOrQty
                ? "Finish typing carton qty + W/L/H to see accurate preview."
                : previewErr || "Fill carton qty + dimensions to see preview."}
            </div>
          )}
        </div>
      </div>

      {/* GRAPHICAL PANE (own column, never under Placement Info) */}
      <div className="lg:col-span-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-7rem)] lg:overflow-auto">
        <GraphicalPane warehouse={warehouse} selectedRowId={rowId} preview={preview} />
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
          border-color: rgb(148 163 184);
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.25);
        }
        .input:disabled {
          background: rgb(241 245 249);
          cursor: not-allowed;
          opacity: 0.6;
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
