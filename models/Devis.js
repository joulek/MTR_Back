// models/Devis.js
import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  reference: String,
  designation: String,
  unite: { type: String, default: "U" },
  quantite: { type: Number, required: true },
  puht: { type: Number, required: true },
  remisePct: { type: Number, default: 0 },
  tvaPct: { type: Number, default: 19 },
  totalHT: Number,
}, { _id:false });

// 🔥 روابط demandes الإضافية للـ devis multi-DDV
const linkSchema = new mongoose.Schema({
  id:   { type: mongoose.Schema.Types.ObjectId, ref: "DemandeDevis" },
  numero: String,
  type:  String,
}, { _id:false });

const devisSchema = new mongoose.Schema({
  numero: { type: String, unique: true, index: true }, // DV...
  demandeId: { type: mongoose.Schema.Types.ObjectId, ref: "DemandeDevis" }, // الرابط الرئيسي (الأول)
  demandeNumero: String, // تسهيل البحث
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
    fodecPct: { type: Number, default: 1 },
    mfodec: Number,
    timbre: { type: Number, default: 0 },
    mttc: Number,
  },

  // 👇 جديد
  meta: {
    demandes: [linkSchema],     // كل الـ DDV المرتبطين بهذا الـ devis
    demandeNumero: String,      // compat قديم إن لزم الأمر
  },
}, { timestamps: true });

// فهارس للبحث السريع
devisSchema.index({ demandeId: 1 });
devisSchema.index({ demandeNumero: 1 });
devisSchema.index({ "meta.demandes.id": 1 });
devisSchema.index({ "meta.demandes.numero": 1 });

export default mongoose.model("Devis", devisSchema);
