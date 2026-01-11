// app/api/fg/entries/[code]/allocation/route.js
import { NextResponse } from "next/server";
import { dbConnect } from "@/services/mongo";
import FGEntry from "@/models/FGEntry";
import Allocation from "@/models/Allocation";

function getCodeFromRequest(req, params) {
  // Normal case (App Router dynamic segment)
  if (params?.code) return decodeURIComponent(params.code);

  // Fallback: parse from URL path: /api/fg/entries/:code/allocation
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // ... entries, {code}, allocation
  const code = parts[parts.length - 2]; // second last
  return code ? decodeURIComponent(code) : "";
}

export async function DELETE(req, ctx) {
  try {
    const code = getCodeFromRequest(req, ctx?.params);

    if (!code) {
      return NextResponse.json(
        { ok: false, message: "Missing entry code in URL" },
        { status: 400 }
      );
    }

    await dbConnect();

    const entry = await FGEntry.findOne({ code });
    if (!entry) {
      return NextResponse.json({ ok: false, message: "Entry not found" }, { status: 404 });
    }

    // prefer entry.allocationId, fallback by entryId
    let allocationId = entry.allocationId;

    if (!allocationId) {
      const alloc = await Allocation.findOne({ entryId: entry._id });
      allocationId = alloc?._id || null;
    }

    if (allocationId) {
      await Allocation.deleteOne({ _id: allocationId });
    }

    entry.shipped = true;
    entry.shippedAt = new Date();
    entry.allocationId = null;
    await entry.save();

    return NextResponse.json({
      ok: true,
      deletedAllocationId: allocationId ? String(allocationId) : null,
      entry: entry.toObject(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
