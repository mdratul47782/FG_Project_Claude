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
  const p = (row.pillars || []).find(
    (x) => Number(x.atSegmentBoundaryIndex) === Number(segmentIndex)
  );
  const d = Number(p?.diameterCm || 0);
  const r = Number(p?.radiusCm || 0);
  if (d > 0) return d;
  if (r <= 0) return 0;
  return r >= 40 ? r : 2 * r;
}

/** Merge [start,end) intervals */
function mergeIntervals(intervals = []) {
  const arr = intervals
    .map((x) => [Number(x[0]), Number(x[1])])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [s, e] of arr) {
    if (!merged.length || s > merged[merged.length - 1][1]) merged.push([s, e]);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
  }
  return merged;
}

/** Free ranges inside [0, segmentLen) given merged occupied ranges */
function freeRanges(segmentLen, occupiedMerged = []) {
  const free = [];
  let cursor = 0;

  for (const [s0, e0] of occupiedMerged) {
    const s = Math.max(0, s0);
    const e = Math.min(segmentLen, e0);
    if (e <= 0 || s >= segmentLen) continue;

    if (s > cursor) free.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }

  if (cursor < segmentLen) free.push([cursor, segmentLen]);
  return free.filter(([a, b]) => b - a > 0);
}

/**
 * Build occupied ranges PER SEGMENT, using real start positions.
 * Fixes the deletion-hole problem (sum-of-length is wrong when gaps exist).
 */
function buildOccupiedBySegment({ priorAllocations = [], segStarts = [] }) {
  const occ = new Map(); // segIndex -> [[startLocal,endLocal], ...]

  const add = (segIndex, startLocal, endLocal) => {
    const s = Number(startLocal);
    const e = Number(endLocal);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return;
    const arr = occ.get(segIndex) || [];
    arr.push([s, e]);
    occ.set(segIndex, arr);
  };

  for (const a of priorAllocations) {
    // Best source: segmentsMeta (has true start positions)
    if (Array.isArray(a.segmentsMeta) && a.segmentsMeta.length > 0) {
      for (const m of a.segmentsMeta) {
        const segIndex = Number(m.segmentIndex);

        const segStartGlobal = Number.isFinite(segStarts[segIndex])
          ? Number(segStarts[segIndex])
          : Number(m.segmentStartCm || 0);

        const startGlobal = Number.isFinite(Number(m.startFromRowStartCm))
          ? Number(m.startFromRowStartCm)
          : segStartGlobal + Number(m.usedBeforeCm || 0);

        const allocated = Number(m.allocatedLenCm || 0);
        const endGlobal = startGlobal + allocated;

        const startLocal = startGlobal - segStartGlobal;
        const endLocal = endGlobal - segStartGlobal;

        add(segIndex, startLocal, endLocal);
      }
      continue;
    }

    // Fallback: if old allocations don't have segmentsMeta, assume packed at segment start
    if (Array.isArray(a.columnsBySegment) && a.columnsBySegment.length > 0) {
      for (const s of a.columnsBySegment) {
        const segIndex = Number(s.segmentIndex);
        const len = Number(s.lengthUsedCm || 0);
        if (len > 0) add(segIndex, 0, len);
      }
      continue;
    }

    // Last fallback: use rowStart/rowEnd in segment 0
    const startGlobal = Number(a.rowStartAtCm || 0);
    const endGlobal = Number(a.rowEndAtCm || 0);
    const segStartGlobal = Number(segStarts[0] || 0);
    add(0, startGlobal - segStartGlobal, endGlobal - segStartGlobal);
  }

  // Merge each segment intervals
  const merged = new Map();
  for (const [segIndex, arr] of occ.entries()) {
    merged.set(segIndex, mergeIntervals(arr));
  }
  return merged;
}

