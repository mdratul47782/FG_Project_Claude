// ✅ NEW: app/api/styles/search/route.js
// Search by: warehouse + style + (buyer optional) + (color optional)
// Returns: all matching entries (with allocation/row info) + date×size "pieces" table
import { dbConnect } from "@/services/mongo";
import FGEntry from "@/models/FGEntry";
import Allocation from "@/models/Allocation";
import Row from "@/models/Row";

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function ymd(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function ddMMM(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  const day = dt.getDate();
  const mon = dt.toLocaleString("en-US", { month: "short" });
  return `${day}-${mon}`;
}

// ✅ Your schema: sizes.qty is PER CARTON
// So "pieces by size" = (sizes.qty * cartonQty)
function piecesBySize(entry) {
  const cartonQty = n(entry?.cartonQty);
  const sizes = Array.isArray(entry?.sizes) ? entry.sizes : [];
  const m = {};

  for (const r of sizes) {
    const size = String(r?.size || "").trim();
    const perCarton = n(r?.qty);
    if (!size || perCarton <= 0) continue;
    m[size] = (m[size] || 0) + perCarton * cartonQty;
  }

  return m;
}

function orderedSizesFromTotals(totalsBySize) {
  const all = Object.keys(totalsBySize || {});
  const known = SIZE_ORDER.filter((s) => all.includes(s));
  const unknown = all.filter((s) => !SIZE_ORDER.includes(s)).sort();
  return [...known, ...unknown];
}

export async function GET(req) {
  await dbConnect();

  const { searchParams } = new URL(req.url);
  const warehouse = String(searchParams.get("warehouse") || "").trim();
  const style = String(searchParams.get("style") || "").trim();
  const buyer = String(searchParams.get("buyer") || "").trim(); // "" => all buyers
  const color = String(searchParams.get("color") || "").trim(); // "" => all colors

  if (!warehouse) return Response.json({ ok: false, message: "warehouse is required" }, { status: 400 });
  if (!style) return Response.json({ ok: false, message: "style is required" }, { status: 400 });

  const q = { warehouse, style };
  if (buyer) q.buyer = buyer;
  if (color) q.color = color;

  const entries = await FGEntry.find(q).sort({ createdAt: 1 }).lean();

  const entryIds = entries.map((e) => e._id);
  const allocations = await Allocation.find({ entryId: { $in: entryIds } }).lean();

  const rowIds = allocations.map((a) => a.rowId);
  const rows = await Row.find({ _id: { $in: rowIds } }).lean();

  const rowMap = new Map(rows.map((r) => [String(r._id), r]));
  const allocByEntryId = new Map(allocations.map((a) => [String(a.entryId), a]));

  // ✅ date x size table (pieces)
  const byDate = new Map();
  const totalsBySize = {};
  let grandTotal = 0;

  for (const e of entries) {
    const key = ymd(e.createdAt);
    if (!key) continue;

    const row = byDate.get(key) || { dateKey: key, date: ddMMM(e.createdAt), bySize: {}, total: 0 };

    const pcs = piecesBySize(e);
    for (const [size, qty] of Object.entries(pcs)) {
      row.bySize[size] = (row.bySize[size] || 0) + n(qty);
      totalsBySize[size] = (totalsBySize[size] || 0) + n(qty);
      row.total += n(qty);
      grandTotal += n(qty);
    }

    byDate.set(key, row);
  }

  const tableRows = Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const sizes = orderedSizesFromTotals(totalsBySize);

  const uiEntries = entries.map((e) => {
    const alloc = allocByEntryId.get(String(e._id)) || null;
    const row = alloc ? rowMap.get(String(alloc.rowId)) : null;

    return {
      _id: String(e._id),
      code: e.code,
      createdAt: e.createdAt,
      date: ddMMM(e.createdAt),

      warehouse: e.warehouse,
      buyer: e.buyer,
      color: e.color,
      season: e.season || "",
      poNumber: e.poNumber || "",
      style: e.style || "",
      model: e.model || "",
      item: e.item || "",

      cartonQty: n(e.cartonQty),
      pcsPerCarton: n(e.pcsPerCarton),
      sizes: Array.isArray(e.sizes) ? e.sizes : [],
      totalQty: n(e.totalQty),
      cartonDimCm: e.cartonDimCm || {},

      status: e.status || "",
      allocationId: e.allocationId ? String(e.allocationId) : null,

      alloc: alloc
        ? {
            _id: String(alloc._id),
            rowId: String(alloc.rowId),
            rowName: row?.name || "N/A",
            rowStartAtCm: n(alloc.rowStartAtCm),
            rowEndAtCm: n(alloc.rowEndAtCm),
          }
        : null,
    };
  });

  const allocatedCount = uiEntries.filter((e) => e.alloc?._id).length;

  return Response.json({
    ok: true,
    query: { warehouse, style, buyer: buyer || "ALL", color: color || "ALL" },
    sizes,
    rows: tableRows, // table rows: [{date, bySize, total}]
    totalsBySize,
    grandTotal,
    entries: uiEntries,
    entryIds: uiEntries.map((x) => x._id), // for GraphicalPane highlight
    counts: { totalEntries: uiEntries.length, allocatedCount },
  });
}
