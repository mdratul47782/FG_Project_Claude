//app/fgComponents/FGEntryForm.jsx
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

// Mock auth - replace with actual auth context
const mockAuth = {
  assigned_building: "A-2",
  factory: "K-2",
};

export default function FGEntryForm() {
  const [floor, setFloor] = useState(mockAuth.assigned_building);
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

  // ✅ NEW: Manual orientation controls
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

  // ✅ Reset form function
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
          // ✅ Auth info
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
        `✅ Saved Successfully!\n\nEntry: ${entryData.entry.code}\nRow: ${preview.rowName}\nOrientation: ${manualOrientation}\nAcross: ${manualAcross}\nStart: ${preview.metrics.rowStartAtCm}cm\nEnd: ${preview.metrics.rowEndAtCm}cm\nRemaining: ${preview.metrics.rowRemainingAfterCm}cm`
      );

      // ✅ Reset form after successful save
      resetForm();
      await loadPreview();
    } catch (e) {
      alert("❌ Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
      {/* LEFT - Form */}
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>📝 Entry Form</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <Field label="Floor (auto)">
            <input value={floor} onChange={(e) => setFloor(e.target.value)} disabled />
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

          <Field label="Choose Row">
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

          {/* ✅ NEW: Orientation Controls */}
          <Field label="🔄 Carton Orientation">
            <select value={manualOrientation} onChange={(e) => setManualOrientation(e.target.value)}>
              <option value="LENGTH_WISE">Length-wise (L along row depth)</option>
              <option value="WIDTH_WISE">Width-wise (W along row depth)</option>
            </select>
          </Field>

          <Field label="📦 Cartons Across Row">
            <select value={manualAcross} onChange={(e) => setManualAcross(e.target.value)}>
              <option value="1">1 carton</option>
              <option value="2">2 cartons</option>
              <option value="3">3 cartons</option>
            </select>
          </Field>
        </div>

        {/* ✅ Orientation Visualization */}
        <div style={{ marginTop: 12, border: "1px solid #e0e0e0", borderRadius: 12, padding: 12, background: "#f8f9fa" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#333" }}>
            📐 Orientation Preview (Current: {manualOrientation === "LENGTH_WISE" ? "Length-wise" : "Width-wise"} × {manualAcross})
          </div>
          <OrientationDiagram 
            orientation={manualOrientation} 
            across={manualAcross}
            cartonW={n(w)}
            cartonL={n(l)}
            rowWidth={120}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        </div>

        <div style={{ marginTop: 0, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <KPI label="Total Qty" value={totalQty} />
          <KPI label="Per Carton CBM" value={perCartonCbm.toFixed(6)} />
          <KPI label="Total CBM" value={totalCbm.toFixed(6)} />
          <KPI label="Total FOB" value={totalFob.toFixed(2)} />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving || !preview?.rowId}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #111",
              background: saving || !preview?.rowId ? "#eee" : "#111",
              color: saving || !preview?.rowId ? "#999" : "#fff",
              cursor: saving || !preview?.rowId ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {saving ? "Saving..." : "💾 Save Entry + Allocation"}
          </button>
          <button
            onClick={resetForm}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #666",
              background: "#fff",
              color: "#666",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            🔄 Reset Form
          </button>
        </div>
      </div>

      {/* RIGHT - Placement Info + Graphical Pane */}
      <div style={{ display: "grid", gap: 16 }}>
        {/* ✅ Placement Info moved here */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "#f8f9fa" }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>📍 Placement Info</div>

          {preview?.metrics ? (
            <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <KPI label="Row Start (cm)" value={preview.metrics.rowStartAtCm} />
                <KPI label="Row End (cm)" value={preview.metrics.rowEndAtCm} />
                <KPI label="Remaining Length (cm)" value={preview.metrics.rowRemainingAfterCm} />
                <KPI label="Allocated Height (cm)" value={preview.metrics.allocatedHeightCm} />
                <KPI label="Remaining Height (cm)" value={preview.metrics.remainingHeightCm} />
                <KPI label="Across" value={preview.metrics.across} />
                <KPI label="Layers" value={preview.metrics.layers} />
                <KPI label="Column Depth (cm)" value={preview.metrics.columnDepthCm} />
                <KPI label="Columns Used" value={previewColumnsUsed} />
                <KPI label="Cartons/Column" value={preview.metrics.perColumnCapacity} />
                <KPI label="Cartons Placed" value={previewCartonsPlaced} />
                <KPI label="Allocated CBM" value={previewAllocatedCbm.toFixed(6)} />
              </div>
              <div style={{ marginTop: 8, padding: 8, background: "#e3f2fd", borderRadius: 6, fontSize: 12 }}>
                <strong>Orientation:</strong> {preview.metrics.orientation}
              </div>
            </div>
          ) : (
            <div style={{ color: "#d32f2f", fontSize: 14, padding: 12, background: "#ffebee", borderRadius: 6 }}>
              {previewErr || "⚠️ Fill carton qty + dimensions to see preview"}
            </div>
          )}
        </div>

        {/* Graphical View */}
        <GraphicalPane warehouse={warehouse} selectedRowId={rowId} preview={preview} />
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <span style={{ fontWeight: 700, color: "#333" }}>{label}</span>
      {children}
    </label>
  );
}

function KPI({ label, value }) {
  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 8, background: "#fff" }}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{value}</div>
    </div>
  );
}

