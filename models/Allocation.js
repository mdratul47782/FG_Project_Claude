// models/Allocation.js
import mongoose from "mongoose";

const SegmentMetaSchema = new mongoose.Schema(
  {
    segmentIndex: { type: Number, required: true },
    segmentStartCm: { type: Number, required: true },
    segmentLengthCm: { type: Number, required: true },

    usedBeforeCm: { type: Number, required: true },
    startFromRowStartCm: { type: Number, required: true },

    // ✅ keep this REQUIRED, but now it means “reserved length” (used + wasted tail)
    allocatedLenCm: { type: Number, required: true },

    endFromRowStartCm: { type: Number, required: true },
    remainingAfterCm: { type: Number, required: true },

    // ✅ NEW (optional, won’t break old docs)
    wastedTailCm: { type: Number, default: 0 },
  },
  { _id: false }
);

const ColumnsBySegmentSchema = new mongoose.Schema(
  {
    segmentIndex: { type: Number, required: true },
    columnsUsed: { type: Number, required: true },
    qtyPlaced: { type: Number, required: true },
    lengthUsedCm: { type: Number, required: true },
  },
  { _id: false }
);

const CellSchema = new mongoose.Schema(
  {
    segmentIndex: { type: Number, required: true },
    columnIndex: { type: Number, required: true },
    acrossIndex: { type: Number, required: true },
    filledLayers: { type: Number, required: true }, // 0..layers
    state: { type: String, enum: ["occupied", "reserved"], required: true },
  },
  { _id: false }
);

const AllocationSchema = new mongoose.Schema(
  {
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: "FGEntry", required: true },
    rowId: { type: mongoose.Schema.Types.ObjectId, ref: "Row", required: true },

    warehouse: { type: String, enum: ["B1", "B2"], required: true },
    buyer: { type: String, required: true },

    cartonDimCm: { w: Number, l: Number, h: Number },

    rowWidthCm: { type: Number, default: 120 },
    rowMaxHeightCm: { type: Number, default: 213 },

    orientation: { type: String, required: true },
    across: { type: Number, required: true },
    layers: { type: Number, required: true },

    allocatedHeightCm: { type: Number, required: true },
    remainingHeightCm: { type: Number, required: true },

    columnDepthCm: { type: Number, required: true },
    perColumnCapacity: { type: Number, required: true },
    qtyTotal: { type: Number, required: true },

    rowTotalLengthCm: { type: Number, required: true },
    rowStartAtCm: { type: Number, required: true }, // “from bottom/start”
    rowEndAtCm: { type: Number, required: true },
    rowRemainingAfterCm: { type: Number, required: true },

    segmentsMeta: { type: [SegmentMetaSchema], default: [] },
    columnsBySegment: { type: [ColumnsBySegmentSchema], default: [] },
    cells: { type: [CellSchema], default: [] },
  },
  { timestamps: true }
);

AllocationSchema.index({ rowId: 1, createdAt: 1 });

export default mongoose.models.Allocation || mongoose.model("Allocation", AllocationSchema);
