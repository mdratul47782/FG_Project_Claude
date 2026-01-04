// app/api/allocations/_lib.js

export function isDecathlonBuyer(buyer) {
  return buyer === "Decathlon - knit" || buyer === "Decathlon - woven";
}

function floorDiv(a, b) {
  if (!b) return 0;
  return Math.floor(Number(a) / Number(b));
}
function ceilDiv(a, b) {
  if (!b) return 0;
  return Math.ceil(Number(a) / Number(b));
}

function pillarGapAfterSegmentCm(row, segmentIndex) {
  if (row?.type !== "segmented") return 0;
  const p = (row.pillars || []).find((x) => Number(x.atSegmentBoundaryIndex) === Number(segmentIndex));
  const d = Number(p?.diameterCm || 0);
  const r = Number(p?.radiusCm || 0);
  if (d > 0) return d;
  if (r <= 0) return 0;
  return r >= 40 ? r : 2 * r;
}

export function computeMetrics({ buyer, rowWidthCm, rowMaxHeightCm, cartonDimCm, manualOrientation, manualAcross }) {
  const w = Number(cartonDimCm.w);
  const l = Number(cartonDimCm.l);
  const h = Number(cartonDimCm.h);

  if (h > rowMaxHeightCm) return { ok: false, reason: "Carton height > 213cm (row max height)." };

  let orientation, across, columnDepthCm;

  // ✅ Use manual settings if provided
  if (manualOrientation && manualAcross) {
    orientation = manualOrientation;
    across = Number(manualAcross);
    
    // Determine column depth based on orientation
    if (manualOrientation === "LENGTH_WISE") {
      columnDepthCm = l;
      // Validate: can we fit 'across' number of cartons width-wise?
      if (across * w > rowWidthCm) {
        return { ok: false, reason: `Cannot fit ${across} cartons width-wise (${across * w}cm > ${rowWidthCm}cm row width).` };
      }
    } else {
      // WIDTH_WISE
      columnDepthCm = w;
      // Validate: can we fit 'across' number of cartons length-wise?
      if (across * l > rowWidthCm) {
        return { ok: false, reason: `Cannot fit ${across} cartons length-wise (${across * l}cm > ${rowWidthCm}cm row width).` };
      }
    }
  } else {
    // Auto mode (legacy)
    const decathlon = isDecathlonBuyer(buyer);
    orientation = decathlon ? "DECATHLON_LENGTH_ALONG_WIDTH" : "DEFAULT_WIDTH_ALONG_WIDTH";
    across = decathlon ? floorDiv(rowWidthCm, l) : floorDiv(rowWidthCm, w);
    columnDepthCm = decathlon ? w : l;
  }

  const layers = floorDiv(rowMaxHeightCm, h);

  if (across < 1) return { ok: false, reason: "Does not fit across row width (across < 1)." };
  if (layers < 1) return { ok: false, reason: "Does not fit in height (layers < 1)." };
  if (columnDepthCm <= 0) return { ok: false, reason: "Invalid carton dimensions." };

  const allocatedHeightCm = layers * h;
  const remainingHeightCm = rowMaxHeightCm - allocatedHeightCm;

  return {
    ok: true,
    orientation,
    across,
    layers,
    columnDepthCm,
    perColumnCapacity: across * layers,
    allocatedHeightCm,
    remainingHeightCm,
  };
}

export function buildCellsSnapshot({ segmentsPlan, across, layers, qtyTotal }) {
  const cells = [];
  let remaining = Number(qtyTotal);

  for (const seg of segmentsPlan) {
    const { segmentIndex, columnsUsed } = seg;

    for (let col = 0; col < columnsUsed; col++) {
      for (let a = 0; a < across; a++) {
        if (remaining > 0) {
          const filledLayers = Math.min(layers, remaining);
          remaining -= filledLayers;
          cells.push({ segmentIndex, columnIndex: col, acrossIndex: a, filledLayers, state: "occupied" });
        } else {
          cells.push({ segmentIndex, columnIndex: col, acrossIndex: a, filledLayers: 0, state: "reserved" });
        }
      }
    }
  }

  return cells;
}