function OrientationDiagram({ orientation, across, cartonW, cartonL, rowWidth }) {
  const svgW = 400;
  const svgH = 200;
  const margin = 20;
  
  // Determine carton dimensions based on orientation
  const isLengthWise = orientation === "LENGTH_WISE";
  const cartonAcrossWidth = isLengthWise ? cartonW : cartonL;
  const cartonDepth = isLengthWise ? cartonL : cartonW;
  
  // Check if fits
  const totalAcrossWidth = cartonAcrossWidth * across;
  const fits = totalAcrossWidth <= rowWidth;
  
  // Scale for drawing
  const maxWidth = svgW - 2 * margin;
  const scale = Math.min(maxWidth / Math.max(rowWidth, totalAcrossWidth), 1.5);
  
  const rowWidthPx = rowWidth * scale;
  const cartonWidthPx = cartonAcrossWidth * scale;
  const cartonDepthPx = Math.min(cartonDepth * scale, 80);
  
  const startX = margin;
  const rowY = svgH / 2 - cartonDepthPx / 2;
  
  return (
    <div>
      <svg width={svgW} height={svgH} style={{ border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}>
        {/* Row width indicator */}
        <rect 
          x={startX} 
          y={rowY - 15} 
          width={rowWidthPx} 
          height={cartonDepthPx + 30} 
          fill="#e3f2fd" 
          stroke="#1976d2" 
          strokeWidth="2"
          strokeDasharray="4 4"
          rx="4"
        />
        <text x={startX + rowWidthPx / 2} y={rowY - 20} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1976d2">
          Row Width: {rowWidth}cm
        </text>
        
        {/* Draw cartons */}
        {Array.from({ length: across }).map((_, i) => {
          const x = startX + i * cartonWidthPx;
          const fill = fits ? "#4caf50" : "#f44336";
          
          return (
            <g key={i}>
              <rect
                x={x}
                y={rowY}
                width={cartonWidthPx}
                height={cartonDepthPx}
                fill={fill}
                fillOpacity="0.7"
                stroke="#111"
                strokeWidth="2"
                rx="4"
              />
              <text 
                x={x + cartonWidthPx / 2} 
                y={rowY + cartonDepthPx / 2 - 8} 
                textAnchor="middle" 
                fontSize="10" 
                fontWeight="700" 
                fill="#fff"
              >
                Carton {i + 1}
              </text>
              <text 
                x={x + cartonWidthPx / 2} 
                y={rowY + cartonDepthPx / 2 + 4} 
                textAnchor="middle" 
                fontSize="9" 
                fill="#fff"
              >
                W:{cartonAcrossWidth.toFixed(0)}
              </text>
              <text 
                x={x + cartonWidthPx / 2} 
                y={rowY + cartonDepthPx / 2 + 15} 
                textAnchor="middle" 
                fontSize="9" 
                fill="#fff"
              >
                D:{cartonDepth.toFixed(0)}
              </text>
            </g>
          );
        })}
        
        {/* Total width indicator */}
        <line 
          x1={startX} 
          y1={rowY + cartonDepthPx + 15} 
          x2={startX + across * cartonWidthPx} 
          y2={rowY + cartonDepthPx + 15} 
          stroke={fits ? "#4caf50" : "#f44336"} 
          strokeWidth="2"
        />
        <text 
          x={startX + (across * cartonWidthPx) / 2} 
          y={rowY + cartonDepthPx + 28} 
          textAnchor="middle" 
          fontSize="10" 
          fontWeight="700" 
          fill={fits ? "#2e7d32" : "#c62828"}
        >
          Total: {totalAcrossWidth.toFixed(0)}cm {fits ? "✓ FITS" : "✗ TOO WIDE"}
        </text>
        
        {/* Legend */}
        <text x={startX} y={svgH - 10} fontSize="9" fill="#666">
          {isLengthWise ? "Length (L) goes into row depth →" : "Width (W) goes into row depth →"}
        </text>
      </svg>
      
      <div style={{ marginTop: 8, fontSize: 11, color: "#666", lineHeight: 1.4 }}>
        <div><strong>View from above:</strong></div>
        <div>• {isLengthWise ? "Carton LENGTH" : "Carton WIDTH"} ({isLengthWise ? cartonL : cartonW}cm) extends into the row (depth direction)</div>
        <div>• {isLengthWise ? "Carton WIDTH" : "Carton LENGTH"} ({cartonAcrossWidth}cm) × {across} = {totalAcrossWidth}cm across row width</div>
        {!fits && <div style={{ color: "#c62828", fontWeight: 700 }}>⚠️ Configuration doesn't fit! Choose fewer cartons or change orientation.</div>}
      </div>
    </div>
  );
}