// app/api/styles/reallocate/route.js
import mongoose from "mongoose";
import { dbConnect } from "@/services/mongo";
import FGEntry from "@/models/FGEntry";
import Allocation from "@/models/Allocation";
import Row from "@/models/Row";

// reuse your existing allocator logic
import { previewForRow } from "@/app/api/allocations/_lib";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function asId(v) {
  return String(v || "").trim();
}

function buildAllocDoc({ entry, row, preview }) {
  return {
    entryId: entry._id,
    rowId: row._id,
    warehouse: entry.warehouse,
    buyer: entry.buyer,
    cartonDimCm: entry.cartonDimCm,

    rowWidthCm: n(row.widthCm),
    rowMaxHeightCm: n(row.maxHeightCm),

    orientation: preview.metrics.orientation,
    across: preview.metrics.across,
    layers: preview.metrics.layers,

    allocatedHeightCm: preview.metrics.allocatedHeightCm,
    remainingHeightCm: preview.metrics.remainingHeightCm,

    columnDepthCm: preview.metrics.columnDepthCm,
    perColumnCapacity: preview.metrics.perColumnCapacity,
    qtyTotal: n(entry.cartonQty),

    rowTotalLengthCm: preview.metrics.rowTotalLengthCm,
    rowStartAtCm: preview.metrics.rowStartAtCm,
    rowEndAtCm: preview.metrics.rowEndAtCm,
    rowRemainingAfterCm: preview.metrics.rowRemainingAfterCm,

    segmentsMeta: preview.segmentsMeta,
    columnsBySegment: preview.columnsBySegment,
    cells: preview.cells,
  };
}

async function runNoTxn({ moveEntryIds, allocDocs }) {
  const del = await Allocation.deleteMany({ entryId: { $in: moveEntryIds } });

  await FGEntry.updateMany(
    { _id: { $in: moveEntryIds } },
    { $set: { allocationId: null, status: "DRAFT" } }
  );

  const created = await Allocation.insertMany(allocDocs);

  const bulk = created.map((a) => ({
    updateOne: {
      filter: { _id: a.entryId },
      update: { $set: { allocationId: a._id, status: "ALLOCATED" } },
    },
  }));
  const bw = bulk.length ? await FGEntry.bulkWrite(bulk) : { modifiedCount: 0 };

  return {
    deletedAllocations: del.deletedCount || 0,
    createdAllocations: created.length,
    updatedEntries: bw.modifiedCount || 0,
  };
}

export async function POST(req) {
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const warehouse = asId(body?.warehouse);
  const style = asId(body?.style);
  const buyer = asId(body?.buyer); // "" => all
  const color = asId(body?.color); // "" => all
  const rowId = asId(body?.rowId);

  if (!warehouse) return Response.json({ ok: false, message: "warehouse is required" }, { status: 400 });
  if (!style) return Response.json({ ok: false, message: "style is required" }, { status: 400 });
  if (!rowId) return Response.json({ ok: false, message: "rowId is required" }, { status: 400 });

  const row = await Row.findById(rowId).lean();
  if (!row) return Response.json({ ok: false, message: "Row not found" }, { status: 404 });
  if (String(row.warehouse) !== warehouse) {
    return Response.json({ ok: false, message: "Row warehouse mismatch" }, { status: 400 });
  }

  const q = { warehouse, style };
  if (buyer) q.buyer = buyer;
  if (color) q.color = color;

  const entries = await FGEntry.find(q).sort({ createdAt: 1 }).lean();
  if (!entries.length) {
    return Response.json({ ok: false, message: "No entries found for this filter" }, { status: 404 });
  }

  const moveEntryIds = entries.map((e) => e._id);

  // keep existing allocations in this row that are NOT part of this move
  const baseAllocs = await Allocation.find({
    rowId: row._id,
    entryId: { $nin: moveEntryIds },
  })
    .sort({ rowStartAtCm: 1, createdAt: 1 })
    .lean();

  // PLAN first (no partial saves)
  const plannedDocs = [];
  let priorAllocations = [...baseAllocs];

  for (const entry of entries) {
    const preview = previewForRow({
      row,
      buyer: entry.buyer,
      cartonDimCm: entry.cartonDimCm,
      cartonQty: entry.cartonQty,
      priorAllocations,
      manualOrientation: null,
      manualAcross: null,
    });

    if (!preview.ok) {
      return Response.json(
        { ok: false, message: preview.reason || "Cannot allocate", failedEntryId: String(entry._id) },
        { status: 400 }
      );
    }

    if (preview?.capacity?.unplacedCartons > 0) {
      return Response.json(
        {
          ok: false,
          message: `Not enough space. Max fits: ${preview.capacity.maxCartons}, requested: ${preview.capacity.requestedCartons}.`,
          capacity: preview.capacity,
          failedEntryId: String(entry._id),
        },
        { status: 400 }
      );
    }

    const allocDoc = buildAllocDoc({ entry, row, preview });
    plannedDocs.push(allocDoc);

    // push into "prior" for next entry planning
    priorAllocations = [...priorAllocations, allocDoc];
  }

  // WRITE (transaction if possible; fallback otherwise)
  const session = await mongoose.startSession();

  try {
    let out = null;

    await session.withTransaction(async () => {
      const del = await Allocation.deleteMany({ entryId: { $in: moveEntryIds } }).session(session);

      await FGEntry.updateMany(
        { _id: { $in: moveEntryIds } },
        { $set: { allocationId: null, status: "DRAFT" } },
        { session }
      );

      const created = await Allocation.insertMany(plannedDocs, { session });

      const bulk = created.map((a) => ({
        updateOne: {
          filter: { _id: a.entryId },
          update: { $set: { allocationId: a._id, status: "ALLOCATED" } },
        },
      }));

      const bw = bulk.length ? await FGEntry.bulkWrite(bulk, { session }) : { modifiedCount: 0 };

      out = {
        deletedAllocations: del.deletedCount || 0,
        createdAllocations: created.length,
        updatedEntries: bw.modifiedCount || 0,
      };
    });

    return Response.json({ ok: true, ...out });
  } catch (e) {
    // common if Mongo isn’t a replica set; do best-effort without txn
    try {
      const out = await runNoTxn({ moveEntryIds, allocDocs: plannedDocs });
      return Response.json({ ok: true, ...out, note: "Saved without transaction" });
    } catch (e2) {
      return Response.json({ ok: false, message: e2?.message || "Reallocate failed" }, { status: 500 });
    }
  } finally {
    session.endSession();
  }
}