export function previewForRow({ row, buyer, cartonDimCm, cartonQty, priorAllocations = [], manualOrientation, manualAcross }) {
  const metrics = computeMetrics({
    buyer,
    rowWidthCm: Number(row.widthCm || 120),
    rowMaxHeightCm: Number(row.maxHeightCm || 213),
    cartonDimCm,
    manualOrientation,
    manualAcross,
  });
  if (!metrics.ok) return { ok: false, reason: metrics.reason };

  const segs =
    row.type === "continuous"
      ? [{ segmentIndex: 0, lengthCm: Number(row.lengthCm || 0) }]
      : (row.segments || []).map((s, i) => ({ segmentIndex: i, lengthCm: Number(s.lengthCm || 0) }));

  const segStarts = [];
  let cursor = 0;
  for (let i = 0; i < segs.length; i++) {
    segStarts[i] = cursor;
    cursor += segs[i].lengthCm;
    if (i < segs.length - 1) cursor += pillarGapAfterSegmentCm(row, i);
  }
  const rowTotalLengthCm = cursor;

  const usedBySeg = new Map();
  for (const a of priorAllocations) {
    if (Array.isArray(a.segmentsMeta) && a.segmentsMeta.length > 0) {
      for (const m of a.segmentsMeta) {
        const idx = Number(m.segmentIndex);
        const reserved = Number(m.allocatedLenCm || 0);
        usedBySeg.set(idx, (usedBySeg.get(idx) || 0) + reserved);
      }
    } else {
      for (const s of a.columnsBySegment || []) {
        usedBySeg.set(
          Number(s.segmentIndex),
          (usedBySeg.get(Number(s.segmentIndex)) || 0) + Number(s.lengthUsedCm || 0)
        );
      }
    }
  }

  let remainingCartons = Number(cartonQty);
  const segmentsPlan = [];
  const segmentsMeta = [];

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const segmentStartCm = segStarts[i];

    const usedBeforeCm = usedBySeg.get(seg.segmentIndex) || 0;
    const freeLength = Math.max(0, seg.lengthCm - usedBeforeCm);

    const columnsFit = Math.floor(freeLength / metrics.columnDepthCm);
    const segCapacity = columnsFit * metrics.perColumnCapacity;

    if (columnsFit <= 0 || segCapacity <= 0) continue;

    const qtyPlaced = Math.min(remainingCartons, segCapacity);
    const columnsUsed = ceilDiv(qtyPlaced, metrics.perColumnCapacity);
    const lengthUsedCm = columnsUsed * metrics.columnDepthCm;

    const tail = seg.lengthCm - usedBeforeCm - lengthUsedCm;
    const wastedTailCm = tail > 0 && tail < metrics.columnDepthCm ? tail : 0;

    const allocatedLenCm = lengthUsedCm + wastedTailCm;
    const startFromRowStartCm = segmentStartCm + usedBeforeCm;
    const endFromRowStartCm = startFromRowStartCm + allocatedLenCm;
    const remainingAfterCm = seg.lengthCm - usedBeforeCm - allocatedLenCm;

    segmentsPlan.push({
      segmentIndex: seg.segmentIndex,
      columnsUsed,
      qtyPlaced,
      lengthUsedCm,
    });

    segmentsMeta.push({
      segmentIndex: seg.segmentIndex,
      segmentStartCm,
      segmentLengthCm: seg.lengthCm,
      usedBeforeCm,
      startFromRowStartCm,
      allocatedLenCm,
      endFromRowStartCm,
      remainingAfterCm,
      wastedTailCm,
    });

    remainingCartons -= qtyPlaced;
    if (remainingCartons <= 0) break;
  }

  if (remainingCartons > 0) {
    return { ok: false, reason: "Not enough free length in this row (after existing allocations)." };
  }

  const rowStartAtCm = segmentsMeta[0]?.startFromRowStartCm ?? 0;
  const rowEndAtCm = segmentsMeta[segmentsMeta.length - 1]?.endFromRowStartCm ?? 0;
  const rowRemainingAfterCm = Math.max(0, rowTotalLengthCm - rowEndAtCm);

  const cells = buildCellsSnapshot({
    segmentsPlan,
    across: metrics.across,
    layers: metrics.layers,
    qtyTotal: cartonQty,
  });

  return {
    ok: true,
    rowId: String(row._id),
    rowName: row.name,
    rowType: row.type,
    warehouse: row.warehouse,

    metrics: {
      ...metrics,
      rowTotalLengthCm,
      rowStartAtCm,
      rowEndAtCm,
      rowRemainingAfterCm,
    },

    segmentsMeta,
    columnsBySegment: segmentsPlan.map((s) => ({
      segmentIndex: s.segmentIndex,
      columnsUsed: s.columnsUsed,
      qtyPlaced: s.qtyPlaced,
      lengthUsedCm: s.lengthUsedCm,
    })),

    cells,
  };
}