// utils/warehouse-calculations.js
export function calculateCBM(lengthCm, heightCm, widthCm) {
  const l = Number(lengthCm) || 0;
  const h = Number(heightCm) || 0;
  const w = Number(widthCm) || 0;
  if (l <= 0 || h <= 0 || w <= 0) return 0;
  return (l * h * w) / 1_000_000;
}

export function generateUniqueCode(prefix = "FG") {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `${prefix}-${y}${m}${day}-${hh}${mm}${ss}-${rand}`;
}

/**
 * Best-fit formation (safe “perfect” way):
 * - Try all 6 orientations
 * - Use FLOOR for stacks so cartons never exceed row height/width
 * - Compute lengthCount by CEIL(qty / (heightStack * widthCount))
 * - Fit if totalLengthUsed <= availableLength AND qtyCBM <= availableCBM
 */
export function calculateCartonFormation({
  cartonQty,
  carton, // {length,height,width} in CM
  row, // {length,width,height} in CM
  availableLengthCm,
  availableCBM,
}) {
  const qty = Math.floor(Number(cartonQty) || 0);
  const L = Number(carton.length) || 0;
  const H = Number(carton.height) || 0;
  const W = Number(carton.width) || 0;

  if (qty <= 0 || L <= 0 || H <= 0 || W <= 0) {
    return { isValid: false, reason: "Invalid carton inputs" };
  }

  const orientations = [
    { len: L, wid: W, ht: H, name: "L=Wrow, H=Hrow, Len=Lrow" },
    { len: L, wid: H, ht: W, name: "Rotate: width=height" },
    { len: W, wid: L, ht: H, name: "Rotate: length=width" },
    { len: W, wid: H, ht: L, name: "Rotate: len=width, ht=length" },
    { len: H, wid: L, ht: W, name: "Rotate: len=height" },
    { len: H, wid: W, ht: L, name: "Rotate: len=height, ht=length" },
  ];

  const cartonCBM = calculateCBM(L, H, W);
  const requiredCBM = qty * cartonCBM;

  let best = null;

  for (const o of orientations) {
    const widthCount = Math.floor(row.width / o.wid);
    const heightStack = Math.floor(row.height / o.ht);

    if (widthCount <= 0 || heightStack <= 0) continue;

    const perLengthStep = widthCount * heightStack; // cartons per one “column” along length
    const lengthCount = Math.ceil(qty / perLengthStep);
    const totalLengthUsed = lengthCount * o.len;

    const fitsLength = totalLengthUsed <= availableLengthCm;
    const fitsCBM = requiredCBM <= availableCBM;

    if (!fitsLength || !fitsCBM) continue;

    const candidate = {
      isValid: true,
      orientation: { ...o },
      widthCount,
      heightStack,
      perLengthStep,
      lengthCount,
      totalLengthUsed,
      requiredCBM,
      cartonCBM,
      remainingLength: availableLengthCm - totalLengthUsed,
    };

    // choose minimal length usage (best for “perfect” placement)
    if (!best || candidate.totalLengthUsed < best.totalLengthUsed) best = candidate;
  }

  if (!best) {
    return {
      isValid: false,
      reason: "No orientation fits in this row",
      cartonCBM,
      requiredCBM,
    };
  }

  return best;
}
