// app/fgComponents/GraphicalPane.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

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

function allocBlocksFromAllocations(allocations = []) {
  const blocks = [];

  for (const a of allocations) {
    const allocationId = String(a._id || "");
    const buyer = String(a.buyer || "Unknown");
    const qty = n(a.qtyTotal);
    const cbm = cartonCbm(a.cartonDimCm) * qty;

    const metas = Array.isArray(a.segmentsMeta) ? a.segmentsMeta : [];

    if (metas.length > 0) {
      for (const m of metas) {
        blocks.push({
          key: `${allocationId}-${m.segmentIndex}-${m.startFromRowStartCm}`,
          allocationId,
          buyer,
          qty,
          cbm,
          segmentIndex: n(m.segmentIndex),
          start: n(m.startFromRowStartCm),
          end: n(m.endFromRowStartCm),
          len: n(m.allocatedLenCm),
          wastedTail: n(m.wastedTailCm),
        });
      }
    } else {
      blocks.push({
        key: `${allocationId}-fallback`,
        allocationId,
        buyer,
        qty,
        cbm,
        segmentIndex: 0,
        start: n(a.rowStartAtCm),
        end: n(a.rowEndAtCm),
        len: Math.max(0, n(a.rowEndAtCm) - n(a.rowStartAtCm)),
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

export default function GraphicalPane({ warehouse, selectedRowId, preview, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [allocations, setAllocations] = useState([]);

  async function load() {
    const r = await fetch(`/api/rows?warehouse=${warehouse}`);
    const rd = await r.json();
    setRows(rd.rows || []);

    const a = await fetch(`/api/allocations?warehouse=${warehouse}`);
    const ad = await a.json();
    setAllocations(ad.allocations || []);
  }

  useEffect(() => {
    load();
  }, [warehouse, refreshKey]);

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
    <div className="border border-slate-200 rounded-2xl p-6 bg-gradient-to-br from-orange-50 to-blue-50 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">Graphical View ({warehouse})</h2>
        <button
          onClick={load}
          className="px-4 py-2 rounded-full border border-slate-800 bg-slate-800 text-white font-bold hover:bg-slate-700 transition"
        >
          🔄 Refresh
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
            />
          );
        })}
      </div>
    </div>
  );
}

function RowCard({ row, allocations, preview, selected, stats, buyerStats }) {
  const buyerRows = Array.from(buyerStats.entries()).sort((a, b) => b[1].lengthCm - a[1].lengthCm);

  return (
    <div
      className={`rounded-xl p-4 bg-white transition-all ${
        selected
          ? "border-2 border-blue-600 shadow-xl"
          : "border border-slate-200 shadow-md hover:shadow-lg"
      }`}
    >
      <div className="flex justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <h3 className="text-lg font-black text-slate-800">{row.name}</h3>
            <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border border-slate-300 bg-slate-50 text-slate-700">
              {row.type === "continuous" ? "Continuous" : "Segmented"}
            </span>
            {row.type === "continuous" ? (
              <span className="text-sm text-slate-600">Length: {row.lengthCm} cm</span>
            ) : (
              <span className="text-sm text-slate-600">
                {Array.isArray(row.segments) ? `${row.segments.length} segments` : "Segmented row"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm text-slate-600 mb-2">
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

          <div className="text-sm text-slate-600 mb-2">
            <span className="font-bold text-slate-800">Total Allocated:</span> {stats.cartons} cartons,{" "}
            {stats.cbm.toFixed(3)} cbm
          </div>

          {buyerRows.length > 0 && (
            <div className="mt-3 text-sm">
              <div className="font-bold text-slate-800 mb-1">📋 By Buyer</div>
              <div className="space-y-1 text-slate-600">
                {buyerRows.map(([buyer, info]) => (
                  <div key={buyer} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colorFromKey(buyer) }}
                    />
                    <span>
                      {buyer}: {info.lengthCm.toFixed(1)} cm, {info.cartons} cartons, {info.cbm.toFixed(3)} cbm
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {preview?.metrics && (
          <div className="text-sm text-right bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="font-bold text-blue-800 mb-2">📍 Preview</div>
            <div className="space-y-1 text-slate-700">
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
        )}
      </div>

      <div className="mt-4">
        <RowBar row={row} allocations={allocations} preview={preview} buyerStats={buyerStats} colorMode="allocation" />
      </div>
    </div>
  );
}

function RowBar({ row, allocations, preview, buyerStats, colorMode = "allocation" }) {
  const W = 520;
  const H = 100;

  // ✅ pillar gap = pillar DIAMETER (not radius)
  // Backward compat rules:
  // - if diameterCm exists -> use it
  // - else if radiusCm >= 40 -> assume you saved diameter in radiusCm (like 60)
  // - else diameter = 2 * radiusCm
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

  // ✅ Build physical parts: [segment][pillar gap][segment]...
  const parts = [];
  for (let i = 0; i < segs.length; i++) {
    parts.push({ type: "segment", segmentIndex: segs[i].segmentIndex, lengthCm: segs[i].lengthCm });
    if (row.type === "segmented" && i < segs.length - 1) {
      const gap = pillarDiameterAfterSegmentCm(i); // ✅ diameter gap
      if (gap > 0) parts.push({ type: "pillar", boundaryIndex: i, lengthCm: gap });
    }
  }

  const totalPhysicalLen = parts.reduce((sum, p) => sum + n(p.lengthCm), 0);
  const safeTotalLen = totalPhysicalLen > 0 ? totalPhysicalLen : 1;
  const sx = (cm) => (n(cm) / safeTotalLen) * W;

  // ✅ Layout parts in px + cm ranges
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

  const blocks = allocBlocksFromAllocations(allocations);

  const previewBlocks = Array.isArray(preview?.segmentsMeta)
    ? preview.segmentsMeta.map((m, idx) => ({
        key: `pv-${idx}-${m.segmentIndex}-${m.startFromRowStartCm}`,
        start: n(m.startFromRowStartCm),
        len: n(m.allocatedLenCm),
      }))
    : [];

  const y = 15;
  const h = 55;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        {/* Clip whole bar (rounded) */}
        <clipPath id={clipRowId}>
          <rect x="0" y={y} width={W} height={h} rx="12" />
        </clipPath>

        {/* ✅ Clip ONLY segments (excludes pillar gaps) */}
        <clipPath id={clipSegId}>
          {segmentRects.map((r) => (
            <rect key={`c-${r.segmentIndex}`} x={r.segX} y={y} width={r.segW} height={h} />
          ))}
        </clipPath>

        <linearGradient id="segmentGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </linearGradient>

        <radialGradient id="pillarGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="55%" stopColor="#cbd5e1" stopOpacity="1" />
          <stop offset="100%" stopColor="#64748b" stopOpacity="1" />
        </radialGradient>

        <pattern id="pillarHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#0f172a" strokeOpacity="0.2" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Base outer */}
      <rect x="0" y={y} width={W} height={h} fill="url(#segmentGradient)" stroke="#0f172a" strokeWidth="2" rx="12">
        <title>{baseTip}</title>
      </rect>

      {/* Segment backgrounds + borders */}
      {segmentRects.map((r, i) => {
        const bg = colorFromKey(`seg-${i}`);
        const tip = [`📦 Segment ${i + 1}`, `Length: ${r.segLen} cm`, `Position: ${r.startCm} → ${r.endCm} cm`].join("\n");

        return (
          <g key={`seg-${r.segmentIndex}-${i}`}>
            <rect x={r.segX} y={y} width={r.segW} height={h} fill={bg} opacity="0.10" clipPath={`url(#${clipRowId})`}>
              <title>{tip}</title>
            </rect>
            <rect x={r.segX} y={y} width={r.segW} height={h} fill="transparent" stroke="#94a3b8" strokeWidth="1" />
            <text x={r.segX + r.segW / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">
              {r.segLen} cm
            </text>
          </g>
        );
      })}

      {/* ✅ Allocations clipped ONLY to segments (so NEVER shows inside pillar gap) */}
      <g clipPath={`url(#${clipSegId})`}>
        {blocks.map((b) => {
          const x = sx(b.start);
          const w = sx(b.len);
          if (w <= 0) return null;

          const fillKey = colorMode === "buyer" ? b.buyer : b.allocationId;
          const tip = [
            `🏢 ${b.buyer}`,
            `ID: ...${b.allocationId.slice(-6)}`,
            `📦 Cartons: ${b.qty}`,
            `📊 CBM: ${b.cbm.toFixed(3)}`,
            `📍 Position: ${b.start} → ${b.end} cm`,
            `📏 Reserved: ${b.len} cm`,
            b.usedLen ? `✓ Used: ${b.usedLen} cm` : "",
            b.wastedTail ? `⚠️ Wasted: ${b.wastedTail} cm` : "",
          ]
            .filter(Boolean)
            .join("\n");

          return (
            <rect
              key={b.key}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={colorFromKey(fillKey)}
              opacity="0.48"
              className="hover:opacity-65 transition-opacity cursor-pointer"
            >
              <title>{tip}</title>
            </rect>
          );
        })}
      </g>

      {/* ✅ Preview overlay clipped ONLY to segments */}
      <g clipPath={`url(#${clipSegId})`}>
        {previewBlocks.map((p) => {
          const x = sx(p.start);
          const w = sx(p.len);
          if (w <= 0) return null;
          return (
            <rect key={p.key} x={x} y={y} width={w} height={h} fill="#ef4444" opacity="0.28">
              <title>🔴 Preview (not saved yet)</title>
            </rect>
          );
        })}
      </g>

      {/* ✅ Pillar gaps drawn ON TOP (fully separate & clean) */}
      {pillarRects.map((p) => {
        const tip = [`⚫ Pillar (blocked)`, `Diameter: ${p.gapCm} cm`, `Position: ${p.startCm} → ${p.endCm} cm`].join("\n");

        const cx = p.x + p.w / 2;
        const cy = y + h / 2;

        // big circle that fits inside gap
        const rPx = Math.max(10, Math.min(h / 2 - 4, p.w / 2 - 4));

        return (
          <g key={`pillar-${p.boundaryIndex}`}>
            {/* gap area (opaque so it looks EMPTY/blocked, not mixed with colors) */}
            <rect x={p.x} y={y} width={p.w} height={h} fill="#ffffff" />
            <rect x={p.x} y={y} width={p.w} height={h} fill="url(#pillarHatch)" opacity="0.45" />
            <rect x={p.x} y={y} width={p.w} height={h} fill="transparent" stroke="#64748b" strokeWidth="1.5" strokeDasharray="6 4">
              <title>{tip}</title>
            </rect>

            {/* big pillar */}
            <circle cx={cx} cy={cy} r={rPx} fill="url(#pillarGrad)" stroke="#0f172a" strokeOpacity="0.55" strokeWidth="2">
              <title>{tip}</title>
            </circle>

            {/* label */}
            <text x={cx} y={y + 14} textAnchor="middle" fontSize="10" fill="#0f172a" fontWeight="800">
              {p.gapCm}cm
            </text>
          </g>
        );
      })}

      <text x="10" y="94" fontSize="10" fill="#64748b" fontWeight="600">
        💡 Hover for details | Colors = allocations | Red = preview | Pillar gap = blocked (no fill allowed)
      </text>
    </svg>
  );
}