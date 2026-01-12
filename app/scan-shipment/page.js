// app/scan-shipment/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

/* ----------------------------- helpers ----------------------------- */
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

/* ----------------------------- UI bits ----------------------------- */
function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-800 ring-slate-200",
    green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    red: "bg-rose-100 text-rose-800 ring-rose-200",
    yellow: "bg-amber-100 text-amber-900 ring-amber-200",
    blue: "bg-sky-100 text-sky-900 ring-sky-200",
    violet: "bg-violet-100 text-violet-900 ring-violet-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
        tones[tone] || tones.slate
      }`}
    >
      {children}
    </span>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4">
      <div className="min-w-0">
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-4 h-px bg-slate-100" />;
}

function Field({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 px-3 py-2.5">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 break-words">{value ?? "-"}</div>
    </div>
  );
}

function IconCamera({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 7l1.2-2.1c.2-.35.58-.57.99-.57h1.62c.41 0 .79.22.99.57L15 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 7h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 17a4 4 0 100-8 4 4 0 000 8z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function Spinner({ className = "w-4 h-4" }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------- camera scanner -------------------------- */
function CameraBarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);

  const lastTextRef = useRef("");
  const lastAtRef = useRef(0);

  const [scanError, setScanError] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState([]);

  function pickBackCamera(list) {
    const byLabel = list.find((d) => /back|rear|environment/i.test(d.label || ""));
    return byLabel?.deviceId || list[0]?.deviceId || "";
  }

  async function stop() {
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;

    try {
      const v = videoRef.current;
      const stream = v?.srcObject;
      if (stream && typeof stream.getTracks === "function") {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (v) v.srcObject = null;
    } catch {}
  }

  async function start(id) {
    setScanError("");

    try {
      await stop();

      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      const reader = readerRef.current;

      const vid = videoRef.current;
      if (!vid) return;

      const controls = await reader.decodeFromVideoDevice(id || undefined, vid, (result) => {
        if (!result) return;

        const text = String(result.getText() || "").trim();
        if (!text) return;

        const now = Date.now();
        if (text === lastTextRef.current && now - lastAtRef.current < 1200) return;

        lastTextRef.current = text;
        lastAtRef.current = now;

        try {
          controls?.stop();
        } catch {}

        onDetected?.(text);
      });

      controlsRef.current = controls;
    } catch (e) {
      setScanError(e?.message || "Camera scan failed. Check permissions/HTTPS.");
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {}

      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!alive) return;

        setDevices(list);
        const picked = pickBackCamera(list);
        setDeviceId(picked);
        await start(picked);
      } catch (e) {
        if (!alive) return;
        setScanError(e?.message || "No camera found or permission denied.");
      }
    })();

    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl ring-1 ring-black/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Scan Barcode (Camera)</div>
            <div className="mt-0.5 text-xs text-slate-600">Point the camera at the barcode — it auto-detects.</div>
          </div>

          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            onClick={async () => {
              await stop();
              onClose?.();
            }}
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          {devices.length > 1 ? (
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-slate-600 whitespace-nowrap">Camera</div>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={deviceId}
                onChange={async (e) => {
                  const id = e.target.value;
                  setDeviceId(id);
                  await start(id);
                }}
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 6)}…`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-black">
            <video ref={videoRef} className="w-full h-[360px] object-cover" muted playsInline autoPlay />
          </div>

          {scanError ? (
            <div className="rounded-xl bg-rose-50 text-rose-800 ring-1 ring-rose-100 px-3 py-2 text-sm">
              {scanError}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-100 px-3 py-2 text-xs">
              Tips: Use HTTPS. On iPhone: Settings → Safari → Camera access must be allowed.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- row bar ----------------------------- */
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

  // RIGHT → LEFT axis
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
  const totalCbm = allocations.reduce((sum, a) => sum + cartonCbm(a?.cartonDimCm) * n(a?.qtyTotal), 0);

  // visible table rows
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
    <Card className="overflow-hidden">
      <CardHeader
        title="Allocated Row (only)"
        subtitle={
          <span className="text-slate-600">
            Row: <span className="font-semibold text-slate-900">{row?.name}</span> • Type:{" "}
            <span className="font-semibold text-slate-900">{row?.type}</span> • Total:{" "}
            <span className="font-semibold text-slate-900">{totalCartons}</span> cartons •{" "}
            <span className="font-semibold text-slate-900">{totalCbm.toFixed(3)}</span> cbm
          </span>
        }
      />

      <div className="px-4 pb-4 pt-3 space-y-4">
        {/* ✅ responsive svg: fits its container; scrolls only if you WANT */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 overflow-hidden">
          <svg
            width="100%"
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <clipPath id="clipRowOnly">
                <rect x="0" y={y} width={W} height={h} rx="14" />
              </clipPath>
            </defs>

            <rect x="0" y={y} width={W} height={h} fill="#ffffff" stroke="#0f172a" strokeWidth="2" rx="14" />

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
                <rect
                  x={p.x}
                  y={y}
                  width={p.w}
                  height={h}
                  fill="transparent"
                  stroke="#64748b"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                >
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
        </div>

        {/* table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Code", "Buyer", "Season", "PO", "Style", "Model", "Item", "Color", "Cartons", "Start→End (cm)", "CBM"].map(
                  (h) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-left text-[11px] font-extrabold tracking-wide text-slate-600 ${
                        h === "Cartons" || h === "Start→End (cm)" || h === "CBM" ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => {
                const isHit = idStr(r.entryId) === hitId;
                return (
                  <tr key={r.key} className={`border-t border-slate-100 ${isHit ? "bg-amber-50" : "bg-white"}`}>
                    <td className="px-3 py-2 font-bold text-slate-900">{r.code}</td>
                    <td className="px-3 py-2 text-slate-700">{r.buyer}</td>
                    <td className="px-3 py-2 text-slate-700">{r.season}</td>
                    <td className="px-3 py-2 text-slate-700">{r.po}</td>
                    <td className="px-3 py-2 text-slate-700">{r.style}</td>
                    <td className="px-3 py-2 text-slate-700">{r.model}</td>
                    <td className="px-3 py-2 text-slate-700">{r.item}</td>
                    <td className="px-3 py-2 text-slate-700">{r.color}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{r.cartons}</td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {r.start}→{r.end}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{r.cbm.toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ page ------------------------------ */
export default function ScanShipmentPage() {
  const inputRef = useRef(null);

  const [barcode, setBarcode] = useState("");
  const parsed = useMemo(() => parseBarcode(barcode), [barcode]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [actionMsg, setActionMsg] = useState("");

  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function fetchByBarcode(bc) {
    const v = String(bc ?? barcode).trim();
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
      const res = await fetch(`/api/fg/entries/${encodeURIComponent(entryCode)}/allocation`, { method: "DELETE" });
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

  const shipped = !!data?.entry?.shipped;

  return (
    // ✅ Fits the whole page to ONE viewport; internal panels scroll instead
    <div className="h-[100dvh] overflow-hidden bg-gradient-to-b from-slate-50 to-white">
      {showCamera ? (
        <CameraBarcodeScanner
          onDetected={(text) => {
            setShowCamera(false);
            setBarcode(String(text || "").toUpperCase());
            fetchByBarcode(text);
          }}
          onClose={() => {
            setShowCamera(false);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
        />
      ) : null}

      <div className="mx-auto max-w-6xl h-full px-3 py-3 md:px-6 md:py-5 flex flex-col gap-4">
        {/* header (fixed height) */}
        <div className="shrink-0 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
                <span className="text-sm font-black">FG</span>
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Scan Shipment</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Scan barcode like <span className="font-semibold text-slate-900">FG-35598929-003</span> to fetch entry +
                  allocation + allocated row.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {data?.entry ? (
              <div className="hidden md:flex items-center gap-2">
                <Badge tone="blue">Entry: {data.entry.code}</Badge>
                <Badge tone={shipped ? "green" : "yellow"}>{shipped ? "Shipped ✅" : "Not shipped"}</Badge>
              </div>
            ) : null}

            <button
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
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
        </div>

        {/* main (fills remaining height, no page scroll) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 gap-4 md:grid-cols-[380px_1fr] md:items-stretch">
          {/* LEFT: scanner (scrolls inside if needed) */}
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader
              title="Scanner"
              subtitle="Use handheld scanner or phone camera. Press Enter to search."
              right={
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  disabled={loading}
                  onClick={() => setShowCamera(true)}
                  title="Use phone camera to detect barcode"
                >
                  <IconCamera />
                  Camera
                </button>
              }
            />

            <div className="px-4 pb-4 pt-3 space-y-3 overflow-auto">
              <div className="relative">
                <input
                  ref={inputRef}
                  value={barcode}
                  // ✅ optional: keep uppercase so API/search is consistent
                  onChange={(e) => setBarcode(String(e.target.value || "").toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      fetchByBarcode();
                    }
                  }}
                  placeholder="Scan here…"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-semibold text-slate-900 outline-none focus:ring-4 focus:ring-slate-200"
                  inputMode="text"
                  autoComplete="off"
                />
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                  {loading ? "Searching…" : "Enter"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Entry Code" value={parsed.entryCode || "-"} />
                <Field label="Carton ID" value={parsed.cartonId || "-"} />
              </div>

              <button
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={loading || !barcode.trim()}
                onClick={() => fetchByBarcode()}
              >
                {loading ? (
                  <>
                    <Spinner />
                    Loading…
                  </>
                ) : (
                  "Find Entry"
                )}
              </button>

              {(error || actionMsg) && (
                <div aria-live="polite" className="space-y-2">
                  {error ? (
                    <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 ring-1 ring-rose-100">
                      {error}
                    </div>
                  ) : null}
                  {actionMsg ? (
                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
                      {actionMsg}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
                Tip: If barcode ends with carton number (e.g. <b>…-003</b>) it auto splits as Entry + Carton.
              </div>
            </div>
          </Card>

          {/* RIGHT: details (scrolls inside) */}
          <div className="h-full overflow-auto space-y-4 pr-1">
            {!data?.entry ? (
              <Card className="p-5">
                <div className="text-sm font-semibold text-slate-900">No entry loaded</div>
                <div className="mt-1 text-sm text-slate-600">
                  Scan a barcode to see entry details, allocation info, and allocated row visualization.
                </div>
              </Card>
            ) : (
              <>
                {/* Entry */}
                <Card>
                  <CardHeader
                    title="Entry"
                    subtitle={
                      <span className="text-slate-600">
                        Code: <span className="font-semibold text-slate-900">{data.entry.code}</span>
                      </span>
                    }
                    right={
                      <div className="flex items-center gap-2">
                        <Badge tone="slate">{data.entry.status || "Unknown"}</Badge>
                        <Badge tone={data.entry.shipped ? "green" : "yellow"}>
                          {data.entry.shipped ? "Shipped ✅" : "Not shipped"}
                        </Badge>
                      </div>
                    }
                  />

                  <div className="px-4 pb-4 pt-3">
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
                      <Field
                        label="Carton Dim (cm)"
                        value={
                          data.entry.cartonDimCm
                            ? `${data.entry.cartonDimCm.w} × ${data.entry.cartonDimCm.l} × ${data.entry.cartonDimCm.h}`
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
                </Card>

                {/* Allocation + Row */}
                <Card>
                  <CardHeader
                    title="Allocation in Row"
                    subtitle={data.allocation ? "Allocation found for this entry." : "No allocation found for this entry."}
                    right={
                      <button
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        disabled={loading || !data.allocation || data.entry.shipped}
                        onClick={deleteAllocation}
                        title={!data.allocation ? "No allocation found" : data.entry.shipped ? "Already shipped" : "Delete allocation"}
                      >
                        Delete Allocation (Mark Shipped)
                      </button>
                    }
                  />

                  <div className="px-4 pb-4 pt-3 space-y-4">
                    {!data.allocation ? (
                      <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 px-3 py-3 text-sm text-slate-700">
                        No allocation exists for this entry right now.
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
                              Array.isArray(data.allocation.segmentsMeta) && data.allocation.segmentsMeta.length
                                ? data.allocation.segmentsMeta
                                    .map((s) => `#${s.segmentIndex}: start ${s.segmentStartCm}, len ${s.segmentLengthCm}, used ${s.allocatedLenCm}`)
                                    .join(" | ")
                                : "-"
                            }
                          />
                          <Field
                            label="Columns By Segment"
                            value={
                              Array.isArray(data.allocation.columnsBySegment) && data.allocation.columnsBySegment.length
                                ? data.allocation.columnsBySegment
                                    .map((c) => `#${c.segmentIndex}: cols ${c.columnsUsed}, qty ${c.qtyPlaced}, len ${c.lengthUsedCm}`)
                                    .join(" | ")
                                : "-"
                            }
                          />
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-bold text-slate-900">Row Info</div>
                            {data.row ? (
                              <div className="flex items-center gap-2">
                                <Badge tone="violet">{data.row.type}</Badge>
                                <Badge tone="slate">{data.row.name}</Badge>
                              </div>
                            ) : (
                              <Badge tone="red">Row missing</Badge>
                            )}
                          </div>

                          <Divider />

                          {!data.row ? (
                            <div className="text-sm text-slate-700">Row not found (rowId missing?)</div>
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

                        {/* only allocated row */}
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
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
