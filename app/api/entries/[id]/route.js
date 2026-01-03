// app\api\entries\[id]\route.js
import { dbConnect } from "@/services/mongo";
import FGEntry from "@/models/FGEntry";
import Allocation from "@/models/Allocation";

function calcTotals({ pcsPerCarton, cartonQty, fobPerPcs, cartonDimCm }) {
  const totalQty = Number(pcsPerCarton) * Number(cartonQty);
  const perCartonCbm = (Number(cartonDimCm.w) * Number(cartonDimCm.l) * Number(cartonDimCm.h)) / 1_000_000;
  const totalCbm = perCartonCbm * Number(cartonQty);
  const totalFob = totalQty * Number(fobPerPcs);
  return { totalQty, perCartonCbm, totalCbm, totalFob };
}

export async function GET(_req, { params }) {
  await dbConnect();
  const entry = await FGEntry.findById(params.id).lean();
  if (!entry) return Response.json({ ok: false, message: "Entry not found" }, { status: 404 });
  return Response.json({ ok: true, entry });
}

export async function PATCH(req, { params }) {
  await dbConnect();
  const body = await req.json();

  const existing = await FGEntry.findById(params.id).lean();
  if (!existing) return Response.json({ ok: false, message: "Entry not found" }, { status: 404 });

  const update = { ...body };

  const nextDim = body.cartonDimCm
    ? { w: Number(body.cartonDimCm.w), l: Number(body.cartonDimCm.l), h: Number(body.cartonDimCm.h) }
    : existing.cartonDimCm;

  const totals = calcTotals({
    pcsPerCarton: body.pcsPerCarton ?? existing.pcsPerCarton,
    cartonQty: body.cartonQty ?? existing.cartonQty,
    fobPerPcs: body.fobPerPcs ?? existing.fobPerPcs,
    cartonDimCm: nextDim,
  });

  update.cartonDimCm = nextDim;
  Object.assign(update, totals);

  const entry = await FGEntry.findByIdAndUpdate(params.id, update, { new: true }).lean();
  return Response.json({ ok: true, entry });
}

export async function DELETE(_req, { params }) {
  await dbConnect();

  const entry = await FGEntry.findById(params.id).lean();
  if (!entry) return Response.json({ ok: false, message: "Entry not found" }, { status: 404 });

  if (entry.allocationId) await Allocation.findByIdAndDelete(entry.allocationId);
  await FGEntry.findByIdAndDelete(params.id);

  return Response.json({ ok: true });
}
