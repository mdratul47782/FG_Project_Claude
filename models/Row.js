import mongoose from "mongoose";

const SegmentSchema = new mongoose.Schema(
  { lengthCm: { type: Number, required: true } },
  { _id: false }
);

const PillarSchema = new mongoose.Schema(
  {
    atSegmentBoundaryIndex: { type: Number, required: true }, // after which segment
    radiusCm: { type: Number, default: 10 },
  },
  { _id: false }
);

const RowSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // "Row-1"
    warehouse: { type: String, enum: ["B1", "B2"], required: true },

    widthCm: { type: Number, default: 120 },
    maxHeightCm: { type: Number, default: 213 },

    type: { type: String, enum: ["continuous", "segmented"], required: true },

    // continuous
    lengthCm: { type: Number },

    // segmented
    segments: { type: [SegmentSchema], default: [] },
    pillars: { type: [PillarSchema], default: [] },
  },
  { timestamps: true }
);

RowSchema.index({ warehouse: 1, name: 1 }, { unique: true });

export default mongoose.models.Row || mongoose.model("Row", RowSchema);
