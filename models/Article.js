import mongoose from "mongoose";

const articleSchema = new mongoose.Schema(
  {
    reference:   { type: String, required: true, trim: true, index: true },
    designation: { type: String, required: true, trim: true },
    prixHT:      { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Article", articleSchema);
