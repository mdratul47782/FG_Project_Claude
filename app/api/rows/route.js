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
    name: "A-1",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2030,
    maxHeightCm: 213,
  },
  {
    name: "A-2",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 0 }, { lengthCm: 546.1 }, { lengthCm: 546.1 }, { lengthCm: 327.66 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },
  {
    name: "A-3",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1074.42,
    maxHeightCm: 213,
  },
  {
    name: "A-4",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1074.42,
    maxHeightCm: 213,
  },
  {
    name: "A-5",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2184.4,
    maxHeightCm: 213,
  },
  {
    name: "A-6",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 401.32 }, { lengthCm: 637.54 }, { lengthCm: 624.84 }, { lengthCm: 327.66 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },
  {
    name: "A-7",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2174.24,
    maxHeightCm: 213,
  },
  {
    name: "A-8",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2174.24,
    maxHeightCm: 213,
  },
  {
    name: "A-9",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2174.24,
    maxHeightCm: 213,
  },
  {
    name: "A-10",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2174.24,
    maxHeightCm: 213,
  },
  {
    name: "A-11",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 401.52 }, { lengthCm: 637.54 }, { lengthCm: 624.84 }, { lengthCm: 327.66 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },
  {
    name: "A-12",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2174.24,
    maxHeightCm: 213,
  },
  {
    name: "A-13",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2174.24,
    maxHeightCm: 213,
  },
  {
    name: "A-14",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 2174.24,
    maxHeightCm: 213,
  },
  {
    name: "A-15",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 0 }, { lengthCm: 637.54 }, { lengthCm: 624.84 }, { lengthCm: 327.66 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },
  {
    name: "A-16",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1811,
    maxHeightCm: 213,
  },
  {
    name: "A-17",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm:1811,
    maxHeightCm: 213,
  },
  {
    name: "A-18",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1811,
    maxHeightCm: 213,
  },
  {
    name: "A-19",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 0 }, { lengthCm: 337.54 }, { lengthCm: 624.84 }, { lengthCm: 327.66 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },
  {
    name: "A-20",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1811,
    maxHeightCm: 213,
  },
  {
    name: "A-21",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1811,
    maxHeightCm: 213,
  },
  {
    name: "A-22",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1811,
    maxHeightCm: 213,
  },
  {
    name: "A-23",
    warehouse: wh,
    type: "segmented",
    widthCm: 120,
    maxHeightCm: 213,
    segments: [{ lengthCm: 0 }, { lengthCm: 637.54 }, { lengthCm: 624.84 }, { lengthCm: 327.66 }],
    pillars: [
      { atSegmentBoundaryIndex: 0, radiusCm: 32 },
      { atSegmentBoundaryIndex: 1, radiusCm: 32 },
      { atSegmentBoundaryIndex: 2, radiusCm: 32 },
    ],
  },
  {
    name: "A-24",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1811,
    maxHeightCm: 213,
  },
  {
    name: "A-25",
    warehouse: wh,
    type: "continuous",
    widthCm: 120,
    lengthCm: 1811,
    maxHeightCm: 213,
  }]);
  }
}

export async function GET(req) {
  await dbConnect();
  await seedRowsIfEmpty();
  const { searchParams } = new URL(req.url);
  const warehouse = searchParams.get("warehouse");
  const q = {};
  if (warehouse) q.warehouse = warehouse;
  
  // Fetch rows without sorting (we'll sort in JS)
  const rows = await Row.find(q).lean();
  
  // Natural sort by name (A-1, A-2, ... A-10, A-11, ... A-25)
  rows.sort((a, b) => {
    const aName = a.name || "";
    const bName = b.name || "";
    
    // Extract the numeric part from names like "A-1", "A-10", etc.
    const aMatch = aName.match(/(\D+)-?(\d+)/);
    const bMatch = bName.match(/(\D+)-?(\d+)/);
    
    if (aMatch && bMatch) {
      const aPrefix = aMatch[1];
      const bPrefix = bMatch[1];
      const aNum = parseInt(aMatch[2], 10);
      const bNum = parseInt(bMatch[2], 10);
      
      // First compare prefixes (A, B, C, etc.)
      if (aPrefix !== bPrefix) {
        return aPrefix.localeCompare(bPrefix);
      }
      
      // Then compare numbers numerically
      return aNum - bNum;
    }
    
    // Fallback to string comparison
    return aName.localeCompare(bName);
  });
  
  return Response.json({ ok: true, rows });
}

export async function POST(req) {
  await dbConnect();
  const body = await req.json();
  const row = await Row.create(body);
  return Response.json({ ok: true, row }, { status: 201 });
}