export function computeMetrics({
  buyer,
  rowWidthCm,
  rowMaxHeightCm,
  cartonDimCm,
  manualOrientation,
  manualAcross,
}) {
  const w = Number(cartonDimCm.w);
  const l = Number(cartonDimCm.l);
  const h = Number(cartonDimCm.h);

  if (h > rowMaxHeightCm) {
    return { ok: false, reason: `Carton height (${h}cm) > row max height (${rowMaxHeightCm}cm).` };
  }

  let orientation, across, columnDepthCm;

  // ✅ Use manual settings if provided
  if (manualOrientation && manualAcross) {
    orientation = String(manualOrientation);
    across = Number(manualAcross);

    if (orientation === "LENGTH_WISE") {
      // length goes into depth, width stays across
      columnDepthCm = l;
      if (across * w > rowWidthCm) {
        return {
          ok: false,
          reason: `Cannot fit ${across} cartons width-wise (${across * w}cm > ${rowWidthCm}cm row width).`,
        };
      }
    } else {
      // WIDTH_WISE: width goes into depth, length stays across
      columnDepthCm = w;
      if (across * l > rowWidthCm) {
        return {
          ok: false,
          reason: `Cannot fit ${across} cartons length-wise (${across * l}cm > ${rowWidthCm}cm row width).`,
        };
      }
    }
  } else {
    // ✅ Auto mode
    const decathlon = isDecathlonBuyer(buyer);

    // Decathlon: across uses carton LENGTH, so depth uses WIDTH  => WIDTH_WISE
    // Default: across uses carton WIDTH, so depth uses LENGTH   => LENGTH_WISE
    orientation = decathlon ? "WIDTH_WISE" : "LENGTH_WISE";

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
          cells.push({
            segmentIndex,
            columnIndex: col,
            acrossIndex: a,
            filledLayers,
            state: "occupied",
          });
        } else {
          cells.push({
            segmentIndex,
            columnIndex: col,
            acrossIndex: a,
            filledLayers: 0,
            state: "reserved",
          });
        }
      }
    }
  }

  return cells;
}

/** ✅ NEW: compute how many cartons can fit in the remaining free gaps */
function computeMaxAllocatableCartons({
  row,
  buyer,
  cartonDimCm,
  priorAllocations = [],
  manualOrientation,
  manualAcross,
}) {
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
      : (row.segments || []).map((s, i) => ({
          segmentIndex: i,
          lengthCm: Number(s.lengthCm || 0),
        }));

  // segment start positions (including pillar gaps)
  const segStarts = [];
  let cursor = 0;
  for (let i = 0; i < segs.length; i++) {
    segStarts[i] = cursor;
    cursor += segs[i].lengthCm;
    if (i < segs.length - 1) cursor += pillarGapAfterSegmentCm(row, i);
  }

  const occupiedBySeg = buildOccupiedBySegment({ priorAllocations, segStarts });

  let maxCartons = 0;
  let freeLengthTotalCm = 0;
  let freeColumnsTotal = 0;

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const occupiedMerged = occupiedBySeg.get(seg.segmentIndex) || [];
    const gaps = freeRanges(seg.lengthCm, occupiedMerged);

    for (const [gapStart, gapEnd] of gaps) {
      const freeLength = Math.max(0, gapEnd - gapStart);
      if (freeLength <= 0) continue;

      const columnsFit = Math.floor(freeLength / metrics.columnDepthCm);
      if (columnsFit <= 0) continue;

      freeLengthTotalCm += freeLength;
      freeColumnsTotal += columnsFit;
      maxCartons += columnsFit * metrics.perColumnCapacity;
    }
  }

  return {
    ok: true,
    metrics,
    maxCartons,
    freeLengthTotalCm,
    freeColumnsTotal,
  };
}

/**
 * ✅ UPDATED preview:
 * - Always returns preview for what can be placed (min(requested, maxCapacity))
 * - Also returns maxCartons capacity so UI can show "how many can fit in remaining space"
 */
