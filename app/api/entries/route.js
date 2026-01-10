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
  const perCartonCbm = (Number(cartonDimCm.w) * Number(cartonDimCm.l) * Number(cartonDimCm.h)) / 1_000_000;
  const totalCbm = perCartonCbm * Number(cartonQty);
  const totalFob = totalQty * Number(fobPerPcs);

  return { pcsPerCartonFinal, totalQty, perCartonCbm, totalCbm, totalFob };
}

// ✅ GET (list or single)
export async function GET(req) {
  await dbConnect();
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id");
  const warehouse = searchParams.get("warehouse");

  if (id) {
    const entry = await FGEntry.findById(id).lean();
    if (!entry) return Response.json({ ok: false, message: "Not found" }, { status: 404 });
    return Response.json({ ok: true, entry });
  }

  const q = {};
  if (warehouse) q.warehouse = warehouse;

  const entries = await FGEntry.find(q).sort({ createdAt: -1 }).lean();
  return Response.json({ ok: true, entries });
}

// ✅ POST (create) -> shipped defaults to false
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

    pcsPerCarton: totals.pcsPerCartonFinal,
    totalQty: totals.totalQty,
    perCartonCbm: totals.perCartonCbm,
    totalCbm: totals.totalCbm,
    totalFob: totals.totalFob,

    // ✅ defaults
    shipped: false,
    shippedAt: null,
    shippedBy: {},

    printed: false,
    printedAt: null,
   
  });

  return Response.json({ ok: true, entry }, { status: 201 });
}

export async function PATCH(req) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ ok: false, message: "Missing id" }, { status: 400 });

  const body = await req.json();
  const update = {};

  // ✅ shipped toggle
  if (typeof body.shipped === "boolean") {
    update.shipped = body.shipped;
    update.shippedAt = body.shipped ? new Date() : null;
    update.shippedBy = body.shipped ? (body.shippedBy || {}) : {};
  }

  // ✅ printed toggle
  if (typeof body.printed === "boolean") {
    update.printed = body.printed;
    update.printedAt = body.printed ? new Date() : null;
    
  }

  const entry = await FGEntry.findByIdAndUpdate(id, update, { new: true }).lean();
  if (!entry) return Response.json({ ok: false, message: "Not found" }, { status: 404 });

  return Response.json({ ok: true, entry });
}

// ✅ DELETE
export async function DELETE(req) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ ok: false, message: "Missing id" }, { status: 400 });

  const deleted = await FGEntry.findByIdAndDelete(id).lean();
  if (!deleted) return Response.json({ ok: false, message: "Not found" }, { status: 404 });

  return Response.json({ ok: true });
}
