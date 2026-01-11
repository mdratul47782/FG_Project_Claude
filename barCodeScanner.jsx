"use client"

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

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
    <div className="flex gap-2">
      <span className="font-semibold min-w-[140px]">{label}:</span>
      <span className="text-gray-700">{value ?? "-"}</span>
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
  const xFromStartLen = (startCm, lenCm) => W - sx(n(startCm) + n(lenCm));

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
      segmentRects.push({ segX: xPx, segW: wPx, segLen: n(p.lengthCm), startCm, endCm, segmentIndex: p.segmentIndex });
    } else {
      pillarRects.push({ x: xPx, w: wPx, gapCm: n(p.lengthCm), startCm, endCm, boundaryIndex: p.boundaryIndex });
    }
    xCursor -= wPx;
    cmCursor += n(p.lengthCm);
  }

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
    <div className="border rounded p-4 bg-white">
      <h3 className="font-bold text-lg mb-2">Allocated Row (only)</h3>
      <div className="text-sm text-gray-600 mb-3">
        Row: {row?.name} • Type: {row?.type} • Total: {totalCartons} cartons • {totalCbm.toFixed(3)} cbm
      </div>
      <svg width={W} height={H} className="border bg-gray-50 mb-4">
        {segmentRects.map((r, i) => (
          <g key={i}>
            <rect x={r.segX} y={y} width={r.segW} height={h} fill="#e0e0e0" stroke="#999" strokeWidth={1} />
            <text x={r.segX + r.segW / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#333">
              {r.segLen} cm
            </text>
          </g>
        ))}
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
              fill={colorFromKey(b.entryId)}
              stroke={isHit ? "#000" : "#fff"}
              strokeWidth={isHit ? 3 : 1}
              opacity={0.85}
            >
              <title>{tip}</title>
            </rect>
          );
        })}
        {pillarRects.map((p) => (
          <g key={p.boundaryIndex}>
            <rect x={p.x} y={y} width={p.w} height={h} fill="#444" stroke="#000" strokeWidth={1} />
            <text x={p.x + p.w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#fff">
              {p.gapCm}cm
            </text>
          </g>
        ))}
      </svg>
      <div className="text-xs text-gray-500 mb-3">Hover blocks for details • Bold outline = scanned entry</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left">Code</th>
              <th className="border px-2 py-1 text-left">Buyer</th>
              <th className="border px-2 py-1 text-left">Season</th>
              <th className="border px-2 py-1 text-left">PO</th>
              <th className="border px-2 py-1 text-left">Style</th>
              <th className="border px-2 py-1 text-left">Model</th>
              <th className="border px-2 py-1 text-left">Item</th>
              <th className="border px-2 py-1 text-left">Color</th>
              <th className="border px-2 py-1 text-right">Cartons</th>
              <th className="border px-2 py-1 text-left">Start→End (cm)</th>
              <th className="border px-2 py-1 text-right">CBM</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => {
              const isHit = idStr(r.entryId) === hitId;
              return (
                <tr key={r.key} className={isHit ? "bg-yellow-100" : ""}>
                  <td className="border px-2 py-1">{r.code}</td>
                  <td className="border px-2 py-1">{r.buyer}</td>
                  <td className="border px-2 py-1">{r.season}</td>
                  <td className="border px-2 py-1">{r.po}</td>
                  <td className="border px-2 py-1">{r.style}</td>
                  <td className="border px-2 py-1">{r.model}</td>
                  <td className="border px-2 py-1">{r.item}</td>
                  <td className="border px-2 py-1">{r.color}</td>
                  <td className="border px-2 py-1 text-right">{r.cartons}</td>
                  <td className="border px-2 py-1">
                    {r.start}→{r.end}
                  </td>
                  <td className="border px-2 py-1 text-right">{r.cbm.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CameraScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const scanIntervalRef = useRef(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsScanning(true);
      startScanning();
    } catch (err) {
      setError("Cannot access camera: " + err.message);
    }
  }

  function stopCamera() {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  }

  function startScanning() {
    scanIntervalRef.current = setInterval(() => {
      scanFrame();
    }, 300);
  }

  async function scanFrame() {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      if ('BarcodeDetector' in window) {
        try {
          const barcodeDetector = new window.BarcodeDetector({
            formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code']
          });
          const barcodes = await barcodeDetector.detect(imageData);
          
          if (barcodes.length > 0) {
            const barcode = barcodes[0].rawValue;
            stopCamera();
            onScan(barcode);
          }
        } catch (err) {
          console.error("Barcode detection error:", err);
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
      <div className="relative w-full h-full max-w-2xl max-h-screen p-4">
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="absolute top-6 right-6 z-10 bg-white rounded-full p-2 hover:bg-gray-200"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="bg-white rounded-lg p-4 h-full flex flex-col">
          <h2 className="text-xl font-bold mb-4">Scan Barcode with Camera</h2>
          
          {error ? (
            <div className="bg-red-100 text-red-700 p-4 rounded mb-4">{error}</div>
          ) : null}

          <div className="flex-1 relative bg-black rounded overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-4 border-green-500 w-64 h-32 rounded-lg"></div>
            </div>
          </div>

          <div className="mt-4 text-center text-sm text-gray-600">
            {isScanning ? "Position barcode within the frame" : "Starting camera..."}
          </div>

          <div className="mt-4 bg-yellow-50 p-3 rounded text-sm">
            <p className="font-semibold mb-1">Note:</p>
            <p>Camera scanning requires the Barcode Detection API. If scanning does not work automatically, please use a USB barcode scanner instead.</p>
          </div>
        </div>
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
  const [showCamera, setShowCamera] = useState(false);
  const scanBufferRef = useRef("");
  const scanTimeoutRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyPress(e) {
      if (document.activeElement === inputRef.current) return;
      
      if (e.key === "Enter") {
        if (scanBufferRef.current.length > 0) {
          const scannedCode = scanBufferRef.current;
          scanBufferRef.current = "";
          setBarcode(scannedCode);
          fetchByBarcode(scannedCode);
        }
      } else if (e.key.length === 1) {
        scanBufferRef.current += e.key;
        
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
        }
        scanTimeoutRef.current = setTimeout(() => {
          scanBufferRef.current = "";
        }, 100);
      }
    }

    window.addEventListener("keypress", handleKeyPress);
    return () => {
      window.removeEventListener("keypress", handleKeyPress);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
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

  function handleCameraScan(scannedCode) {
    setShowCamera(false);
    setBarcode(scannedCode);
    fetchByBarcode(scannedCode);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {showCamera && <CameraScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />}
      
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">Scan Shipment</h1>
          <p className="text-gray-600 mb-4">
            Scan barcode like FG-35598929-003 using USB scanner, camera, or manual entry.
            It will extract entry code + carton id, then show entry + allocation + row.
          </p>

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => {
                setBarcode("");
                setData(null);
                setError("");
                setActionMsg("");
                inputRef.current?.focus();
              }}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            >
              Clear
            </button>
            
            <button
              onClick={() => setShowCamera(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2"
            >
              <Camera className="w-5 h-5" />
              Scan with Camera
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block font-semibold mb-1">Barcode (USB Scanner / Manual)</label>
              <input
                ref={inputRef}
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    fetchByBarcode();
                  }
                }}
                placeholder="Scan here or type manually..."
                className="w-full px-3 py-3 rounded border text-lg outline-none"
                inputMode="text"
                autoComplete="off"
              />
            </div>

            <button
              onClick={() => fetchByBarcode()}
              disabled={loading}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded font-semibold disabled:bg-gray-400"
            >
              {loading ? "Loading..." : "Find Entry"}
            </button>

            {error ? <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div> : null}
            {actionMsg ? <div className="bg-green-100 text-green-700 p-3 rounded">{actionMsg}</div> : null}
          </div>
        </div>

        {data?.entry ? (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Entry</h2>
              <div className="space-y-2">
                <Field label="Code" value={data.entry.code} />
                <Field label="Status" value={data.entry.status} />
                <Field label="Shipped" value={data.entry.shipped ? "Yes ✅" : "No"} />
                <Field label="Buyer" value={data.entry.buyer} />
                <Field label="Season" value={data.entry.season} />
                <Field label="PO Number" value={data.entry.poNumber} />
                <Field label="Style" value={data.entry.style} />
                <Field label="Model" value={data.entry.model} />
                <Field label="Item" value={data.entry.item} />
                <Field label="Color" value={data.entry.color} />
                <Field label="Carton Dim" value={data.entry.cartonDimCm ? `${n(data.entry.cartonDimCm.w)}×${n(data.entry.cartonDimCm.l)}×${n(data.entry.cartonDimCm.h)} cm` : "-"} />
                <Field label="Size Breakdown" value={data.entry.sizeBreakdown?.map((s) => `${s.size}:${s.qty}`).join(", ")} />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Allocation in Row</h2>
                <button onClick={deleteAllocation} disabled={loading} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded disabled:bg-gray-400">
                  Delete Allocation (Mark Shipped)
                </button>
              </div>

              {!data.allocation ? (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                  <p className="text-yellow-700">No allocation found for this entry.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 mb-6">
                    <Field label="Qty Total" value={data.allocation.qtyTotal} />
                    <Field label="Row Start (cm)" value={data.allocation.rowStartAtCm} />
                    <Field label="Row End (cm)" value={data.allocation.rowEndAtCm} />
                    <Field label="Carton Dim" value={data.allocation.cartonDimCm ? `${n(data.allocation.cartonDimCm.w)}×${n(data.allocation.cartonDimCm.l)}×${n(data.allocation.cartonDimCm.h)} cm` : "-"} />
                    <Field label="Segments Meta" value={data.allocation.segmentsMeta?.map((s) => `#${s.segmentIndex}: start ${s.segmentStartCm}, len ${s.segmentLengthCm}, used ${s.allocatedLenCm}`).join(" | ")} />
                    <Field label="Columns Meta" value={data.allocation.columnsMeta?.map((c) => `#${c.segmentIndex}: cols ${c.columnsUsed}, qty ${c.qtyPlaced}, len ${c.lengthUsedCm}`).join(" | ")} />
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="text-lg font-bold mb-4">Row Info</h3>
                    {!data.row ? (
                      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                        <p className="text-yellow-700">Row not found (rowId missing?)</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Field label="Row Name" value={data.row.name} />
                        <Field label="Type" value={data.row.type} />
                        <Field label="Length (cm)" value={data.row.lengthCm} />
                        <Field label="Level" value={data.row.level} />
                        <Field label="Shipment Mode" value={data.row.shipmentMode} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {data?.row && Array.isArray(data?.rowAllocations) && Array.isArray(data?.rowEntries) ? (
              <RowOnlyBar
                row={data.row}
                allocations={data.rowAllocations}
                entries={data.rowEntries}
                highlightEntryId={data?.entry?._id}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}