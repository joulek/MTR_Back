import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  reference: String,
  designation: String,
  unite: { type: String, default: "U" },
  quantite: { type: Number, required: true },
  puht: { type: Number, required: true },     // Prix Unitaire HT
  remisePct: { type: Number, default: 0 },    // % remise
  tvaPct: { type: Number, default: 19 },      // 0 | 7 | 13 | 19 ...
  totalHT: Number,                             // calculé
}, { _id:false });

const devisSchema = new mongoose.Schema({
  numero: { type: String, unique: true, index: true }, // DV2500016…
  demandeId: { type: mongoose.Schema.Types.ObjectId, ref: "DemandeDevis" },
  client: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    nom: String,
    email: String,
    adresse: String,
    tel: String,
    codeTVA: String,
  },
  items: [itemSchema],
  totaux: {
    mtht: Number,
    mtnetht: Number,
    mttva: Number,
    fodecPct: { type: Number, default: 1 },   // 1%
    mfodec: Number,
    timbre: { type: Number, default: 0 },
    mttc: Number,
  },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model("Devis", devisSchema);
