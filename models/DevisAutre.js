// models/DevisAutre.js
import mongoose from "mongoose";
import { devisBase } from "./_devisBase.js";

// Spécifique au formulaire "Autre article en fil métallique"
const specSchema = new mongoose.Schema(
  {
    // Gardé pour compat (anciens enregistrements)
    titre: { type: String, trim: true },

    // Champs du formulaire
    designation: { type: String, required: true, trim: true }, // "Désignation / Référence *"
    dimensions:  { type: String, trim: true },                  // "Dimensions principales"
    quantite:    { type: Number, required: true, min: 1 },      // "Quantité *"
    matiere:     { type: String, required: true, trim: true },  // "Matière *" (valeur du select)
    description: { type: String, trim: true }                   // "Description de l'article"
  },
  { _id: false }
);

// PDF généré côté backend (accusé/demande)
const demandePdfSchema = new mongoose.Schema(
  {
    filename:    { type: String, trim: true },
    contentType: { type: String, trim: true },
    size:        { type: Number },
    data:        Buffer
  },
  { _id: false }
);

const schema = new mongoose.Schema({});
schema.add(devisBase);
schema.add({
  spec: specSchema,
  demandePdf: demandePdfSchema
});

// (facultatif) alléger les réponses JSON en masquant les buffers
schema.set("toJSON", {
  transform: (_doc, ret) => {
    if (Array.isArray(ret.documents)) {
      ret.documents = ret.documents.map(f => ({
        filename: f.filename, mimetype: f.mimetype, size: f.size
      }));
    }
    if (ret.demandePdf) {
      ret.demandePdf = {
        filename: ret.demandePdf.filename,
        contentType: ret.demandePdf.contentType,
        size: ret.demandePdf.size
      };
    }
    return ret;
  }
});

export default mongoose.model("DemandeDevisAutre", schema);
