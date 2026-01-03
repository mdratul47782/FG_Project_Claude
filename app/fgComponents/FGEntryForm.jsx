//app\fgComponents\FGEntryForm.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import GraphicalPane from "./GraphicalPane";

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

export default function FGEntryForm() {
  const [floor, setFloor] = useState("A-2"); // TODO replace from auth.assigned_building
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
  }, [rowId, buyer, cartonQty, w, l, h]);

  async function handleSave() {
    setSaving(true);
    try {
      if (!preview?.rowId) throw new Error("No valid preview for this row.");

      // 1) Save Entry
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
        }),
      });
      const entryData = await entryRes.json();
      if (!entryData.ok) throw new Error(entryData.message || "Entry save failed");

      // 2) Save Allocation in USER selected row
      const allocRes = await fetch("/api/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entryData.entry._id,
          rowId: preview.rowId,
        }),
      });
      const allocData = await allocRes.json();
      if (!allocData.ok) throw new Error(allocData.message || "Allocation save failed");

      alert(
        `Saved!\nEntry: ${entryData.entry.code}\nRow: ${preview.rowName}\nStart: ${preview.metrics.rowStartAtCm}cm\nEnd: ${preview.metrics.rowEndAtCm}cm\nRemaining: ${preview.metrics.rowRemainingAfterCm}cm`
      );

      await loadPreview();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12, alignItems: "start" }}>
      {/* LEFT */}
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <Field label="Floor (auto)">
            <input value={floor} onChange={(e) => setFloor(e.target.value)} />
          </Field>

          <Field label="Warehouse">
            <select value={warehouse} onChange={(e) => { setWarehouse(e.target.value); setRowId(""); }}>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
            </select>
          </Field>

          <Field label="Buyer">
            <select value={buyer} onChange={(e) => setBuyer(e.target.value)}>
              {BUYERS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>

          <Field label="Choose Row (manual)">
            <select value={rowId} onChange={(e) => setRowId(e.target.value)}>
              {rows.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name} ({r.type === "continuous" ? `${r.lengthCm}cm` : "segmented"})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Season"><input value={season} onChange={(e) => setSeason(e.target.value)} /></Field>
          <Field label="PO Number"><input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} /></Field>
          <Field label="Style"><input value={style} onChange={(e) => setStyle(e.target.value)} /></Field>
          <Field label="Model"><input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
          <Field label="Item"><input value={item} onChange={(e) => setItem(e.target.value)} /></Field>
          <Field label="Color"><input value={color} onChange={(e) => setColor(e.target.value)} /></Field>
          <Field label="Size"><input value={size} onChange={(e) => setSize(e.target.value)} /></Field>

          <Field label="Pcs per Carton"><input type="number" value={pcsPerCarton} onChange={(e) => setPcsPerCarton(e.target.value)} /></Field>
          <Field label="Carton Qty"><input type="number" value={cartonQty} onChange={(e) => setCartonQty(e.target.value)} /></Field>

          <Field label="Carton W (cm)"><input type="number" value={w} onChange={(e) => setW(e.target.value)} /></Field>
          <Field label="Carton L (cm)"><input type="number" value={l} onChange={(e) => setL(e.target.value)} /></Field>
          <Field label="Carton H (cm)"><input type="number" value={h} onChange={(e) => setH(e.target.value)} /></Field>

          <Field label="FOB (per pcs)"><input type="number" value={fobPerPcs} onChange={(e) => setFobPerPcs(e.target.value)} /></Field>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <KPI label="Total Qty" value={totalQty} />
          <KPI label="Per Carton CBM" value={perCartonCbm.toFixed(6)} />
          <KPI label="Total CBM" value={totalCbm.toFixed(6)} />
          <KPI label="Total FOB" value={totalFob.toFixed(2)} />
        </div>

        {/* ✅ cm from bottom/start + remaining */}
        <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Placement Info (cm)</div>

          {preview?.metrics ? (
            <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <div>
                <b>Row start (from bottom/start):</b> {preview.metrics.rowStartAtCm} cm
              </div>
              <div>
                <b>Row end:</b> {preview.metrics.rowEndAtCm} cm
              </div>
              <div>
                <b>Remaining length after allocation:</b> {preview.metrics.rowRemainingAfterCm} cm
              </div>
              <div>
                <b>Allocated height:</b> {preview.metrics.allocatedHeightCm} cm &nbsp; | &nbsp;
                <b>Remaining height:</b> {preview.metrics.remainingHeightCm} cm
              </div>
              <div>
                <b>Across:</b> {preview.metrics.across} &nbsp; | &nbsp;
                <b>Layers:</b> {preview.metrics.layers} &nbsp; | &nbsp;
                <b>Depth/Column:</b> {preview.metrics.columnDepthCm} cm
              </div>
              <div>
                <b>Columns used:</b> {previewColumnsUsed} &nbsp; | &nbsp;
                <b>Cartons/Column:</b> {preview.metrics.perColumnCapacity}
              </div>
              <div>
                <b>Cartons placed:</b> {previewCartonsPlaced} &nbsp; | &nbsp;
                <b>Allocated CBM:</b> {previewAllocatedCbm.toFixed(6)} cbm
              </div>
              <div>
                <b>Per Carton CBM:</b> {perCartonCbm.toFixed(6)} cbm
              </div>
            </div>
          ) : (
            <div style={{ color: "#b00020", fontSize: 13 }}>
              {previewErr || "Fill qty + dimensions to see preview."}
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={handleSave}
            disabled={saving || !preview?.rowId}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: saving ? "#eee" : "#111",
              color: saving ? "#111" : "#fff",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Save Entry + Allocation"}
          </button>
          {!preview?.rowId && <span style={{ color: "#b00020" }}>{previewErr}</span>}
        </div>
      </div>

      {/* RIGHT */}
      <GraphicalPane warehouse={warehouse} selectedRowId={rowId} preview={preview} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function KPI({ label, value }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
      <div style={{ fontSize: 12, color: "#555" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
