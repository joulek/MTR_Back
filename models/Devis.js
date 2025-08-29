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

devisSchema.index({ createdAt: -1 }, { name: "devis_createdAt_-1" });
devisSchema.index({ demandeId: 1, createdAt: -1 }, { name: "devis_demandeId_createdAt" });
devisSchema.index({ "meta.demandes.id": 1, createdAt: -1 }, { name: "devis_meta_demandes_id_createdAt" });
devisSchema.index({ demandeNumero: 1, createdAt: -1 }, { name: "devis_demandeNumero_createdAt" });
devisSchema.index({ "meta.demandeNumero": 1, createdAt: -1 }, { name: "devis_meta_demandeNumero_createdAt" });
devisSchema.index({ "meta.demandes.numero": 1 }, { name: "devis_meta_demandes_numero_1" });
devisSchema.index({ "meta.demandes.type": 1, createdAt: -1 }, { name: "devis_meta_demandes_type_createdAt" });
devisSchema.index({ "client.nom": 1, createdAt: -1 }, { name: "devis_client_nom_createdAt" });
// ملاحظة: عندك déjà unique + index على numero في تعريف الحقل، ما يلزمكش تضيفه مرّة أخرى
export default mongoose.model("Devis", devisSchema);
