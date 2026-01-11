// app/scan-shipment/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function parseBarcode(raw) {
  const s = String(raw || "").trim();
  const parts = s.split("-").filter(Boolean);

  if (parts.length < 2) return { barcode: s, entryCode: "", cartonId: "" };

  const last = parts[parts.length - 1];
  const looksLikeCarton = /^\d{1,6}$/.test(last);

  if (!looksLikeCarton) return { barcode: s, entryCode: s, cartonId: "" };

  return {
    barcode: s,
    entryCode: parts.slice(0, -1).join("-"),
    cartonId: last,
  };
}

function Field({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium break-words">{value ?? "-"}</div>
    </div>
  );
}

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

function cartonCbm(dim) {
  const w = n(dim?.w);
  const l = n(dim?.l);
  const h = n(dim?.h);
  return (w * l * h) / 1_000_000;
}

function colorFromKey(key) {
  let hash = 0;
  const s = String(key || "Unknown");
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 55%)`;
}

// ✅ Mini row bar for ONLY allocated row
function RowOnlyBar({ row, allocations = [], entries = [], highlightEntryId }) {
  const entriesMap = useMemo(() => {
    const m = new Map();
    for (const e of entries || []) m.set(idStr(e?._id), e);
    return m;
  }, [entries]);

  const W = 760;
  const H = 120;

  function pillarDiameterAfterSegmentCm(segmentIndex) {
    if (String(row?.type) !== "segmented") return 0;
    const p = (row.pillars || []).find((x) => n(x.atSegmentBoundaryIndex) === n(segmentIndex));
    const d = n(p?.diameterCm);
    const r = n(p?.radiusCm);
    if (d > 0) return d;
    if (r <= 0) return 0;
    return r >= 40 ? r : 2 * r;
  }

  const segs =
    row?.type === "continuous"
      ? [{ segmentIndex: 0, lengthCm: n(row.lengthCm) }]
      : (row?.segments || []).map((s, i) => ({ segmentIndex: i, lengthCm: n(s.lengthCm) }));

  const parts = [];
  for (let i = 0; i < segs.length; i++) {
    parts.push({ type: "segment", segmentIndex: segs[i].segmentIndex, lengthCm: segs[i].lengthCm });
    if (String(row?.type) === "segmented" && i < segs.length - 1) {
      const gap = pillarDiameterAfterSegmentCm(i);
      if (gap > 0) parts.push({ type: "pillar", boundaryIndex: i, lengthCm: gap });
    }
  }

  const totalPhysicalLen = parts.reduce((sum, p) => sum + n(p.lengthCm), 0);
  const safeTotalLen = totalPhysicalLen > 0 ? totalPhysicalLen : 1;

  const pxPerCm = W / safeTotalLen;
  const sx = (cm) => n(cm) * pxPerCm;

  // ✅ RIGHT → LEFT axis
  const xFromStartLen = (startCm, lenCm) => W - sx(n(startCm) + n(lenCm));

  // build segment + pillar rects from RIGHT → LEFT
  let xCursor = W;
  let cmCursor = 0;

  const segmentRects = [];
  const pillarRects = [];

  for (const p of parts) {
    const wPx = sx(p.lengthCm);
    const xPx = xCursor - wPx;

    const startCm = cmCursor;
    const endCm = cmCursor + n(p.lengthCm);

    if (p.type === "segment") {
      segmentRects.push({
        segX: xPx,
        segW: wPx,
        segLen: n(p.lengthCm),
        startCm,
        endCm,
        segmentIndex: p.segmentIndex,
      });
    } else {
      pillarRects.push({
        x: xPx,
        w: wPx,
        gapCm: n(p.lengthCm),
        startCm,
        endCm,
        boundaryIndex: p.boundaryIndex,
      });
    }

    xCursor -= wPx;
    cmCursor += n(p.lengthCm);
  }

  // blocks (supports segmentsMeta)
  const blocks = [];
  for (const a of allocations || []) {
    const entryId = idStr(a?.entryId);
    const entry = entriesMap.get(entryId) || {};
    const metas = Array.isArray(a?.segmentsMeta) ? a.segmentsMeta : [];

    const qty = n(a?.qtyTotal);
    const cbm = cartonCbm(a?.cartonDimCm || entry?.cartonDimCm) * qty;

    if (metas.length) {
      for (const m of metas) {
        blocks.push({
          key: `${idStr(a?._id)}-${m.segmentIndex}-${m.startFromRowStartCm}`,
          entryId,
          entry,
          alloc: a,
          start: n(m?.startFromRowStartCm),
          len: n(m?.allocatedLenCm),
          end: n(m?.endFromRowStartCm),
          qty,
          cbm,
        });
      }
    } else {
      blocks.push({
        key: `${idStr(a?._id)}-fallback`,
        entryId,
        entry,
        alloc: a,
        start: n(a?.rowStartAtCm),
        len: Math.max(0, n(a?.rowEndAtCm) - n(a?.rowStartAtCm)),
        end: n(a?.rowEndAtCm),
        qty,
        cbm,
      });
    }
  }

  const y = 22;
  const h = 58;

  const totalCartons = allocations.reduce((sum, a) => sum + n(a?.qtyTotal), 0);
  const totalCbm = allocations.reduce(
    (sum, a) => sum + cartonCbm(a?.cartonDimCm) * n(a?.qtyTotal),
    0
  );

  // ✅ table rows (so PO/Style is visible without hover)
  const tableRows = (allocations || []).map((a) => {
    const entryId = idStr(a?.entryId);
    const entry = entriesMap.get(entryId) || {};
    const cbm = cartonCbm(a?.cartonDimCm || entry?.cartonDimCm) * n(a?.qtyTotal);

    return {
      key: idStr(a?._id) || entryId,
      entryId,
      code: entry.code || "-",
      buyer: entry.buyer || a.buyer || "-",
      season: entry.season || "-",
      po: entry.poNumber || "-",
      style: entry.style || "-",
      model: entry.model || "-",
      item: entry.item || "-",
      color: entry.color || "-",
      cartons: n(a?.qtyTotal),
      start: n(a?.rowStartAtCm),
      end: n(a?.rowEndAtCm),
      cbm,
    };
  });

  const hitId = idStr(highlightEntryId);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold">Allocated Row (only)</div>
        <div className="text-xs text-gray-600">
          Row: <span className="font-medium">{row?.name}</span> • Type:{" "}
          <span className="font-medium">{row?.type}</span>
          {" • "}
          Total: <span className="font-medium">{totalCartons}</span> cartons •{" "}
          <span className="font-medium">{totalCbm.toFixed(3)}</span> cbm
        </div>
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <clipPath id="clipRowOnly">
            <rect x="0" y={y} width={W} height={h} rx="14" />
          </clipPath>
        </defs>

        <rect x="0" y={y} width={W} height={h} fill="#f8fafc" stroke="#0f172a" strokeWidth="2" rx="14" />

        {/* segments */}
        {segmentRects.map((r, i) => (
          <g key={`seg-${i}-${r.segX}`}>
            <rect
              x={r.segX}
              y={y}
              width={r.segW}
              height={h}
              fill={colorFromKey(`seg-${i}`)}
              opacity="0.08"
              clipPath="url(#clipRowOnly)"
            />
            <rect x={r.segX} y={y} width={r.segW} height={h} fill="transparent" stroke="#cbd5e1" strokeWidth="1" />
            <text x={r.segX + r.segW / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#334155">
              {r.segLen} cm
            </text>
          </g>
        ))}

        {/* allocations */}
        <g clipPath="url(#clipRowOnly)">
          {blocks.map((b) => {
            const w = sx(b.len);
            if (w <= 0) return null;

            const x = xFromStartLen(b.start, b.len);
            const isHit = idStr(b.entryId) === hitId;

            const entry = b.entry || {};
            const alloc = b.alloc || {};
            const dim = entry.cartonDimCm || alloc.cartonDimCm || {};

            const tip = [
              `Entry: ${entry.code || "N/A"}`,
              `Buyer: ${entry.buyer || alloc.buyer || "N/A"}`,
              `Season: ${entry.season || "N/A"} | PO: ${entry.poNumber || "N/A"}`,
              `Style: ${entry.style || "N/A"} | Model: ${entry.model || "N/A"}`,
              `Item: ${entry.item || "N/A"} | Color: ${entry.color || "N/A"}`,
              `---`,
              `Cartons: ${b.qty} | Total CBM: ${b.cbm.toFixed(3)}`,
              `Dims: ${n(dim.w)}×${n(dim.l)}×${n(dim.h)} cm`,
              `Start: ${b.start} cm → End: ${b.end} cm (Len ${b.len} cm)`,
            ].join("\n");

            return (
              <rect
                key={b.key}
                x={x}
                y={y}
                width={w}
                height={h}
                fill={colorFromKey(alloc._id || alloc.entryId || entry.code)}
                opacity={isHit ? 0.78 : 0.42}
                stroke={isHit ? "#0f172a" : "none"}
                strokeWidth={isHit ? 2 : 0}
              >
                <title>{tip}</title>
              </rect>
            );
          })}
        </g>

        {/* pillars */}
        {pillarRects.map((p) => (
          <g key={`pillar-${p.boundaryIndex}`}>
            <rect x={p.x} y={y} width={p.w} height={h} fill="#ffffff" />
            <rect x={p.x} y={y} width={p.w} height={h} fill="transparent" stroke="#64748b" strokeWidth="1.5" strokeDasharray="6 4">
              <title>{`Pillar (blocked)\nDiameter: ${p.gapCm} cm\nPosition: ${p.startCm} → ${p.endCm} cm`}</title>
            </rect>
            <text x={p.x + p.w / 2} y={y + 14} textAnchor="middle" fontSize="10" fill="#0f172a" fontWeight="900">
              {p.gapCm}cm
            </text>
          </g>
        ))}

        <text x="10" y="110" fontSize="10" fill="#64748b" fontWeight="700">
          Hover blocks for details • Bold outline = scanned entry
        </text>
      </svg>

      {/* ✅ Visible table (PO/Style/etc) */}
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-sm border rounded">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Code</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Buyer</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Season</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">PO</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Style</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Model</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Item</th>
              <th className="px-3 py-2 text-left text-xs font-bold text-gray-600">Color</th>
              <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">Cartons</th>
              <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">Start→End (cm)</th>
              <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">CBM</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => {
              const isHit = idStr(r.entryId) === hitId;
              return (
                <tr key={r.key} className={`border-t ${isHit ? "bg-yellow-50" : "bg-white"}`}>
                  <td className="px-3 py-2 font-semibold">{r.code}</td>
                  <td className="px-3 py-2">{r.buyer}</td>
                  <td className="px-3 py-2">{r.season}</td>
                  <td className="px-3 py-2">{r.po}</td>
                  <td className="px-3 py-2">{r.style}</td>
                  <td className="px-3 py-2">{r.model}</td>
                  <td className="px-3 py-2">{r.item}</td>
                  <td className="px-3 py-2">{r.color}</td>
                  <td className="px-3 py-2 text-right">{r.cartons}</td>
                  <td className="px-3 py-2 text-right">
                    {r.start}→{r.end}
                  </td>
                  <td className="px-3 py-2 text-right">{r.cbm.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ScanShipmentPage() {
  const inputRef = useRef(null);

  const [barcode, setBarcode] = useState("");
  const parsed = useMemo(() => parseBarcode(barcode), [barcode]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function fetchByBarcode(bc) {
    const v = (bc ?? barcode).trim();
    if (!v) return;

    setLoading(true);
    setError("");
    setActionMsg("");
    setData(null);

    try {
      const res = await fetch(`/api/fg/scan?barcode=${encodeURIComponent(v)}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) throw new Error(json?.message || "Failed to scan");
      setData(json);

      setBarcode("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAllocation() {
    const entryCode = data?.entryCode || data?.entry?.code;
    if (!entryCode) return;

    const ok = window.confirm(`Delete allocation for ${entryCode} and mark shipped = true?`);
    if (!ok) return;

    setLoading(true);
    setError("");
    setActionMsg("");

    try {
      const res = await fetch(`/api/fg/entries/${encodeURIComponent(entryCode)}/allocation`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Delete failed");

      setActionMsg("✅ Allocation deleted and entry marked shipped.");
      await fetchByBarcode(entryCode);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Scan Shipment</h1>
            <p className="text-sm text-gray-600">
              Scan barcode like <span className="font-medium">FG-35598929-003</span>. It will extract entry code + carton id, then show entry + allocation + row.
            </p>
          </div>

          <button
            className="px-3 py-2 rounded border text-sm"
            onClick={() => {
              setBarcode("");
              setData(null);
              setError("");
              setActionMsg("");
              inputRef.current?.focus();
            }}
          >
            Clear
          </button>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <label className="text-sm font-medium">Barcode</label>

          <input
            ref={inputRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                fetchByBarcode();
              }
            }}
            placeholder="Scan here..."
            className="w-full px-3 py-3 rounded border text-lg outline-none"
            inputMode="text"
            autoComplete="off"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Parsed Entry Code" value={parsed.entryCode || "-"} />
            <Field label="Carton ID" value={parsed.cartonId || "-"} />
            <div className="flex items-end">
              <button
                className="w-full px-3 py-3 rounded bg-black text-white text-sm disabled:opacity-50"
                disabled={loading || !barcode.trim()}
                onClick={() => fetchByBarcode()}
              >
                {loading ? "Loading..." : "Find Entry"}
              </button>
            </div>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {actionMsg ? <div className="text-sm text-green-700">{actionMsg}</div> : null}
        </div>

        {data?.entry ? (
          <div className="grid grid-cols-1 gap-4">
            {/* Entry */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Entry</h2>
                  <div className="text-sm text-gray-600">
                    Code: <span className="font-medium">{data.entry.code}</span>
                  </div>
                </div>

                <div className="text-right text-sm">
                  <div>
                    Status: <span className="font-medium">{data.entry.status}</span>
                  </div>
                  <div>
                    Shipped:{" "}
                    <span className="font-medium">
                      {data.entry.shipped ? "Yes ✅" : "No"}
                    </span>
                  </div>
                </div>
              </div>

              {/* ✅ FULL entry info including PO/Style/etc */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Warehouse" value={data.entry.warehouse} />
                <Field label="Floor" value={data.entry.floor} />
                <Field label="Buyer" value={data.entry.buyer} />

                <Field label="Season" value={data.entry.season} />
                <Field label="PO Number" value={data.entry.poNumber} />
                <Field label="Style" value={data.entry.style} />
                <Field label="Model" value={data.entry.model} />
                <Field label="Item" value={data.entry.item} />
                <Field label="Color" value={data.entry.color} />

                <Field label="Pack Type" value={data.entry.packType} />
                <Field label="PCS/Carton" value={data.entry.pcsPerCarton} />
                <Field label="Carton Qty" value={data.entry.cartonQty} />
                <Field label="Total Qty" value={data.entry.totalQty} />
                <Field label="Total CBM" value={data.entry.totalCbm} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Carton Dim (cm)"
                  value={
                    data.entry.cartonDimCm
                      ? `${data.entry.cartonDimCm.w} x ${data.entry.cartonDimCm.l} x ${data.entry.cartonDimCm.h}`
                      : "-"
                  }
                />
                <Field
                  label="Sizes"
                  value={
                    Array.isArray(data.entry.sizes) && data.entry.sizes.length
                      ? data.entry.sizes.map((s) => `${s.size}:${s.qty}`).join(", ")
                      : "-"
                  }
                />
              </div>
            </div>

            {/* Allocation + Row */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Allocation in Row</h2>

                <button
                  className="px-3 py-2 rounded border text-sm disabled:opacity-50"
                  disabled={loading || !data.allocation || data.entry.shipped}
                  onClick={deleteAllocation}
                  title={
                    !data.allocation
                      ? "No allocation found"
                      : data.entry.shipped
                      ? "Already shipped"
                      : "Delete allocation"
                  }
                >
                  Delete Allocation (Mark Shipped)
                </button>
              </div>

              {!data.allocation ? (
                <div className="text-sm text-gray-600">
                  No allocation found for this entry.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Orientation" value={data.allocation.orientation} />
                    <Field label="Across" value={data.allocation.across} />
                    <Field label="Layers" value={data.allocation.layers} />
                    <Field label="Qty Total" value={data.allocation.qtyTotal} />
                    <Field label="Row Start (cm)" value={data.allocation.rowStartAtCm} />
                    <Field label="Row End (cm)" value={data.allocation.rowEndAtCm} />
                    <Field label="Row Remaining (cm)" value={data.allocation.rowRemainingAfterCm} />
                    <Field label="Row Width (cm)" value={data.allocation.rowWidthCm} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field
                      label="Segments Meta"
                      value={
                        Array.isArray(data.allocation.segmentsMeta) &&
                        data.allocation.segmentsMeta.length
                          ? data.allocation.segmentsMeta
                              .map(
                                (s) =>
                                  `#${s.segmentIndex}: start ${s.segmentStartCm}, len ${s.segmentLengthCm}, used ${s.allocatedLenCm}`
                              )
                              .join(" | ")
                          : "-"
                      }
                    />
                    <Field
                      label="Columns By Segment"
                      value={
                        Array.isArray(data.allocation.columnsBySegment) &&
                        data.allocation.columnsBySegment.length
                          ? data.allocation.columnsBySegment
                              .map(
                                (c) =>
                                  `#${c.segmentIndex}: cols ${c.columnsUsed}, qty ${c.qtyPlaced}, len ${c.lengthUsedCm}`
                              )
                              .join(" | ")
                          : "-"
                      }
                    />
                  </div>

                  <div className="rounded border p-3">
                    <div className="text-sm font-medium mb-2">Row Info</div>
                    {!data.row ? (
                      <div className="text-sm text-gray-600">
                        Row not found (rowId missing?)
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="Row Name" value={data.row.name} />
                        <Field label="Row Warehouse" value={data.row.warehouse} />
                        <Field label="Type" value={data.row.type} />
                        <Field
                          label="Length / Segments"
                          value={
                            data.row.type === "continuous"
                              ? `${data.row.lengthCm ?? "-"} cm`
                              : Array.isArray(data.row.segments)
                              ? `${data.row.segments.length} segments`
                              : "-"
                          }
                        />
                      </div>
                    )}
                  </div>

                  {/* ✅ ONLY this allocated row (not other rows) */}
                  {data?.row && Array.isArray(data?.rowAllocations) && Array.isArray(data?.rowEntries) ? (
                    <RowOnlyBar
                      row={data.row}
                      allocations={data.rowAllocations}
                      entries={data.rowEntries}
                      highlightEntryId={data.entry?._id}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
