// app\api\entries\route.js

import { dbConnect } from "@/services/mongo";
import crypto from "crypto";
import FGEntry from "@/models/FGEntry";

function calcTotals({ pcsPerCarton, cartonQty, fobPerPcs, cartonDimCm }) {
  const totalQty = Number(pcsPerCarton) * Number(cartonQty);
  const perCartonCbm = (Number(cartonDimCm.w) * Number(cartonDimCm.l) * Number(cartonDimCm.h)) / 1_000_000;
  const totalCbm = perCartonCbm * Number(cartonQty);
  const totalFob = totalQty * Number(fobPerPcs);
  return { totalQty, perCartonCbm, totalCbm, totalFob };
}

function makeCode() {
  return `FG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
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

  const cartonDimCm = { w: Number(body.cartonDimCm?.w), l: Number(body.cartonDimCm?.l), h: Number(body.cartonDimCm?.h) };

  const totals = calcTotals({
    pcsPerCarton: body.pcsPerCarton,
    cartonQty: body.cartonQty,
    fobPerPcs: body.fobPerPcs,
    cartonDimCm,
  });

  const entry = await FGEntry.create({
    ...body,
    code: makeCode(),
    cartonDimCm,
    ...totals,
  });

  return Response.json({ ok: true, entry }, { status: 201 });
}
