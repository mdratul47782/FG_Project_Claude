// app/api/allocations/[id]/route.js
import { dbConnect } from "@/services/mongo";
import Allocation from "@/models/Allocation";
import FGEntry from "@/models/FGEntry";

export async function GET(_req, { params }) {
  await dbConnect();
  const allocation = await Allocation.findById(params.id).lean();
  if (!allocation) return Response.json({ ok: false, message: "Allocation not found" }, { status: 404 });
  return Response.json({ ok: true, allocation });
}

export async function DELETE(_req, { params }) {
  await dbConnect();

  const alloc = await Allocation.findById(params.id).lean();
  if (!alloc) return Response.json({ ok: false, message: "Allocation not found" }, { status: 404 });

  await FGEntry.findByIdAndUpdate(alloc.entryId, { allocationId: null, status: "DRAFT" });
  await Allocation.findByIdAndDelete(params.id);

  return Response.json({ ok: true });
}
