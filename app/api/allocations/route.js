// app\api\allocations\route.js
import { dbConnect } from "@/services/mongo";
import Allocation from "@/models/Allocation";
import FGEntry from "@/models/FGEntry";
import Row from "@/models/Row";
import { previewForRow } from "./_lib";

export async function GET(req) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const warehouse = searchParams.get("warehouse");
  const rowId = searchParams.get("rowId");

  const q = {};
  if (warehouse) q.warehouse = warehouse;
  if (rowId) q.rowId = rowId;

  const allocations = await Allocation.find(q).sort({ createdAt: -1 }).lean();
  return Response.json({ ok: true, allocations });
}

export async function POST(req) {
  await dbConnect();
  const body = await req.json();

  const { entryId, rowId } = body;
  if (!entryId || !rowId) {
    return Response.json({ ok: false, message: "entryId and rowId are required" }, { status: 400 });
  }

  const entry = await FGEntry.findById(entryId).lean();
  if (!entry) return Response.json({ ok: false, message: "Entry not found" }, { status: 404 });

  if (entry.allocationId) {
    return Response.json({ ok: false, message: "This entry already has an allocation" }, { status: 400 });
  }

  const row = await Row.findById(rowId).lean();
  if (!row) return Response.json({ ok: false, message: "Row not found" }, { status: 404 });

  if (row.warehouse !== entry.warehouse) {
    return Response.json({ ok: false, message: "Row warehouse and entry warehouse mismatch" }, { status: 400 });
  }

  const prior = await Allocation.find({ rowId: row._id }).sort({ createdAt: 1 }).lean();

  const preview = previewForRow({
    row,
    buyer: entry.buyer,
    cartonDimCm: entry.cartonDimCm,
    cartonQty: entry.cartonQty,
    priorAllocations: prior,
  });

  if (!preview.ok) return Response.json({ ok: false, message: preview.reason }, { status: 400 });

  const alloc = await Allocation.create({
    entryId: entry._id,
    rowId: row._id,
    warehouse: entry.warehouse,
    buyer: entry.buyer,
    cartonDimCm: entry.cartonDimCm,

    rowWidthCm: row.widthCm,
    rowMaxHeightCm: row.maxHeightCm,

    orientation: preview.metrics.orientation,
    across: preview.metrics.across,
    layers: preview.metrics.layers,

    allocatedHeightCm: preview.metrics.allocatedHeightCm,
    remainingHeightCm: preview.metrics.remainingHeightCm,

    columnDepthCm: preview.metrics.columnDepthCm,
    perColumnCapacity: preview.metrics.perColumnCapacity,
    qtyTotal: entry.cartonQty,

    rowTotalLengthCm: preview.metrics.rowTotalLengthCm,
    rowStartAtCm: preview.metrics.rowStartAtCm,
    rowEndAtCm: preview.metrics.rowEndAtCm,
    rowRemainingAfterCm: preview.metrics.rowRemainingAfterCm,

    segmentsMeta: preview.segmentsMeta,
    columnsBySegment: preview.columnsBySegment,
    cells: preview.cells,
  });

  await FGEntry.findByIdAndUpdate(entry._id, { allocationId: alloc._id, status: "ALLOCATED" });

  return Response.json({ ok: true, allocation: alloc }, { status: 201 });
}
