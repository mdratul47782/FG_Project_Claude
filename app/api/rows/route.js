// app\api\rows\route.js
import Row from "@/models/Row";
import { dbConnect } from "@/services/mongo";

async function seedRowsIfEmpty() {
  const count = await Row.countDocuments();
  if (count > 0) return;

  const warehouses = ["B1", "B2"];

  for (const wh of warehouses) {
    await Row.create([
  {
    name: "A1",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1981,
    maxHeightCm: 213,
  },
  {
    name: "A2",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 353 }, { lengthCm: 548 }, { lengthCm: 548 }, { lengthCm: 323 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },

  // ✅ NEW ROWS
  {
    name: "A4",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2200,
    maxHeightCm: 213,
  },
  {
    name: "A5",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 323 }, { lengthCm: 609 }, { lengthCm: 548 }, { lengthCm: 323 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },
  {
    name: "A6",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2200,
    maxHeightCm: 213,
  },
  {
    name: "A7",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2200,
    maxHeightCm: 213,
  },
  {
    name: "A8",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 323 }, { lengthCm: 454 }, { lengthCm: 548 }, { lengthCm: 323 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },
]);

  }
}

export async function GET(req) {
  await dbConnect();
  await seedRowsIfEmpty();

  const { searchParams } = new URL(req.url);
  const warehouse = searchParams.get("warehouse");

  const q = {};
  if (warehouse) q.warehouse = warehouse;

  const rows = await Row.find(q).sort({ name: 1 }).lean();
  return Response.json({ ok: true, rows });
}

export async function POST(req) {
  await dbConnect();
  const body = await req.json();
  const row = await Row.create(body);
  return Response.json({ ok: true, row }, { status: 201 });
}
