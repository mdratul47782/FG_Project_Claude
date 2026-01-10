// app/api/fg-search/route.js
import { dbConnect } from "@/services/mongo";
import FGEntry from "@/models/FGEntry";
import Allocation from "@/models/Allocation";

function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateOnly(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

const WAREHOUSES = new Set(["B1", "B2"]);

export async function GET(req) {
  await dbConnect();

  const { searchParams } = new URL(req.url);

  const warehouse = (searchParams.get("warehouse") || "").trim();
  const buyer = (searchParams.get("buyer") || "").trim();
  const poNumber = (searchParams.get("poNumber") || "").trim();
  const style = (searchParams.get("style") || "").trim();

  const from = parseDateOnly(searchParams.get("from"));
  const to = parseDateOnly(searchParams.get("to"));

  const q = {};

  // ✅ NEW: filter by warehouse
  if (warehouse && WAREHOUSES.has(warehouse)) q.warehouse = warehouse;

  if (buyer) q.buyer = buyer;
  if (poNumber) q.poNumber = new RegExp(escapeRegex(poNumber), "i");
  if (style) q.style = new RegExp(escapeRegex(style), "i");

  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = from;
    if (to) {
      const toNext = new Date(to);
      toNext.setDate(toNext.getDate() + 1);
      q.createdAt.$lt = toNext;
    }
  }

  const entries = await FGEntry.find(q).sort({ createdAt: -1 }).lean();

  const entryIds = entries.map((e) => e._id);
  const allocations = await Allocation.find({ entryId: { $in: entryIds } }).lean();

  const allocMap = new Map(allocations.map((a) => [String(a.entryId), a]));

  const results = entries.map((entry) => ({
    entry,
    allocation: allocMap.get(String(entry._id)) || null,
  }));

  return Response.json({ ok: true, count: results.length, results });
}
