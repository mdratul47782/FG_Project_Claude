// app/rows-two-side/page.js
"use client";

// ✅ Single scroll viewport (one scrollbar)
// ✅ Full-size RowCard design (same vibe as your GraphicalPane)
// ✅ Left side = B rows (allocations LEFT→RIGHT)
// ✅ Right side = A rows (allocations RIGHT→LEFT)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshCcw,
  Warehouse,
  Info,
  Layers,
  Ruler,
  Package,
  BarChart3,
  ArrowRight,
} from "lucide-react";

const PACK_TYPES = [
  { value: "SOLID_COLOR_SOLID_SIZE", label: "Solid Color Solid Size" },
  { value: "SOLID_COLOR_ASSORT_SIZE", label: "Solid Color Assort Size" },
  { value: "ASSORT_COLOR_SOLID_SIZE", label: "Assort Color Solid Size" },
  { value: "ASSORT_COLOR_ASSORT_SIZE", label: "Assort Color Assort Size" },
];

const PACK_TYPE_LABEL = PACK_TYPES.reduce((acc, p) => {
  acc[p.value] = p.label;
  return acc;
}, {});

function idStr(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if (v.$oid) return String(v.$oid);
    if (v._id) return idStr(v._id);
    if (typeof v.toString === "function") return v.toString();
  }
  return String(v);
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function colorFromKey(key) {
  let hash = 0;
  const s = String(key || "Unknown");
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 55%)`;
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

function sizesText(sizes) {
  const list = Array.isArray(sizes) ? sizes : [];
  const cleaned = list
    .map((x) => ({ size: String(x?.size || "").trim(), qty: n(x?.qty) }))
    .filter((x) => x.size && x.qty > 0);

  if (!cleaned.length) return "N/A";

  const total = cleaned.reduce((sum, x) => sum + x.qty, 0);
  const breakdown = cleaned.map((x) => `${x.size}=${x.qty}`).join(", ");
  return `${breakdown} (total ${total})`;
}

function normalizeOrientation(v) {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return "";
  if (s.includes("LENGTH")) return "LENGTH_WISE";
  if (s.includes("WIDTH")) return "WIDTH_WISE";
  return s;
}

function orientationUI(v) {
  const o = normalizeOrientation(v);
  if (o === "LENGTH_WISE") {
    return {
      code: "LENGTH_WISE",
      label: "Length-wise",
      explain: "L goes into row depth, W stays across row width",
      mini: "L → depth",
    };
  }
  if (o === "WIDTH_WISE") {
    return {
      code: "WIDTH_WISE",
      label: "Width-wise",
      explain: "W goes into row depth, L stays across row width",
      mini: "W → depth",
    };
  }
  return { code: o || "N/A", label: o || "N/A", explain: "", mini: "" };
}

function allocBlocksFromAllocations(allocations = [], entriesMap = new Map()) {
  const blocks = [];

  for (const a of allocations) {
    const allocationId = idStr(a?._id);
    const entryId = idStr(a?.entryId);
    const entry = entriesMap.get(entryId) || {};

    const buyer = String(a?.buyer || entry?.buyer || "Unknown");
    const qty = n(a?.qtyTotal);
    const cbm = cartonCbm(a?.cartonDimCm || entry?.cartonDimCm) * qty;

    const metas = Array.isArray(a?.segmentsMeta) ? a.segmentsMeta : [];

    if (metas.length > 0) {
      for (const m of metas) {
        const wasted = n(m?.wastedTailCm);
        const reserved = n(m?.allocatedLenCm);
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
          segmentIndex: n(m?.segmentIndex),
          start: n(m?.startFromRowStartCm),
          end: n(m?.endFromRowStartCm),
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
        start: n(a?.rowStartAtCm),
        end: n(a?.rowEndAtCm),
        len: Math.max(0, n(a?.rowEndAtCm) - n(a?.rowStartAtCm)),
        usedLen: 0,
        wastedTail: 0,
      });
    }
  }

  blocks.sort((x, y) => x.start - y.start);
  return blocks;
}

function rowHoverText({ row, allocations, buyerStats }) {
  const totalCartons = allocations.reduce((sum, a) => sum + n(a?.qtyTotal), 0);
  const totalCbm = allocations.reduce(
    (sum, a) => sum + cartonCbm(a?.cartonDimCm) * n(a?.qtyTotal),
    0
  );

  const buyerRows = Array.from((buyerStats || new Map()).entries())
    .sort((a, b) => (b[1]?.cartons || 0) - (a[1]?.cartons || 0))
    .map(([buyer, info]) => {
      return `${buyer}: ${n(info.cartons)} cartons, ${n(info.cbm).toFixed(3)} cbm, ${n(
        info.lengthCm
      ).toFixed(1)} cm`;
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

function rowPrefix(name) {
  const s = String(name || "").trim().toUpperCase();
  if (s.startsWith("A-")) return "A";
  if (s.startsWith("B-")) return "B";
  return "OTHER";
}

function rowNumber(name) {
  const s = String(name || "").trim();
  const parts = s.split("-");
  const num = Number(parts?.[1]);
  return Number.isFinite(num) ? num : 0;
}

function EmptyCard({ title = "—" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-extrabold text-slate-700">{title}</div>
      <div className="mt-1 text-xs text-slate-500">No row for this index</div>
      <div className="mt-4 h-[110px] rounded-2xl border border-dashed border-slate-300 bg-white" />
    </div>
  );
}

export default function RowsTwoSideSingleViewport() {
  const [warehouse, setWarehouse] = useState("B1");

  const [rows, setRows] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [entries, setEntries] = useState([]);

  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [selectedRowId, setSelectedRowId] = useState("");

  const lastSigRef = useRef("");

  const load = useCallback(
    async (signal) => {
      if (!warehouse) return;
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

        const r0 = nextRows[0] || {};
        const a0 = nextAllocs[0] || {};
        const e0 = nextEntries[0] || {};

        const sig = [
          "wh:" + warehouse,
          "rows:" + nextRows.length,
          idStr(r0?._id),
          "allocs:" + nextAllocs.length,
          idStr(a0?._id),
          a0?.updatedAt || a0?.createdAt || "",
          "entries:" + nextEntries.length,
          idStr(e0?._id),
          e0?.updatedAt || e0?.createdAt || "",
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
          // console.error(err);
        }
      } finally {
        setLoading(false);
      }
    },
    [warehouse]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);

    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(ctrl.signal);
    }, 8000);

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
    for (const e of entries) m.set(idStr(e?._id), e);
    return m;
  }, [entries]);

  const allocationsByRow = useMemo(() => {
    const m = new Map();
    for (const a of allocations) {
      const k = idStr(a?.rowId);
      const arr = m.get(k) || [];
      arr.push(a);
      m.set(k, arr);
    }
    return m;
  }, [allocations]);

  const allocationsStatsByRow = useMemo(() => {
    const m = new Map();
    for (const a of allocations) {
      const k = idStr(a?.rowId);
      const qty = n(a?.qtyTotal);
      const cbm = cartonCbm(a?.cartonDimCm) * qty;
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
      const rowKey = idStr(a?.rowId);
      const buyerKey = String(a?.buyer || "Unknown");
      const rowMap = m.get(rowKey) || new Map();

      const qty = n(a?.qtyTotal);
      const cbm = cartonCbm(a?.cartonDimCm) * qty;
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

  const { aRows, bRows } = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    const A = [];
    const B = [];

    for (const r of list) {
      const p = rowPrefix(r?.name);
      if (p === "A") A.push(r);
      else if (p === "B") B.push(r);
    }

    const sortFn = (x, y) => rowNumber(x?.name) - rowNumber(y?.name);
    A.sort(sortFn);
    B.sort(sortFn);

    return { aRows: A, bRows: B };
  }, [rows]);

  const pairs = useMemo(() => {
    const max = Math.max(aRows.length, bRows.length);
    return Array.from({ length: max }, (_, i) => ({
      b: bRows[i] || null,
      a: aRows[i] || null,
    }));
  }, [aRows, bRows]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-screen-2xl px-3 py-3">
        {/* HEADER */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-slate-700" />
              <div>
                <div className="text-lg font-extrabold text-slate-900">Rows Two-Side (Single Viewport)</div>
                <div className="text-xs text-slate-500">
                  Warehouse: <span className="font-bold text-slate-700">{warehouse}</span>
                  {lastUpdated ? (
                    <>
                      {" "}
                      • Updated: <span className="font-semibold">{lastUpdated.toLocaleTimeString()}</span>
                    </>
                  ) : null}{" "}
                  • Auto refresh every 8s
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  <b>One</b> scrollbar • Left = <b>B</b> (LTR) • Right = <b>A</b> (RTL) • B:{bRows.length} • A:{aRows.length}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="B1">B1</option>
                <option value="B2">B2</option>
              </select>

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
          </div>
        </div>

        {/* ✅ SINGLE VIEWPORT SCROLLER (one scrollbar) */}
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-[calc(100vh-190px)] overflow-y-auto pr-2 space-y-4">
            {pairs.map(({ b, a }, idx) => {
              const bId = idStr(b?._id);
              const aId = idStr(a?._id);

              return (
                <div key={`pair-${idx}`} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* LEFT = B */}
                  {b ? (
                    <RowCard
                      row={b}
                      allocations={allocationsByRow.get(bId) || []}
                      stats={allocationsStatsByRow.get(bId) || { cartons: 0, cbm: 0 }}
                      buyerStats={allocationsByBuyerByRow.get(bId) || new Map()}
                      entriesMap={entriesMap}
                      selected={bId === idStr(selectedRowId)}
                      onSelectRow={(r) => setSelectedRowId(idStr(r?._id))}
                      axisDir="ltr" // ✅ B = left→right
                    />
                  ) : (
                    <EmptyCard title="(No B row)" />
                  )}

                  {/* RIGHT = A */}
                  {a ? (
                    <RowCard
                      row={a}
                      allocations={allocationsByRow.get(aId) || []}
                      stats={allocationsStatsByRow.get(aId) || { cartons: 0, cbm: 0 }}
                      buyerStats={allocationsByBuyerByRow.get(aId) || new Map()}
                      entriesMap={entriesMap}
                      selected={aId === idStr(selectedRowId)}
                      onSelectRow={(r) => setSelectedRowId(idStr(r?._id))}
                      axisDir="rtl" // ✅ A = right→left
                    />
                  ) : (
                    <EmptyCard title="(No A row)" />
                  )}
                </div>
              );
            })}

            {pairs.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                No rows found for this warehouse.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function RowCard({
  row,
  allocations,
  selected,
  stats,
  buyerStats,
  entriesMap,
  onSelectRow,
  axisDir = "rtl", // "rtl" or "ltr"
}) {
  const buyerRows = Array.from(buyerStats.entries()).sort((a, b) => (b?.[1]?.lengthCm || 0) - (a?.[1]?.lengthCm || 0));

  const orientationSummary = useMemo(() => {
    const sum = { LENGTH_WISE: 0, WIDTH_WISE: 0, OTHER: 0 };
    for (const a of allocations) {
      const o = normalizeOrientation(a?.orientation || a?.manualOrientation);
      const qty = n(a?.qtyTotal);
      if (o === "LENGTH_WISE") sum.LENGTH_WISE += qty;
      else if (o === "WIDTH_WISE") sum.WIDTH_WISE += qty;
      else sum.OTHER += qty;
    }
    return sum;
  }, [allocations]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectRow?.(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelectRow?.(row);
      }}
      className={`rounded-2xl p-4 transition-all outline-none ${
        selected
          ? "cursor-pointer border-2 border-slate-900 bg-slate-50 shadow-sm"
          : "cursor-pointer border border-slate-200 bg-white hover:shadow-sm"
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

          {(orientationSummary.LENGTH_WISE > 0 || orientationSummary.WIDTH_WISE > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {orientationSummary.LENGTH_WISE > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-extrabold text-slate-800">
                  <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                  Stored: <span className="text-slate-900">Length-wise</span>
                  <span className="text-slate-500">(L → depth)</span>
                  <span className="text-slate-600">• {orientationSummary.LENGTH_WISE} cartons</span>
                </span>
              )}
              {orientationSummary.WIDTH_WISE > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-extrabold text-slate-800">
                  <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                  Stored: <span className="text-slate-900">Width-wise</span>
                  <span className="text-slate-500">(W → depth)</span>
                  <span className="text-slate-600">• {orientationSummary.WIDTH_WISE} cartons</span>
                </span>
              )}
            </div>
          )}

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
                      <span className="font-semibold text-slate-800">{buyer}</span>: {n(info?.lengthCm).toFixed(1)} cm,{" "}
                      {n(info?.cartons)} cartons, {n(info?.cbm).toFixed(3)} cbm
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Tiny side hint */}
        <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Info className="h-4 w-4 text-slate-700" />
            Axis
          </div>
          <div className="text-xs text-slate-600">
            {axisDir === "rtl" ? (
              <>
                Allocations: <b>RIGHT → LEFT</b>
              </>
            ) : (
              <>
                Allocations: <b>LEFT → RIGHT</b>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <RowBar row={row} allocations={allocations} buyerStats={buyerStats} entriesMap={entriesMap} axisDir={axisDir} />
      </div>
    </div>
  );
}