export function previewForRow({
  row,
  buyer,
  cartonDimCm,
  cartonQty,
  priorAllocations = [],
  manualOrientation,
  manualAcross,
}) {
  const cap = computeMaxAllocatableCartons({
    row,
    buyer,
    cartonDimCm,
    priorAllocations,
    manualOrientation,
    manualAcross,
  });

  if (!cap.ok) return { ok: false, reason: cap.reason };

  const metrics = cap.metrics;
  const requestedCartons = Number(cartonQty);

  const maxCartons = Number(cap.maxCartons || 0);
  const placedTarget = Math.max(0, Math.min(requestedCartons, maxCartons));
  const unplacedCartons = Math.max(0, requestedCartons - placedTarget);
  const extraCapacity = Math.max(0, maxCartons - requestedCartons);

  // still show capacity even if nothing can be placed
  if (maxCartons <= 0) {
    return {
      ok: true,
      rowId: String(row._id),
      rowName: row.name,
      rowType: row.type,
      warehouse: row.warehouse,
      capacity: {
        maxCartons: 0,
        requestedCartons,
        placedCartons: 0,
        unplacedCartons: requestedCartons,
        extraCapacity: 0,
      },
      metrics: {
        ...metrics,
        rowTotalLengthCm: 0,
        rowStartAtCm: 0,
        rowEndAtCm: 0,
        rowRemainingAfterCm: 0,
      },
      segmentsMeta: [],
      columnsBySegment: [],
      cells: [],
      partial: requestedCartons > 0,
      note: "No free columns available in remaining gaps for this carton depth.",
    };
  }

  const segs =
    row.type === "continuous"
      ? [{ segmentIndex: 0, lengthCm: Number(row.lengthCm || 0) }]
      : (row.segments || []).map((s, i) => ({ segmentIndex: i, lengthCm: Number(s.lengthCm || 0) }));

  // segment start positions (including pillar gaps)
  const segStarts = [];
  let cursor = 0;
  for (let i = 0; i < segs.length; i++) {
    segStarts[i] = cursor;
    cursor += segs[i].lengthCm;
    if (i < segs.length - 1) cursor += pillarGapAfterSegmentCm(row, i);
  }
  const rowTotalLengthCm = cursor;

  const occupiedBySeg = buildOccupiedBySegment({
    priorAllocations,
    segStarts,
  });

  let remainingCartons = placedTarget; // ✅ place only what fits
  const segmentsPlan = [];
  const segmentsMeta = [];

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const segmentIndex = seg.segmentIndex;
    const segmentStartCm = segStarts[i];

    const occupiedMerged = occupiedBySeg.get(segmentIndex) || [];
    const gaps = freeRanges(seg.lengthCm, occupiedMerged);

    for (const [gapStart, gapEnd] of gaps) {
      if (remainingCartons <= 0) break;

      const freeLength = Math.max(0, gapEnd - gapStart);
      const columnsFit = Math.floor(freeLength / metrics.columnDepthCm);
      const segCapacity = columnsFit * metrics.perColumnCapacity;

      if (columnsFit <= 0 || segCapacity <= 0) continue;

      const qtyPlaced = Math.min(remainingCartons, segCapacity);
      const columnsUsed = ceilDiv(qtyPlaced, metrics.perColumnCapacity);
      const lengthUsedCm = columnsUsed * metrics.columnDepthCm;

      const tail = freeLength - lengthUsedCm;
      const wastedTailCm = tail > 0 && tail < metrics.columnDepthCm ? tail : 0;

      const allocatedLenCm = lengthUsedCm + wastedTailCm; // always <= freeLength
      const startFromRowStartCm = segmentStartCm + gapStart;
      const endFromRowStartCm = startFromRowStartCm + allocatedLenCm;

      const remainingAfterCm = seg.lengthCm - (gapStart + allocatedLenCm);

      segmentsPlan.push({
        segmentIndex,
        columnsUsed,
        qtyPlaced,
        lengthUsedCm,
        startInSegmentCm: gapStart,
      });

      segmentsMeta.push({
        segmentIndex,
        segmentStartCm,
        segmentLengthCm: seg.lengthCm,
        usedBeforeCm: gapStart,
        startFromRowStartCm,
        allocatedLenCm,
        endFromRowStartCm,
        remainingAfterCm,
        wastedTailCm,
      });

      remainingCartons -= qtyPlaced;
      if (remainingCartons <= 0) break;
    }

    if (remainingCartons <= 0) break;
  }

  const placedCartons = placedTarget - Math.max(0, remainingCartons);

  const rowStartAtCm = segmentsMeta[0]?.startFromRowStartCm ?? 0;
  const rowEndAtCm = segmentsMeta[segmentsMeta.length - 1]?.endFromRowStartCm ?? 0;
  const rowRemainingAfterCm = Math.max(0, rowTotalLengthCm - rowEndAtCm);

  const cells = buildCellsSnapshot({
    segmentsPlan,
    across: metrics.across,
    layers: metrics.layers,
    qtyTotal: placedCartons, // ✅ snapshot only what is actually placed
  });

  return {
    ok: true,
    rowId: String(row._id),
    rowName: row.name,
    rowType: row.type,
    warehouse: row.warehouse,

    capacity: {
      maxCartons,
      requestedCartons,
      placedCartons,
      unplacedCartons,
      extraCapacity,
      freeLengthTotalCm: cap.freeLengthTotalCm,
      freeColumnsTotal: cap.freeColumnsTotal,
    },

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
      startInSegmentCm: s.startInSegmentCm,
    })),

    cells,

    partial: unplacedCartons > 0,
  };
}
