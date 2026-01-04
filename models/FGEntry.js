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

const PackSchema = new mongoose.Schema(
  {
    // ✅ user chooses how carton goes along row (depth)
    // "L" => carton length goes along row depth, width used for across
    // "W" => carton width goes along row depth, length used for across
    depthBy: { type: String, enum: ["L", "W"], default: "L" },

    // ✅ user chooses 2 or 3 across
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
    size: String,

    warehouse: { type: String, enum: ["B1", "B2"], required: true },

    pcsPerCarton: { type: Number, required: true },
    cartonQty: { type: Number, required: true },
    cartonDimCm: { type: DimSchema, required: true },

    // ✅ user placement choice saved on entry
    pack: { type: PackSchema, default: () => ({ depthBy: "L", acrossWanted: 3 }) },

    totalQty: { type: Number, required: true },
    fobPerPcs: { type: Number, required: true },
    totalFob: { type: Number, required: true },

    perCartonCbm: { type: Number, required: true },
    totalCbm: { type: Number, required: true },

    status: { type: String, default: "DRAFT" }, // DRAFT | ALLOCATED

    allocationId: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation" },

    // ✅ auth snapshot
    createdBy: { type: CreatedBySchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.models.FGEntry || mongoose.model("FGEntry", FGEntrySchema);
