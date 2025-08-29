// controllers/devis.controller.js
import path from "path";
import mongoose from "mongoose";
import Devis from "../models/Devis.js";

// Demandes (pour créer un devis depuis une demande)
import DemandeDevisAutre from "../models/DevisAutre.js";
import DemandeDevisCompression from "../models/DevisCompression.js";
import DemandeDevisTraction from "../models/DevisTraction.js";

// Devis "métier" (pour la recherche de numéros cross-collections)
import DevisCompression from "../models/DevisCompression.js";
import DevisTraction from "../models/DevisTraction.js";
import DevisTorsion from "../models/DevisTorsion.js";
import DevisFilDresse from "../models/DevisFilDresse.js";
import DevisGrille from "../models/DevisGrille.js";
import DevisAutre from "../models/DevisAutre.js";

import { previewDevisNumber, nextDevisNumber } from "../utils/numbering.js";
import Article from "../models/Article.js";
import { buildDevisPDF } from "../utils/pdf.devis.js";
import { makeTransport } from "../utils/mailer.js";

// 👉 BASE publique du backend (mets PUBLIC_BACKEND_URL en .env en prod)
const ORIGIN =
  process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;

const toNum = (v) => Number(String(v ?? "").replace(",", "."));

// ========  A) NUMÉROS SUR TOUTES LES COLLECTIONS DEVIS  ========

const MODELS = [
  DevisCompression,
  DevisTraction,
  DevisTorsion,
  DevisFilDresse,
  DevisGrille,
  DevisAutre,
];

/**
 * GET /api/devis/numeros-all      (monté aussi sous /api/admin/devis/numeros-all si tu veux)
 * Query (optionnel):
 *   - q=DV25           (filtre partiel, insensible à la casse)
 *   - limit=500        (défaut 500, max 5000)
 *   - withType=true    (retourne aussi { numero, type })
 */
// controllers/devis.controller.js
export const getDevisByDemandeClient = async (req, res) => {
  try {
    const { demandeId } = req.params;
    const numero = (req.query.numero || "").toString().trim().toUpperCase();

    // 1) retrouver la demande, avec user minimal
    const found = await findDemandeAny(demandeId); // assure-toi que findDemandeAny fait: .populate("user", "_id email")
    if (!found) {
      return res.json({ success:false, exists:false });
    }

    // 2) contrôle d’accès (client propriétaire OU admin)
    const ownerId = (found.doc?.user?._id || found.doc?.user)?.toString?.();
    const userId  = (req.user?._id || req.user?.id)?.toString?.();
    const isAdmin = req.user?.role === "admin";

    if (!isAdmin) {
      if (!ownerId || !userId || ownerId !== userId) {
        // pas autorisé => on ne leak rien, mais pas de 403 pour le front
        return res.json({ success:false, exists:false });
      }
    }

    // 3) chercher le devis central lié à la demande
    const or = [];
    if (mongoose.isValidObjectId(demandeId)) {
      or.push({ demandeId: new mongoose.Types.ObjectId(demandeId) });
    }
    if (numero) {
      or.push({ demandeNumero: numero }, { "meta.demandeNumero": numero });
    }

    const devis = await Devis.findOne({ $or: or }).sort({ createdAt: -1 });
    if (!devis) return res.json({ success:false, exists:false });

    const filename = `${devis.numero}.pdf`;
    const pdf = `${ORIGIN}/files/devis/${filename}`;

    return res.json({
      success: true,
      exists: true,
      devis: { _id: devis._id, numero: devis.numero },
      pdf,
    });
  } catch (e) {
    console.error("getDevisByDemandeClient:", e);
    return res.status(500).json({ success:false, message:"Erreur serveur" });
  }
};



