import Article from "../models/Article.js";
// controllers/article.controller.js
import mongoose from "mongoose";
const VAT_RATE = 0.20; // 20%

// GET /articles
export const getArticles = async (req, res) => {
  try {
    const articles = await Article.find().sort({ reference: 1 }).lean();

    // Ajouter le prixTTC avant de renvoyer
    const data = articles.map(a => ({
      ...a,
      prixTTC: Number((a.prixHT * (1 + VAT_RATE)).toFixed(2))
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error("getArticles error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

// GET /articles/:id
export const getArticleById = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).lean();
    if (!article) {
      return res.status(404).json({ success: false, message: "Article introuvable" });
    }

    article.prixTTC = Number((article.prixHT * (1 + VAT_RATE)).toFixed(2));

    res.json({ success: true, data: article });
  } catch (err) {
    console.error("getArticleById error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

// POST /articles
export const createArticle = async (req, res) => {
  try {
    const { reference, designation, prixHT } = req.body;

    const article = new Article({
      reference,
      designation,
      prixHT
    });

    await article.save();

    res.status(201).json({ success: true, data: article });
  } catch (err) {
    console.error("createArticle error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

// PUT /articles/:id
export const updateArticle = async (req, res) => {
  try {
    const { reference, designation, prixHT } = req.body;

    const article = await Article.findByIdAndUpdate(
      req.params.id,
      { reference, designation, prixHT },
      { new: true }
    );

    if (!article) {
      return res.status(404).json({ success: false, message: "Article introuvable" });
    }

    res.json({ success: true, data: article });
  } catch (err) {
    console.error("updateArticle error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};

// DELETE /articles/:id
export const deleteArticle = async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, message: "Article introuvable" });
    }

    res.json({ success: true, message: "Article supprimé avec succès" });
  } catch (err) {
    console.error("deleteArticle error:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};
// ...imports

// controllers/article.controller.js

export const getArticleByDemande = async (req, res) => {
  try {
    const numeroRaw = (req.query.numero || "").toString().trim();
    const numero = numeroRaw.toUpperCase(); // ex: DDV2500148

    if (!numero) {
      return res.status(400).json({ success: false, message: "Numéro manquant" });
    }

    const article = await Article.findOne({ numeroDevis: numero }).sort({ updatedAt: -1 });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article introuvable pour ce numéro de devis",
      });
    }

    res.json({ success: true, item: article });
  } catch (e) {
    console.error("getArticleByDemande error:", e);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};
