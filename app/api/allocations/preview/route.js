// app/api/allocations/preview/route.js
import { dbConnect } from "@/services/mongo";
import Row from "@/models/Row";
import Allocation from "@/models/Allocation";
import { previewForRow } from "../_lib";

export async function POST(req) {
  await dbConnect();
  const body = await req.json();

  const { rowId, buyer, cartonQty, cartonDimCm, manualOrientation, manualAcross } = body;
  if (!rowId || !buyer || !cartonQty || !cartonDimCm) {
    return Response.json({ ok: false, message: "rowId, buyer, cartonQty, cartonDimCm are required" }, { status: 400 });
  }

  const row = await Row.findById(rowId).lean();
  if (!row) return Response.json({ ok: false, message: "Row not found" }, { status: 404 });

  const prior = await Allocation.find({ rowId: row._id }).sort({ createdAt: 1 }).lean();

  const preview = previewForRow({
    row,
    buyer,
    cartonQty: Number(cartonQty),
    cartonDimCm: {
      w: Number(cartonDimCm.w),
      l: Number(cartonDimCm.l),
      h: Number(cartonDimCm.h),
    },
    priorAllocations: prior,
    manualOrientation,
    manualAcross,
  });

  if (!preview.ok) return Response.json({ ok: false, message: preview.reason }, { status: 200 });
  return Response.json({ ok: true, preview });
}