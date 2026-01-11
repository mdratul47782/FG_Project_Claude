// app/api/fg/scan/route.js
import { NextResponse } from "next/server";
import { dbConnect } from "@/services/mongo";
import FGEntry from "@/models/FGEntry";
import Allocation from "@/models/Allocation";
import Row from "@/models/Row";

function parseBarcode(raw) {
  const s = String(raw || "").trim();
  const parts = s.split("-").filter(Boolean);

  if (parts.length < 2) return { barcode: s, entryCode: "", cartonId: "" };

  const last = parts[parts.length - 1];
  const looksLikeCarton = /^\d{1,6}$/.test(last);

  if (!looksLikeCarton) return { barcode: s, entryCode: s, cartonId: "" };

  return {
    barcode: s,
    entryCode: parts.slice(0, -1).join("-"),
    cartonId: last,
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = (searchParams.get("barcode") || "").trim();

    if (!barcode) {
      return NextResponse.json(
        { ok: false, message: "barcode query param is required" },
        { status: 400 }
      );
    }

    const parsed = parseBarcode(barcode);
    if (!parsed.entryCode) {
      return NextResponse.json(
        { ok: false, message: "Invalid barcode format" },
        { status: 400 }
      );
    }

    await dbConnect();

    const entryDoc = await FGEntry.findOne({ code: parsed.entryCode }).lean();
    if (!entryDoc) {
      return NextResponse.json(
        { ok: false, message: "Entry not found", ...parsed },
        { status: 404 }
      );
    }

    // allocation for this entry
    let allocationDoc = null;
    if (entryDoc.allocationId) {
      allocationDoc = await Allocation.findById(entryDoc.allocationId).lean();
    }
    if (!allocationDoc) {
      allocationDoc = await Allocation.findOne({ entryId: entryDoc._id }).lean();
    }

    // row for that allocation
    let rowDoc = null;
    if (allocationDoc?.rowId) {
      rowDoc = await Row.findById(allocationDoc.rowId).lean();
    }

    // ✅ Only allocated row context (allocations + entries of that row)
    let rowAllocations = [];
    let rowEntries = [];

    if (rowDoc?._id) {
      rowAllocations = await Allocation.find({ rowId: rowDoc._id }).lean();

      const entryIds = rowAllocations.map((a) => a.entryId).filter(Boolean);

      rowEntries = await FGEntry.find({ _id: { $in: entryIds } })
        .select(
          "code buyer warehouse floor season poNumber style model item color packType sizes pcsPerCarton cartonQty totalQty cartonDimCm totalCbm createdBy createdAt updatedAt status shipped shippedAt"
        )
        .lean();

      // ✅ hide shipped entries from row context
      const entryMap = new Map(rowEntries.map((e) => [String(e._id), e]));
      rowAllocations = rowAllocations.filter((a) => {
        const e = entryMap.get(String(a.entryId));
        return e ? e.shipped !== true : true;
      });

      const liveIds = new Set(rowAllocations.map((a) => String(a.entryId)));
      rowEntries = rowEntries.filter((e) => liveIds.has(String(e._id)));
    }

    return NextResponse.json({
      ok: true,
      ...parsed,
      entry: entryDoc,
      allocation: allocationDoc || null,
      row: rowDoc || null,

      // ✅ for scan-shipment row-only view
      rowAllocations,
      rowEntries,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
