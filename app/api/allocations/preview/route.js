// app/api/allocations/preview/route.js
import { dbConnect } from "@/services/mongo";
import Allocation from "@/models/Allocation";
import Row from "@/models/Row";
import { previewForRow } from "../_lib";

export async function POST(req) {
  await dbConnect();
  const body = await req.json();

  const { rowId, buyer, cartonDimCm, cartonQty, manualOrientation, manualAcross } = body;

  if (!rowId) return Response.json({ ok: false, message: "rowId is required" }, { status: 400 });
  if (!buyer) return Response.json({ ok: false, message: "buyer is required" }, { status: 400 });
  if (!cartonDimCm?.w || !cartonDimCm?.l || !cartonDimCm?.h) {
    return Response.json({ ok: false, message: "cartonDimCm (w,l,h) required" }, { status: 400 });
  }

  const row = await Row.findById(rowId).lean();
  if (!row) return Response.json({ ok: false, message: "Row not found" }, { status: 404 });

  const prior = await Allocation.find({ rowId: row._id }).sort({ createdAt: 1 }).lean();

  const preview = previewForRow({
    row,
    buyer,
    cartonDimCm,
    cartonQty: Number(cartonQty || 0),
    priorAllocations: prior,
    manualOrientation,
    manualAcross,
  });

  if (!preview.ok) {
    return Response.json({ ok: false, message: preview.reason || "Preview failed" }, { status: 400 });
  }

  // ✅ Always ok=true so UI can show maxCartons even if partial
  return Response.json({ ok: true, preview });
}
