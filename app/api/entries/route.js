// app/api/entries/route.js
import { dbConnect } from "@/services/mongo";
import crypto from "crypto";
import FGEntry from "@/models/FGEntry";

function makeCode() {
  return `FG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function sanitizeSizes(sizes) {
  if (!Array.isArray(sizes)) return [];
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

export async function GET(req) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const warehouse = searchParams.get("warehouse");

  const q = {};
  if (warehouse) q.warehouse = warehouse;

  const entries = await FGEntry.find(q).sort({ createdAt: -1 }).lean();
  return Response.json({ ok: true, entries });
}

export async function POST(req) {
  await dbConnect();
  const body = await req.json();

  const cartonDimCm = {
    w: Number(body.cartonDimCm?.w),
    l: Number(body.cartonDimCm?.l),
    h: Number(body.cartonDimCm?.h),
  };

  const sizes = sanitizeSizes(body.sizes);

  const totals = calcTotals({
    pcsPerCarton: body.pcsPerCarton,
    cartonQty: body.cartonQty,
    fobPerPcs: body.fobPerPcs,
    cartonDimCm,
    sizes,
  });

  const entry = await FGEntry.create({
    ...body,
    code: makeCode(),
    cartonDimCm,
    sizes,

    // ✅ store final pcs/carton
    pcsPerCarton: totals.pcsPerCartonFinal,

    totalQty: totals.totalQty,
    perCartonCbm: totals.perCartonCbm,
    totalCbm: totals.totalCbm,
    totalFob: totals.totalFob,
  });

  return Response.json({ ok: true, entry }, { status: 201 });
}