export const getAllDevisNumeros = async (req, res) => {
  try {
    const { q, withType } = req.query;
    const limit = Math.min(parseInt(req.query.limit || "500", 10), 5000);
    const regex = q ? new RegExp(q, "i") : null;

    // 1) Récupérer toutes les DEMANDES (traction/compression/…)
    const results = await Promise.all(
      MODELS.map((M) =>
        M.find(regex ? { numero: regex } : {}, "_id numero type").lean()
      )
    );
    const all = results.flat();

    // 2) Construire les listes pour croiser avec la collection Devis
    const demandeIds = all.map((d) => d._id).filter(Boolean);
    const numeros = all.map((d) => d.numero).filter(Boolean);

    // 3) Chercher les devis déjà créés pour ces demandes
    //    (principalement via demandeId ; fallback via numero/meta.demandeNumero)
    let haveDevisSet = new Set();
    if (demandeIds.length || numeros.length) {
      const existing = await Devis.find(
        {
          $or: [
            demandeIds.length ? { demandeId: { $in: demandeIds } } : null,
            numeros.length ? { demandeNumero: { $in: numeros } } : null,
            numeros.length ? { "meta.demandeNumero": { $in: numeros } } : null,
          ].filter(Boolean),
        },
        "demandeId demandeNumero meta.demandeNumero"
      ).lean();

      // marquer comme "déjà avec devis" soit par id, soit par numéro
      const doneIds = existing
        .map((x) => x.demandeId)
        .filter(Boolean)
        .map(String);
      const doneNumeros = new Set(
        existing
          .flatMap((x) => [x.demandeNumero, x?.meta?.demandeNumero])
          .filter(Boolean)
      );

      haveDevisSet = new Set(doneIds);
      // On filtrera aussi par numéro juste après
      var hasDevisByNumero = (num) => doneNumeros.has(num);
    } else {
      var hasDevisByNumero = () => false;
    }

    // 4) Garder uniquement les demandes SANS devis
    const notConverted = all.filter(
      (d) => !haveDevisSet.has(String(d._id)) && !hasDevisByNumero(d.numero)
    );

    // 5) Dédupliquer par numéro puis trier/limiter
    const byNumero = new Map();
    for (const d of notConverted) {
      if (d?.numero && !byNumero.has(d.numero)) byNumero.set(d.numero, d);
    }

    let data = Array.from(byNumero.values());
    data.sort((a, b) => String(a.numero).localeCompare(String(b.numero), "fr"));
    data = data.slice(0, limit);

    const payload =
      withType === "true"
        ? data.map((d) => ({ numero: d.numero, type: d.type }))
        : data.map((d) => ({ numero: d.numero }));

    console.log("[/devis/numeros-all] count (no-devis):", payload.length);
    return res.json({ success: true, data: payload });
  } catch (err) {
    console.error("Erreur getAllDevisNumeros:", err);
    return res
      .status(500)
      .json({ success: false, message: "Erreur serveur" });
  }
};


// ========  B) CRÉATION ET RÉCUP D’UN DEVIS (depuis une demande)  ========

const DEMANDE_MODELS = [
  { type: "autre",       Model: DemandeDevisAutre },
  { type: "compression", Model: DemandeDevisCompression },
  { type: "traction",    Model: DemandeDevisTraction },
  { type: "torsion",     Model: DevisTorsion },
  { type: "fil",   Model: DevisFilDresse },
  { type: "grille",      Model: DevisGrille },
];

export const getNextDevisNumberPreview = async (_req, res) => {
  try {
    const numero = await previewDevisNumber();
    return res.json({ success: true, numero });
  } catch (e) {
    console.error("Erreur preview devis:", e);
    return res.status(500).json({ success: false, message: "Erreur preview n° devis" });
  }
};

async function findDemandeAny(demandeId) {
  for (const { type, Model } of DEMANDE_MODELS) {
    const doc = await Model.findById(demandeId).populate("user");
    if (doc) return { type, doc };
  }
  return null;
}

