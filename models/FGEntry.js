import mongoose from "mongoose";

const DimSchema = new mongoose.Schema(
  {
    w: { type: Number, required: true }, // cm
    l: { type: Number, required: true }, // cm
    h: { type: Number, required: true }, // cm
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

    totalQty: { type: Number, required: true },
    fobPerPcs: { type: Number, required: true },
    totalFob: { type: Number, required: true },

    perCartonCbm: { type: Number, required: true },
    totalCbm: { type: Number, required: true },

    status: { type: String, default: "DRAFT" }, // DRAFT | ALLOCATED

    allocationId: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation" },
  },
  { timestamps: true }
);

export default mongoose.models.FGEntry || mongoose.model("FGEntry", FGEntrySchema);
