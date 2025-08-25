import mongoose from "mongoose";

const articleSchema = new mongoose.Schema(
  {
    reference:   { type: String, required: true, trim: true, index: true },
    designation: { type: String, required: true, trim: true },
    prixHT:      { type: Number, required: true, min: 0 },
    // un seul numéro de demande de devis
    numeroDevis: { type: String, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model("Article", articleSchema);
