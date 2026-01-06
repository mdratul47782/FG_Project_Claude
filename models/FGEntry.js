// models/FGEntry.js
import mongoose from "mongoose";

const DimSchema = new mongoose.Schema(
  {
    w: { type: Number, required: true }, // cm
    l: { type: Number, required: true }, // cm
    h: { type: Number, required: true }, // cm
  },
  { _id: false }
);

// ✅ Size+Qty is PER CARTON breakdown
// Example: [{size:"M", qty:4}, {size:"XL", qty:6}] => pcsPerCarton=10
const SizeQtySchema = new mongoose.Schema(
  {
    size: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const PackSchema = new mongoose.Schema(
  {
    depthBy: { type: String, enum: ["L", "W"], default: "L" },
    acrossWanted: { type: Number, enum: [2, 3], default: 3 },
  },
  { _id: false }
);

const CreatedBySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: false },
    user_name: { type: String, default: "" },
    role: { type: String, default: "" },
    assigned_building: { type: String, default: "" },
    factory: { type: String, default: "" },
  },
  { _id: false }
);

const FGEntrySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },

    floor: { type: String, required: true },
    buyer: {
      type: String,
      enum: [
        "Decathlon - knit",
        "Decathlon - woven",
        "walmart",
        "Columbia",
        "ZXY",
        "CTC",
        "DIESEL",
        "Sports Group Denmark",
        "Identity",
        "Fifth Avenur",
      ],
      required: true,
    },

    season: String,
    poNumber: String,
    style: String,
    model: String,
    item: String,
    color: String,

    // ✅ NEW
    packType: {
      type: String,
      enum: ["SOLID_COLOR_SOLID_SIZE", "SOLID_COLOR_ASSORT_SIZE", "ASSORT_COLOR_SOLID_SIZE", "ASSORT_COLOR_ASSORT_SIZE"],
      default: "SOLID_COLOR_SOLID_SIZE",
      required: true,
    },

    // ✅ NEW (per carton)
    sizes: { type: [SizeQtySchema], default: [] },

    warehouse: { type: String, enum: ["B1", "B2"], required: true },

    // ✅ must store FINAL pcs/carton (sum(sizes.qty) if sizes provided)
    pcsPerCarton: { type: Number, required: true },
    cartonQty: { type: Number, required: true },
    cartonDimCm: { type: DimSchema, required: true },

    pack: { type: PackSchema, default: () => ({ depthBy: "L", acrossWanted: 3 }) },

    // ✅ totals
    totalQty: { type: Number, required: true },
    fobPerPcs: { type: Number, required: true },
    totalFob: { type: Number, required: true },

    perCartonCbm: { type: Number, required: true },
    totalCbm: { type: Number, required: true },

    status: { type: String, default: "DRAFT" }, // DRAFT | ALLOCATED
    allocationId: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation" },

    createdBy: { type: CreatedBySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.models.FGEntry || mongoose.model("FGEntry", FGEntrySchema);
