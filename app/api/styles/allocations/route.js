// ✅ NEW: app/api/styles/allocations/route.js
// Bulk delete allocations for the CURRENT search filter (warehouse + style + optional buyer/color)
import { dbConnect } from "@/services/mongo";
import FGEntry from "@/models/FGEntry";
import Allocation from "@/models/Allocation";

export async function DELETE(req) {
  await dbConnect();

  const body = await req.json().catch(() => ({}));

  const warehouse = String(body?.warehouse || "").trim();
  const style = String(body?.style || "").trim();
  const buyer = String(body?.buyer || "").trim(); // "" => all
  const color = String(body?.color || "").trim(); // "" => all

  if (!warehouse) return Response.json({ ok: false, message: "warehouse is required" }, { status: 400 });
  if (!style) return Response.json({ ok: false, message: "style is required" }, { status: 400 });

  const q = { warehouse, style, allocationId: { $ne: null } };
  if (buyer) q.buyer = buyer;
  if (color) q.color = color;

  const entries = await FGEntry.find(q).select("_id allocationId").lean();

  const entryIds = entries.map((e) => e._id);
  const allocIds = entries.map((e) => e.allocationId).filter(Boolean);

  if (!allocIds.length) {
    return Response.json({ ok: true, deletedAllocations: 0, updatedEntries: 0 });
  }

  const del = await Allocation.deleteMany({ _id: { $in: allocIds } });
  const upd = await FGEntry.updateMany(
    { _id: { $in: entryIds } },
    { $set: { allocationId: null, status: "DRAFT" } }
  );

  return Response.json({
    ok: true,
    deletedAllocations: del.deletedCount || 0,
    updatedEntries: upd.modifiedCount || 0,
  });
}