// === CRÉER UN DEVIS À PARTIR DE PLUSIEURS DEMANDES (même client) ===
// controllers/devis.controller.js
export const createFromDemande = async (req, res) => {
  try {
    const { demandeIds = [], lines = [], sendEmail = true } = req.body;

    if (!Array.isArray(demandeIds) || !demandeIds.length) {
      return res.status(400).json({ success:false, message:"demandeIds[] requis" });
    }
    if (!Array.isArray(lines) || !lines.length) {
      return res.status(400).json({ success:false, message:"lines[] requises" });
    }

    // 1) Charger toutes les demandes (tous types)
    const loaded = [];
    for (const id of demandeIds) {
      const found = await findDemandeAny(id);
      if (!found) {
        return res.status(404).json({ success:false, message:`Demande introuvable: ${id}` });
      }
      loaded.push(found);
    }

    // 2) Vérifier même client
    const firstUserId = (loaded[0].doc?.user?._id || loaded[0].doc?.user)?.toString?.();
    const sameClient = loaded.every(
      (f) => ((f.doc?.user?._id || f.doc?.user)?.toString?.()) === firstUserId
    );
    if (!sameClient) {
      return res.status(400).json({ success:false, message:"Toutes les demandes doivent appartenir au même client" });
    }
    const demandeUser = loaded[0].doc.user;

    // 3) Construire les lignes d’articles
    const itemDocs = [];
    for (const ln of lines) {
      const { demandeId, articleId, qty = 1, remisePct = 0, tvaPct = 19 } = ln || {};
      if (!demandeId || !articleId) {
        return res.status(400).json({ success:false, message:"Chaque ligne doit contenir demandeId et articleId" });
      }
      const art = await Article.findById(articleId);
      if (!art) {
        return res.status(404).json({ success:false, message:`Article introuvable pour la demande ${demandeId}` });
      }

      const qte = toNum(qty || 1);
      const puht = toNum(art.prixHT || art.priceHT || 0);
      const remise = toNum(remisePct || 0);
      const tva = toNum(tvaPct || 0);

      const totalHT = +(qte * puht * (1 - remise / 100)).toFixed(3);

      itemDocs.push({
        reference: art.reference || "",
        designation: art.designation || art.name || art.name_fr || "",
        unite: art.unite || "U",
        quantite: qte,
        puht,
        remisePct: remise,
        tvaPct: tva,
        totalHT,
      });
    }
    if (!itemDocs.length) {
      return res.status(400).json({ success:false, message:"Aucune ligne valide" });
    }

    // 4) Totaux
    const mtht = +itemDocs.reduce((s, it) => s + (it.totalHT || 0), 0).toFixed(3);
    const mtnetht = mtht;
    const mttva = +itemDocs.reduce((s, it) => s + (it.totalHT * (toNum(it.tvaPct)/100)), 0).toFixed(3);
    const mfodec = +((mtnetht) * 0.01).toFixed(3);
    const timbre = 0;
    const mttc = +(mtnetht + mttva + mfodec + timbre).toFixed(3);

    // 5) Numéro
    const numero = await nextDevisNumber();

    // 6) Créer le devis (1ère demande = lien principal)
    const devis = await Devis.create({
      numero,
      demandeId: loaded[0].doc._id,
      typeDemande: loaded[0].type,
      demandeNumero: loaded[0].doc.numero,
      client: {
        id: demandeUser?._id,
        nom: `${demandeUser?.prenom || ""} ${demandeUser?.nom || ""}`.trim() || demandeUser?.email,
        email: demandeUser?.email,
        adresse: demandeUser?.adresse,
        tel: demandeUser?.numTel,
        codeTVA: demandeUser?.company?.matriculeFiscal,
      },
      items: itemDocs,
      totaux: { mtht, mtnetht, mttva, fodecPct: 1, mfodec, timbre, mttc },
      meta: {
        demandes: loaded.map(x => ({ id: x.doc._id, numero: x.doc.numero, type: x.type })),
      }
    });

    const { filename } = await buildDevisPDF(devis);

    if (sendEmail && devis.client.email) {
      const transport = makeTransport();
      await transport.sendMail({
        from: process.env.MAIL_FROM || "devis@mtr.tn",
        to: devis.client.email,
        subject: `Votre devis ${devis.numero}`,
        text: `Bonjour,\nVeuillez trouver ci-joint le devis ${devis.numero}.\nCordialement.`,
        attachments: [{ filename, path: path.resolve(process.cwd(), "storage/devis", filename) }],
      });
    }

    const pdfUrl = `${ORIGIN}/files/devis/${filename}`;
    return res.json({ success:true, devis:{ _id: devis._id, numero: devis.numero }, pdf: pdfUrl });
  } catch (e) {
    console.error("createFromDemandes:", e);
    return res.status(500).json({ success:false, message:"Erreur création devis (multi)" });
  }
};
// مستعمل برشة: خليه أخفّ
export async function getByDemandeAdmin(req, res) {
  try {
    const { id } = req.params;
    const numero = (req.query.numero || "").trim();

    const or = [
      { demandeId: id },
      { "meta.demandes.id": id }
    ];
    if (numero) {
      or.push({ demandeNumero: numero }, { "meta.demandeNumero": numero }, { "meta.demandes.numero": numero });
    }

    const devis = await Devis
      .findOne({ $or: or })
      .select("numero createdAt demandeNumero meta.demandes client.nom") // projection
      .lean();

    if (!devis) return res.json({ success: true, exists: false });

    const demandeNumeros = Array.from(new Set([
      devis.demandeNumero,
      devis?.meta?.demandeNumero,
      ...(Array.isArray(devis?.meta?.demandes) ? devis.meta.demandes.map(x => x?.numero).filter(Boolean) : [])
    ].filter(Boolean)));

    const filename = `${devis.numero}.pdf`;
    const pdf = `${ORIGIN}/files/devis/${filename}`;

    return res.json({
      success: true,
      exists: true,
      devis: { _id: devis._id, numero: devis.numero },
      demandeNumeros,
      pdf
    });
  } catch (e) {
    console.error("getByDemandeAdmin:", e);
    return res.status(500).json({ success:false, message:"Erreur serveur" });
  }
}

export const getDevisByDemande = async (req, res) => {
  try {
    const { demandeId } = req.params;
    const numero = (req.query.numero || "").toString().trim().toUpperCase();

    const or = [];
    if (mongoose.isValidObjectId(demandeId)) or.push({ demandeId: new mongoose.Types.ObjectId(demandeId) });
    if (numero) or.push({ demandeNumero: numero }, { "meta.demandeNumero": numero }, { "meta.demandes.numero": numero });

    if (!or.length) return res.status(400).json({ success:false, message:"Paramètres manquants" });

    const devis = await Devis
      .findOne({ $or: or })
      .select("numero createdAt")   // اللي تحتاجه فقط
      .sort({ createdAt: -1 })
      .lean();

    if (!devis) {
      return res.status(200).json({ success:false, exists:false, message:"Aucun devis pour cette demande" });
    }

    const pdf = `${ORIGIN}/files/devis/${devis.numero}.pdf`;
    return res.json({ success:true, exists:true, devis:{ _id: devis._id, numero: devis.numero }, pdf });
  } catch (e) {
    console.error("getDevisByDemande:", e);
    return res.status(500).json({ success:false, message:"Erreur serveur" });
  }
};

