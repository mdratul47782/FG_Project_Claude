// app/fgComponents/GraphicalPane.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCcw,
  Warehouse,
  Info,
  Layers,
  Ruler,
  Package,
  BarChart3,
} from "lucide-react";

function colorFromKey(key) {
  let hash = 0;
  const s = String(key || "Unknown");
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 55%)`;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function cartonCbm(cartonDimCm) {
  const w = n(cartonDimCm?.w);
  const l = n(cartonDimCm?.l);
  const h = n(cartonDimCm?.h);
  return (w * l * h) / 1_000_000;
}

function allocationLengthCm(allocation) {
  if (!allocation?.columnsBySegment) return 0;
  return allocation.columnsBySegment.reduce((sum, s) => sum + n(s.lengthUsedCm), 0);
}

function formatDate(dt) {
  if (!dt) return "N/A";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return String(dt);
  }
}

function allocBlocksFromAllocations(allocations = [], entriesMap = new Map()) {
  const blocks = [];

  for (const a of allocations) {
    const allocationId = String(a._id || "");
    const entryId = String(a.entryId || "");
    const entry = entriesMap.get(entryId) || {};

    const buyer = String(a.buyer || entry.buyer || "Unknown");
    const qty = n(a.qtyTotal);
    const cbm = cartonCbm(a.cartonDimCm) * qty;

    const metas = Array.isArray(a.segmentsMeta) ? a.segmentsMeta : [];

    if (metas.length > 0) {
      for (const m of metas) {
        const wasted = n(m.wastedTailCm);
        const reserved = n(m.allocatedLenCm);
        const usedLen = reserved > 0 ? Math.max(0, reserved - wasted) : 0;

        blocks.push({
          key: `${allocationId}-${m.segmentIndex}-${m.startFromRowStartCm}`,
          allocationId,
          entryId,
          entry,
          allocation: a,
          buyer,
          qty,
          cbm,
          segmentIndex: n(m.segmentIndex),
          start: n(m.startFromRowStartCm),
          end: n(m.endFromRowStartCm),
          len: reserved,
          usedLen,
          wastedTail: wasted,
        });
      }
    } else {
      blocks.push({
        key: `${allocationId}-fallback`,
        allocationId,
        entryId,
        entry,
        allocation: a,
        buyer,
        qty,
        cbm,
        segmentIndex: 0,
        start: n(a.rowStartAtCm),
        end: n(a.rowEndAtCm),
        len: Math.max(0, n(a.rowEndAtCm) - n(a.rowStartAtCm)),
        usedLen: 0,
        wastedTail: 0,
      });
    }
  }

  blocks.sort((x, y) => x.start - y.start);
  return blocks;
}

function rowHoverText({ row, allocations, buyerStats }) {
  const totalCartons = allocations.reduce((sum, a) => sum + n(a.qtyTotal), 0);
  const totalCbm = allocations.reduce((sum, a) => sum + cartonCbm(a.cartonDimCm) * n(a.qtyTotal), 0);

  const buyerRows = Array.from((buyerStats || new Map()).entries())
    .sort((a, b) => (b[1]?.cartons || 0) - (a[1]?.cartons || 0))
    .map(([buyer, info]) => {
      return `${buyer}: ${n(info.cartons)} cartons, ${n(info.cbm).toFixed(3)} cbm, ${n(info.lengthCm).toFixed(1)} cm`;
    });

  return [
    `${row.name} (${row.type})`,
    `Total: ${totalCartons} cartons, ${totalCbm.toFixed(3)} cbm`,
    buyerRows.length ? "----------------" : "",
    ...buyerRows,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function GraphicalPane({ warehouse, selectedRowId, preview }) {
  const [rows, setRows] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ✅ Avoid re-render if nothing changed
  const lastSigRef = useRef("");

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const headers = { "Cache-Control": "no-cache" };

      const [r, a, e] = await Promise.all([
        fetch(`/api/rows?warehouse=${warehouse}`, { signal, headers, cache: "no-store" }),
        fetch(`/api/allocations?warehouse=${warehouse}`, { signal, headers, cache: "no-store" }),
        fetch(`/api/entries?warehouse=${warehouse}`, { signal, headers, cache: "no-store" }),
      ]);

      const [rd, ad, ed] = await Promise.all([r.json(), a.json(), e.json()]);

      const nextRows = rd.rows || [];
      const nextAllocs = ad.allocations || [];
      const nextEntries = ed.entries || [];

      // Signature: changes when newest allocation/entry changes
      const sig = [
        warehouse,
        nextRows.length,
        nextAllocs.length,
        nextAllocs[0]?._id || "",
        nextEntries.length,
        nextEntries[0]?._id || "",
        nextEntries[0]?.updatedAt || "",
        nextAllocs[0]?.createdAt || "",
      ].join("|");

      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        setRows(nextRows);
        setAllocations(nextAllocs);
        setEntries(nextEntries);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        // keep quiet UI; you can console.log if needed
        // console.error(err);
      }
    } finally {
      setLoading(false);
    }
  }, [warehouse]);

  // ✅ Auto refresh: polling + refresh on focus
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);

    const intervalMs = 8000; // auto refresh every 8s
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(ctrl.signal);
    }, intervalMs);

    const onFocus = () => load(ctrl.signal);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      ctrl.abort();
    };
  }, [load]);

  const entriesMap = useMemo(() => {
    const m = new Map();
    for (const e of entries) m.set(String(e._id), e);
    return m;
  }, [entries]);

  const allocationsByRow = useMemo(() => {
    const m = new Map();
    for (const a of allocations) {
      const k = String(a.rowId);
      const arr = m.get(k) || [];
      arr.push(a);
      m.set(k, arr);
    }
    return m;
  }, [allocations]);

  const allocationsStatsByRow = useMemo(() => {
    const m = new Map();
    for (const a of allocations) {
      const k = String(a.rowId);
      const qty = n(a.qtyTotal);
      const cbm = cartonCbm(a.cartonDimCm) * qty;
      const prev = m.get(k) || { cartons: 0, cbm: 0 };
      prev.cartons += qty;
      prev.cbm += cbm;
      m.set(k, prev);
    }
    return m;
  }, [allocations]);

  const allocationsByBuyerByRow = useMemo(() => {
    const m = new Map();
    for (const a of allocations) {
      const rowKey = String(a.rowId);
      const buyerKey = String(a.buyer || "Unknown");
      const rowMap = m.get(rowKey) || new Map();

      const qty = n(a.qtyTotal);
      const cbm = cartonCbm(a.cartonDimCm) * qty;
      const lengthCm = allocationLengthCm(a);

      const prev = rowMap.get(buyerKey) || { cartons: 0, cbm: 0, lengthCm: 0 };
      prev.cartons += qty;
      prev.cbm += cbm;
      prev.lengthCm += lengthCm;
      rowMap.set(buyerKey, prev);
      m.set(rowKey, rowMap);
    }
    return m;
  }, [allocations]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-slate-700" />
          <div>
            <div className="text-lg font-extrabold text-slate-900">Graphical View</div>
            <div className="text-xs text-slate-500">
              Warehouse: <span className="font-bold text-slate-700">{warehouse}</span>
              {lastUpdated ? (
                <>
                  {" "}
                  • Updated: <span className="font-semibold">{lastUpdated.toLocaleTimeString()}</span>
                </>
              ) : null}
              {" "}
              • Auto refresh every 8s
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            const ctrl = new AbortController();
            load(ctrl.signal);
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const rowAllocs = allocationsByRow.get(String(row._id)) || [];
          const isSelected = String(row._id) === String(selectedRowId);
          const stats = allocationsStatsByRow.get(String(row._id)) || { cartons: 0, cbm: 0 };
          const buyerStats = allocationsByBuyerByRow.get(String(row._id)) || new Map();

          return (
            <RowCard
              key={row._id}
              row={row}
              allocations={rowAllocs}
              stats={stats}
              buyerStats={buyerStats}
              preview={isSelected ? preview : null}
              selected={isSelected}
              entriesMap={entriesMap}
            />
          );
        })}
      </div>
    </div>
  );
}

function RowCard({ row, allocations, preview, selected, stats, buyerStats, entriesMap }) {
  const buyerRows = Array.from(buyerStats.entries()).sort((a, b) => b[1].lengthCm - a[1].lengthCm);

  return (
    <div
      className={`rounded-2xl p-4 transition-all ${
        selected
          ? "border-2 border-slate-900 bg-slate-50 shadow-sm"
          : "border border-slate-200 bg-white hover:shadow-sm"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[280px] flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <div className="text-base font-extrabold text-slate-900">{row.name}</div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
              {row.type === "continuous" ? "Continuous" : "Segmented"}
            </span>
            {row.type === "continuous" ? (
              <span className="text-sm text-slate-600">
                <Ruler className="mr-1 inline h-4 w-4 text-slate-500" />
                Length: <span className="font-semibold">{row.lengthCm}</span> cm
              </span>
            ) : (
              <span className="text-sm text-slate-600">
                <Layers className="mr-1 inline h-4 w-4 text-slate-500" />
                {Array.isArray(row.segments) ? `${row.segments.length} segments` : "Segmented"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-3">
            <div>
              <span className="font-bold text-slate-800">Width:</span> {row.widthCm} cm
            </div>
            <div>
              <span className="font-bold text-slate-800">Max Height:</span> {row.maxHeightCm} cm
            </div>
            <div>
              <span className="font-bold text-slate-800">Allocations:</span> {allocations.length}
            </div>
          </div>

          <div className="mt-2 text-sm text-slate-600">
            <span className="font-bold text-slate-800">Total Allocated:</span> {stats.cartons} cartons,{" "}
            {stats.cbm.toFixed(3)} cbm
          </div>

          {buyerRows.length > 0 ? (
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <BarChart3 className="h-4 w-4 text-slate-700" />
                By Buyer
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                {buyerRows.map(([buyer, info]) => (
                  <div key={buyer} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFromKey(buyer) }} />
                    <span>
                      <span className="font-semibold text-slate-800">{buyer}</span>:{" "}
                      {info.lengthCm.toFixed(1)} cm, {info.cartons} cartons, {info.cbm.toFixed(3)} cbm
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {preview?.metrics ? (
          <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <Info className="h-4 w-4 text-slate-700" />
              Preview
            </div>
            <div className="grid gap-1 text-sm text-slate-700">
              <div>
                <span className="font-semibold">Start:</span> {preview.metrics.rowStartAtCm} cm
              </div>
              <div>
                <span className="font-semibold">End:</span> {preview.metrics.rowEndAtCm} cm
              </div>
              <div>
                <span className="font-semibold">Remaining:</span> {preview.metrics.rowRemainingAfterCm} cm
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <RowBar
          row={row}
          allocations={allocations}
          preview={preview}
          buyerStats={buyerStats}
          entriesMap={entriesMap}
          colorMode="allocation"
        />
      </div>
    </div>
  );
}

function RowBar({ row, allocations, preview, buyerStats, entriesMap, colorMode = "allocation" }) {
  const W = 520;
  const H = 110;

  function pillarDiameterAfterSegmentCm(segmentIndex) {
    if (row?.type !== "segmented") return 0;
    const p = (row.pillars || []).find((x) => n(x.atSegmentBoundaryIndex) === n(segmentIndex));
    const d = n(p?.diameterCm);
    const r = n(p?.radiusCm);
    if (d > 0) return d;
    if (r <= 0) return 0;
    return r >= 40 ? r : 2 * r;
  }

  const segs =
    row.type === "continuous"
      ? [{ segmentIndex: 0, lengthCm: n(row.lengthCm) }]
      : (row.segments || []).map((s, i) => ({ segmentIndex: i, lengthCm: n(s.lengthCm) }));

  // physical parts: seg + pillar + seg...
  const parts = [];
  for (let i = 0; i < segs.length; i++) {
    parts.push({ type: "segment", segmentIndex: segs[i].segmentIndex, lengthCm: segs[i].lengthCm });
    if (row.type === "segmented" && i < segs.length - 1) {
      const gap = pillarDiameterAfterSegmentCm(i);
      if (gap > 0) parts.push({ type: "pillar", boundaryIndex: i, lengthCm: gap });
    }
  }

  const totalPhysicalLen = parts.reduce((sum, p) => sum + n(p.lengthCm), 0);
  const safeTotalLen = totalPhysicalLen > 0 ? totalPhysicalLen : 1;
  const sx = (cm) => (n(cm) / safeTotalLen) * W;

  let xCursor = 0;
  let cmCursor = 0;

  const segmentRects = [];
  const pillarRects = [];

  for (const p of parts) {
    const wPx = sx(p.lengthCm);
    const xPx = xCursor;
    const startCm = cmCursor;
    const endCm = cmCursor + n(p.lengthCm);

    if (p.type === "segment") {
      segmentRects.push({
        segmentIndex: p.segmentIndex,
        segX: xPx,
        segW: wPx,
        segLen: n(p.lengthCm),
        startCm,
        endCm,
      });
    } else {
      pillarRects.push({
        boundaryIndex: p.boundaryIndex,
        gapCm: n(p.lengthCm),
        x: xPx,
        w: wPx,
        startCm,
        endCm,
      });
    }

    xCursor += wPx;
    cmCursor += n(p.lengthCm);
  }

  const baseTip = rowHoverText({ row, allocations, buyerStats });

  const clipRowId = `clip-row-${String(row._id || row.name).replace(/\s+/g, "-")}`;
  const clipSegId = `clip-segs-${String(row._id || row.name).replace(/\s+/g, "-")}`;

  const blocks = allocBlocksFromAllocations(allocations, entriesMap);

  const previewBlocks = Array.isArray(preview?.segmentsMeta)
    ? preview.segmentsMeta.map((m, idx) => ({
        key: `pv-${idx}-${m.segmentIndex}-${m.startFromRowStartCm}`,
        start: n(m.startFromRowStartCm),
        len: n(m.allocatedLenCm),
      }))
    : [];

  const y = 18;
  const h = 58;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <clipPath id={clipRowId}>
            <rect x="0" y={y} width={W} height={h} rx="14" />
          </clipPath>

          <clipPath id={clipSegId}>
            {segmentRects.map((r) => (
              <rect key={`c-${r.segmentIndex}`} x={r.segX} y={y} width={r.segW} height={h} />
            ))}
          </clipPath>

          <linearGradient id="segmentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f8fafc" />
          </linearGradient>

          <radialGradient id="pillarGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="55%" stopColor="#cbd5e1" stopOpacity="1" />
            <stop offset="100%" stopColor="#64748b" stopOpacity="1" />
          </radialGradient>

          <pattern id="pillarHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#0f172a" strokeOpacity="0.18" strokeWidth="2" />
          </pattern>
        </defs>

        {/* base */}
        <rect
          x="0"
          y={y}
          width={W}
          height={h}
          fill="url(#segmentGradient)"
          stroke="#0f172a"
          strokeWidth="2"
          rx="14"
        >
          <title>{baseTip}</title>
        </rect>

        {/* segment backgrounds */}
        {segmentRects.map((r, i) => {
          const tip = [`Segment ${i + 1}`, `Length: ${r.segLen} cm`, `Position: ${r.startCm} → ${r.endCm} cm`].join("\n");
          return (
            <g key={`seg-${r.segmentIndex}-${i}`}>
              <rect
                x={r.segX}
                y={y}
                width={r.segW}
                height={h}
                fill={colorFromKey(`seg-${i}`)}
                opacity="0.08"
                clipPath={`url(#${clipRowId})`}
              >
                <title>{tip}</title>
              </rect>
              <rect x={r.segX} y={y} width={r.segW} height={h} fill="transparent" stroke="#cbd5e1" strokeWidth="1" />
              <text
                x={r.segX + r.segW / 2}
                y={y + h / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="800"
                fill="#334155"
              >
                {r.segLen} cm
              </text>
            </g>
          );
        })}

        {/* allocations clipped to segments only */}
        <g clipPath={`url(#${clipSegId})`}>
          {blocks.map((b) => {
            const x = sx(b.start);
            const w = sx(b.len);
            if (w <= 0) return null;

            const fillKey = colorMode === "buyer" ? b.buyer : b.allocationId;

            const entry = b.entry || {};
            const alloc = b.allocation || {};
            const dim = entry.cartonDimCm || alloc.cartonDimCm || {};

            const tip = [
              `Entry: ${entry.code || "N/A"}`,
              `Buyer: ${b.buyer}`,
              `Warehouse: ${entry.warehouse || alloc.warehouse || "N/A"}`,
              `Floor: ${entry.floor || "N/A"} | Factory: ${entry.factory || "N/A"} | Building: ${entry.assigned_building || "N/A"}`,
              `---`,
              `Season: ${entry.season || "N/A"} | PO: ${entry.poNumber || "N/A"}`,
              `Style: ${entry.style || "N/A"} | Model: ${entry.model || "N/A"}`,
              `Item: ${entry.item || "N/A"} | Color: ${entry.color || "N/A"} | Size: ${entry.size || "N/A"}`,
              `---`,
              `Cartons: ${b.qty} | Pcs/Carton: ${entry.pcsPerCarton || "N/A"} | Total Pcs: ${entry.totalQty || "N/A"}`,
              `Dims: ${n(dim.w)}×${n(dim.l)}×${n(dim.h)} cm`,
              `Total CBM: ${b.cbm.toFixed(3)}`,
              `---`,
              `Start: ${b.start} cm → End: ${b.end} cm`,
              `Reserved: ${b.len} cm${b.usedLen ? ` | Used: ${b.usedLen} cm` : ""}${b.wastedTail ? ` | Wasted: ${b.wastedTail} cm` : ""}`,
              `Orientation: ${alloc.orientation || "N/A"} | Across: ${alloc.across || "N/A"} | Layers: ${alloc.layers || "N/A"}`,
              `Depth/Column: ${alloc.columnDepthCm || "N/A"} cm`,
              `---`,
              `Created: ${formatDate(entry.createdAt)} | Status: ${entry.status || "N/A"}`,
            ].join("\n");

            return (
              <rect
                key={b.key}
                x={x}
                y={y}
                width={w}
                height={h}
                fill={colorFromKey(fillKey)}
                opacity="0.50"
                className="hover:opacity-70 transition-opacity cursor-pointer"
              >
                <title>{tip}</title>
              </rect>
            );
          })}
        </g>

        {/* preview overlay */}
        <g clipPath={`url(#${clipSegId})`}>
          {previewBlocks.map((p) => {
            const x = sx(p.start);
            const w = sx(p.len);
            if (w <= 0) return null;
            return (
              <rect key={p.key} x={x} y={y} width={w} height={h} fill="#ef4444" opacity="0.22">
                <title>Preview (not saved)</title>
              </rect>
            );
          })}
        </g>

        {/* pillars */}
        {pillarRects.map((p) => {
          const tip = [`Pillar (blocked)`, `Diameter: ${p.gapCm} cm`, `Position: ${p.startCm} → ${p.endCm} cm`].join("\n");

          const cx = p.x + p.w / 2;
          const cy = y + h / 2;
          const rPx = Math.max(10, Math.min(h / 2 - 4, p.w / 2 - 4));

          return (
            <g key={`pillar-${p.boundaryIndex}`}>
              <rect x={p.x} y={y} width={p.w} height={h} fill="#ffffff" />
              <rect x={p.x} y={y} width={p.w} height={h} fill="url(#pillarHatch)" opacity="0.45" />
              <rect x={p.x} y={y} width={p.w} height={h} fill="transparent" stroke="#64748b" strokeWidth="1.5" strokeDasharray="6 4">
                <title>{tip}</title>
              </rect>
              <circle cx={cx} cy={cy} r={rPx} fill="url(#pillarGrad)" stroke="#0f172a" strokeOpacity="0.45" strokeWidth="2">
                <title>{tip}</title>
              </circle>
              <text x={cx} y={y + 14} textAnchor="middle" fontSize="10" fill="#0f172a" fontWeight="900">
                {p.gapCm}cm
              </text>
            </g>
          );
        })}

        <text x="10" y="102" fontSize="10" fill="#64748b" fontWeight="700">
          Hover blocks for details • Red = preview • Pillar = blocked
        </text>
      </svg>

      {/* tiny legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <Package className="h-4 w-4 text-slate-500" />
          Allocations
        </span>
        <span className="inline-flex items-center gap-1">
          <Ruler className="h-4 w-4 text-slate-500" />
          Segment lengths
        </span>
        <span className="inline-flex items-center gap-1">
          <Layers className="h-4 w-4 text-slate-500" />
          Preview overlay
        </span>
      </div>
    </div>
  );
}