function RowBar({ row, allocations, buyerStats, entriesMap, axisDir = "rtl" }) {
  const W = 520;
  const H = 110;
  const isRTL = axisDir === "rtl";

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

  const pxPerCm = W / safeTotalLen;
  const sx = (cm) => n(cm) * pxPerCm;

  // ✅ x position based on axis direction
  const xFromStartLen = (startCm, lenCm) => (isRTL ? W - sx(n(startCm) + n(lenCm)) : sx(n(startCm)));

  // ✅ build segments/pillars in the same direction as axis
  let xCursor = isRTL ? W : 0;
  let cmCursor = 0;

  const segmentRects = [];
  const pillarRects = [];

  for (const p of parts) {
    const wPx = sx(p.lengthCm);
    const xPx = isRTL ? xCursor - wPx : xCursor;

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

    if (isRTL) xCursor -= wPx;
    else xCursor += wPx;

    cmCursor += n(p.lengthCm);
  }

  const baseTip = rowHoverText({ row, allocations, buyerStats });

  const safeId = String(idStr(row?._id) || row?.name || "row").replace(/[^\w-]/g, "-");
  const clipRowId = `clip-row-${safeId}`;
  const clipSegId = `clip-segs-${safeId}`;

  const blocks = allocBlocksFromAllocations(allocations, entriesMap);

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
              <rect key={`c-${r.segmentIndex}-${r.segX}`} x={r.segX} y={y} width={r.segW} height={h} />
            ))}
          </clipPath>

          <linearGradient id={`segmentGradient-${safeId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f8fafc" />
          </linearGradient>

          <radialGradient id={`pillarGrad-${safeId}`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="55%" stopColor="#cbd5e1" stopOpacity="1" />
            <stop offset="100%" stopColor="#64748b" stopOpacity="1" />
          </radialGradient>

          <pattern
            id={`pillarHatch-${safeId}`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="#0f172a" strokeOpacity="0.18" strokeWidth="2" />
          </pattern>
        </defs>

        <rect
          x="0"
          y={y}
          width={W}
          height={h}
          fill={`url(#segmentGradient-${safeId})`}
          stroke="#0f172a"
          strokeWidth="2"
          rx="14"
        >
          <title>{baseTip}</title>
        </rect>

        {segmentRects.map((r, i) => {
          const tip = [`Segment ${i + 1}`, `Length: ${r.segLen} cm`, `Position: ${r.startCm} → ${r.endCm} cm`].join("\n");
          return (
            <g key={`seg-${safeId}-${r.segmentIndex}-${i}`}>
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
              <text x={r.segX + r.segW / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#334155">
                {r.segLen} cm
              </text>
            </g>
          );
        })}

        <g clipPath={`url(#${clipSegId})`}>
          {blocks.map((b) => {
            const w = sx(b.len);
            if (w <= 0) return null;

            const x = xFromStartLen(b.start, b.len);

            const entry = b.entry || {};
            const alloc = b.allocation || {};

            const dim = entry.cartonDimCm || alloc.cartonDimCm || {};
            const o = orientationUI(alloc.orientation || alloc.manualOrientation);

            const packTypeLabel = PACK_TYPE_LABEL[entry.packType] || entry.packType || "N/A";
            const sizesLine = sizesText(entry.sizes);

            const createdBy = entry.createdBy || {};
            const inputter = `${createdBy.user_name || "N/A"} (${createdBy.role || "N/A"})`;

            const orientationLine = o.code === "N/A" ? "Orientation: N/A" : `Orientation: ${o.label} (${o.mini})`;
            const orientationExplain = o.explain ? `Meaning: ${o.explain}` : "";

            const tip = [
              `Entry: ${entry.code || "N/A"}`,
              `Buyer: ${b.buyer}`,
              `Warehouse: ${entry.warehouse || alloc.warehouse || "N/A"}`,
              `Floor: ${entry.floor || "N/A"} | Factory: ${createdBy.factory || "N/A"} | Assigned Building: ${
                createdBy.assigned_building || "N/A"
              }`,
              `Inputter: ${inputter}`,
              `---`,
              `Season: ${entry.season || "N/A"} | PO: ${entry.poNumber || "N/A"}`,
              `Style: ${entry.style || "N/A"} | Model: ${entry.model || "N/A"}`,
              `Item: ${entry.item || "N/A"} | Color: ${entry.color || "N/A"}`,
              `Pack Type: ${packTypeLabel}`,
              `Sizes/Carton: ${sizesLine}`,
              `---`,
              `Cartons: ${b.qty} | Pcs/Carton: ${entry.pcsPerCarton ?? "N/A"} | Total Pcs: ${entry.totalQty ?? "N/A"}`,
              `Dims: ${n(dim.w)}×${n(dim.l)}×${n(dim.h)} cm`,
              `Total CBM: ${b.cbm.toFixed(3)}`,
              `---`,
              `Start: ${b.start} cm → End: ${b.end} cm`,
              `Reserved: ${b.len} cm${b.usedLen ? ` | Used: ${b.usedLen} cm` : ""}${b.wastedTail ? ` | Wasted: ${b.wastedTail} cm` : ""}`,
              orientationLine,
              orientationExplain,
              `Across: ${alloc.across || "N/A"} | Layers: ${alloc.layers || "N/A"}`,
              `Depth/Column: ${alloc.columnDepthCm || "N/A"} cm`,
              `---`,
              `Updated: ${formatDate(entry.updatedAt)} | Created: ${formatDate(entry.createdAt)} | Status: ${entry.status || "N/A"}`,
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
                fill={colorFromKey(b.allocationId)}
                opacity={0.5}
                className="hover:opacity-70 transition-opacity cursor-pointer"
              >
                <title>{tip}</title>
              </rect>
            );
          })}
        </g>

        {pillarRects.map((p) => {
          const tip = [`Pillar (blocked)`, `Diameter: ${p.gapCm} cm`, `Position: ${p.startCm} → ${p.endCm} cm`].join("\n");

          const cx = p.x + p.w / 2;
          const cy = y + h / 2;
          const rPx = Math.max(10, Math.min(h / 2 - 4, p.w / 2 - 4));

          return (
            <g key={`pillar-${safeId}-${p.boundaryIndex}`}>
              <rect x={p.x} y={y} width={p.w} height={h} fill="#ffffff" />
              <rect x={p.x} y={y} width={p.w} height={h} fill={`url(#pillarHatch-${safeId})`} opacity="0.45" />
              <rect x={p.x} y={y} width={p.w} height={h} fill="transparent" stroke="#64748b" strokeWidth="1.5" strokeDasharray="6 4">
                <title>{tip}</title>
              </rect>
              <circle cx={cx} cy={cy} r={rPx} fill={`url(#pillarGrad-${safeId})`} stroke="#0f172a" strokeOpacity="0.45" strokeWidth="2">
                <title>{tip}</title>
              </circle>
              <text x={cx} y={y + 14} textAnchor="middle" fontSize="10" fill="#0f172a" fontWeight="900">
                {p.gapCm}cm
              </text>
            </g>
          );
        })}

        <text x="10" y="102" fontSize="10" fill="#64748b" fontWeight="700">
          Hover blocks for details • Pillar = blocked
        </text>
      </svg>

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
          Axis: {isRTL ? "RIGHT→LEFT" : "LEFT→RIGHT"}
        </span>
      </div>
    </div>
  );
}
