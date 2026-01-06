// app/api/entries/[id]/route.js
import { dbConnect } from "@/services/mongo";
import FGEntry from "@/models/FGEntry";

function sanitizeSizes(sizes) {
  if (!Array.isArray(sizes)) return null; // null => not provided in patch
  return sizes
    .map((r) => ({ size: String(r?.size || "").trim(), qty: Number(r?.qty || 0) }))
    .filter((r) => r.size && r.qty > 0);
}

function pcsPerCartonFromSizes(sizes) {
  if (!Array.isArray(sizes)) return 0;
  return sizes.reduce((sum, r) => sum + Number(r?.qty || 0), 0);
}

function calcTotals({ pcsPerCarton, cartonQty, fobPerPcs, cartonDimCm, sizes }) {
  const pcsFromSizes = pcsPerCartonFromSizes(sizes);
  const pcsPerCartonFinal = pcsFromSizes > 0 ? pcsFromSizes : Number(pcsPerCarton);

  const totalQty = pcsPerCartonFinal * Number(cartonQty);

  const perCartonCbm =
    (Number(cartonDimCm.w) * Number(cartonDimCm.l) * Number(cartonDimCm.h)) / 1_000_000;

  const totalCbm = perCartonCbm * Number(cartonQty);
  const totalFob = totalQty * Number(fobPerPcs);

  return { pcsPerCartonFinal, totalQty, perCartonCbm, totalCbm, totalFob };
}

export async function GET(_req, { params }) {
  await dbConnect();
  const entry = await FGEntry.findById(params.id).lean();
  if (!entry) return Response.json({ ok: false, message: "Not found" }, { status: 404 });
  return Response.json({ ok: true, entry });
}

export async function PATCH(req, { params }) {
  await dbConnect();
  const body = await req.json();

  const update = { ...body };

  if (body.cartonDimCm) {
    update.cartonDimCm = {
      w: Number(body.cartonDimCm?.w),
      l: Number(body.cartonDimCm?.l),
      h: Number(body.cartonDimCm?.h),
    };
  }

  const maybeSizes = sanitizeSizes(body.sizes);
  if (maybeSizes !== null) {
    update.sizes = maybeSizes;
  }

  const shouldRecalc =
    body.pcsPerCarton != null ||
    body.cartonQty != null ||
    body.fobPerPcs != null ||
    body.cartonDimCm != null ||
    maybeSizes !== null;

  if (shouldRecalc) {
    const existing = await FGEntry.findById(params.id).lean();
    if (!existing) return Response.json({ ok: false, message: "Not found" }, { status: 404 });

    const merged = {
      pcsPerCarton: body.pcsPerCarton ?? existing.pcsPerCarton,
      cartonQty: body.cartonQty ?? existing.cartonQty,
      fobPerPcs: body.fobPerPcs ?? existing.fobPerPcs,
      cartonDimCm: update.cartonDimCm ?? existing.cartonDimCm,
      sizes: update.sizes ?? existing.sizes,
    };

    const totals = calcTotals(merged);

    // ✅ important: store recalculated final pcs/carton
    update.pcsPerCarton = totals.pcsPerCartonFinal;
    update.totalQty = totals.totalQty;
    update.perCartonCbm = totals.perCartonCbm;
    update.totalCbm = totals.totalCbm;
    update.totalFob = totals.totalFob;
  }

  const entry = await FGEntry.findByIdAndUpdate(params.id, update, { new: true }).lean();
  return Response.json({ ok: true, entry });
}

export async function DELETE(_req, { params }) {
  await dbConnect();
  const deleted = await FGEntry.findByIdAndDelete(params.id).lean();
  if (!deleted) return Response.json({ ok: false, message: "Not found" }, { status: 404 });
  return Response.json({ ok: true, deletedId: params.id });
}
