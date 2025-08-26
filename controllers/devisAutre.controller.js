// controllers/devisAutre.controller.js
import DevisAutre from "../models/DevisAutre.js";
import Counter from "../models/Counter.js";
import { buildDevisAutrePDF } from "../utils/pdf.devisAutre.js"; // 📄 à créer comme pour traction
import { makeTransport } from "../utils/mailer.js";

const formatDevisNumber = (year, seq) =>
  `DDV${String(year).slice(-2)}${String(seq).padStart(5, "0")}`;

const MAX_FILES = 4;               // ✅ garde-fou back: max 4 fichiers
const MAX_ATTACH_TOTAL = 15 * 1024 * 1024; // 15MB pour l'email

// petites aides
const isBlank = (v) => !v || String(v).trim() === "";
const toStr = (v) => (v == null ? "" : String(v));
const clean = (v) => toStr(v).trim();

export const createDevisAutre = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Utilisateur non authentifié" });
    }

    // 🔹 Champs acceptés, compat et nouveaux
    const {
      // legacy (compat)
      titre,
      description,

      // nouveaux champs
      designation,         // "Désignation / Référence *"
      dimensions,          // "Dimensions principales"
      quantite,            // "Quantité *"
      matiere,             // "Matière *" (ou 'Autre')
      matiereAutre,        // "Autre matière (précisez)"
      exigences,
      remarques,
    } = req.body || {};

    // ✅ validations de base côté serveur
    const dsg = clean(designation || titre); // on tolère ancien champ pour le required
    if (isBlank(dsg)) {
      return res.status(400).json({ success: false, message: "La désignation est requise." });
    }

    const qRaw = clean(quantite);
    const qte = Number(qRaw);
    if (!Number.isFinite(qte) || qte < 1) {
      return res.status(400).json({ success: false, message: "Quantité invalide (>= 1)." });
    }

    // ✅ normalisation matière : si 'Autre' ou vide ⇒ utiliser matiereAutre
    let mat = clean(matiere);
    const matAutre = clean(matiereAutre);
    if (isBlank(mat) || /^autre$/i.test(mat)) {
      if (isBlank(matAutre)) {
        return res.status(400).json({ success: false, message: "La matière est requise." });
      }
      mat = matAutre;
    }

    // ✅ garde-fou fichiers : max 4
    const incomingFiles = Array.isArray(req.files) ? req.files : [];
    if (incomingFiles.length > MAX_FILES) {
      return res.status(400).json({
        success: false,
        message: `Vous pouvez joindre au maximum ${MAX_FILES} fichiers.`,
      });
    }

    // Fichiers (stockés en BDD, pas encore en mail)
    const documents = incomingFiles.map((f) => ({
      filename: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      data: f.buffer,
    }));

    // 🔹 spec enrichi (et compat champs legacy)
    const spec = {
      // Compat legacy: on préfère la désignation comme titre; sinon old titre; sinon fallback
      titre: clean(titre) || dsg || "Article",
      description: clean(description) || clean(req.body?.["description"]) || "",
      designation: dsg,
      dimensions: clean(dimensions),
      quantite: qte,
      matiere: mat,                 // source de vérité BDD
      matiereAutre: matAutre || "", // conservé informativement
    };

    // Générer numéro unique par année
    const year = new Date().getFullYear();
    const counterId = `devis:${year}`;
    const c = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    ).lean();
    const numero = formatDevisNumber(year, c.seq);

    // Enregistrement
    const devis = await DevisAutre.create({
      numero,
      user: req.user.id,
      type: "autre",
      spec,
      exigences: clean(exigences),
      remarques: clean(remarques),
      documents,
    });

    // ✅ Réponse immédiate
    res.status(201).json({ success: true, devisId: devis._id, numero: devis.numero });

    // ----------- PDF + MAIL asynchrones -----------
    setImmediate(async () => {
      const toBuffer = (maybeBinary) => {
        if (!maybeBinary) return null;
        if (Buffer.isBuffer(maybeBinary)) return maybeBinary;
        if (maybeBinary.buffer && Buffer.isBuffer(maybeBinary.buffer)) {
          return Buffer.from(maybeBinary.buffer);
        }
        try {
          return Buffer.from(maybeBinary);
        } catch {
          return null;
        }
      };

      try {
        const full = await DevisAutre.findById(devis._id)
          .populate("user", "nom prenom email numTel adresse accountType company personal")
          .lean();

        // Génération PDF
        const pdfBuffer = await buildDevisAutrePDF(full);

        // Stockage PDF
        await DevisAutre.findByIdAndUpdate(devis._id, {
          $set: { demandePdf: { data: pdfBuffer, contentType: "application/pdf", size: pdfBuffer?.length || undefined } },
        });

        // Pièces jointes de l'email
        const attachments = [
          {
            filename: `devis-autre-${full._id}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ];

        const docs = Array.isArray(full.documents) ? full.documents : [];
        let total = pdfBuffer.length;

        for (const doc of docs) {
          const name = (doc?.filename || "").trim();
          const buf = toBuffer(doc?.data);
          const type = doc?.mimetype || "application/octet-stream";

          if (!name || name.startsWith("~$")) continue;
          if (!buf || buf.length === 0) continue;
          if (total + buf.length > MAX_ATTACH_TOTAL) continue;

          attachments.push({ filename: name, content: buf, contentType: type });
          total += buf.length;
        }

        // Infos client
        const transporter = makeTransport();
        const fullName = [full.user?.prenom, full.user?.nom].filter(Boolean).join(" ") || "Client";
        const clientEmail = full.user?.email || "-";
        const clientTel = full.user?.numTel || "-";
        const clientAdr = full.user?.adresse || "-";
        const clientType = full.user?.accountType || "-";

        const human = (n = 0) => {
          const u = ["B", "KB", "MB", "GB"];
          let i = 0,
            v = n;
          while (v >= 1024 && i < u.length - 1) {
            v /= 1024;
            i++;
          }
          return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
        };

        const docsList =
          attachments
            .slice(1)
            .map((a) => `- ${a.filename} (${human(a.content.length)})`)
            .join("\n") || "(aucun document client)";

        // Bloc spec dans l'email
        const specBlockTxt = `
Détails article
- Référence: ${full.spec?.designation || full.spec?.titre || "-"}
- Dimensions: ${full.spec?.dimensions || "-"}
- Quantité: ${full.spec?.quantite ?? "-"}
- Matière: ${full.spec?.matiere || "-"}
- Description: ${(full.spec?.description || "").trim() || "-"}
`.trim();

        const textBody = `Nouvelle demande de devis – Autre Type

Numéro: ${full.numero}
Date: ${new Date(full.createdAt).toLocaleString()}

Infos client
- Nom: ${fullName}
- Email: ${clientEmail}
- Téléphone: ${clientTel}
- Adresse: ${clientAdr}
- Type de compte: ${clientType}

${specBlockTxt}

Pièces jointes:
- PDF de la demande: devis-autre-${full._id}.pdf (${human(pdfBuffer.length)})
Documents client:
${docsList}
`;

        const htmlBody = `
<h2>Nouvelle demande de devis – Autre Type</h2>
<ul>
  <li><b>Numéro:</b> ${full.numero}</li>
  <li><b>Date:</b> ${new Date(full.createdAt).toLocaleString()}</li>
</ul>

<h3>Infos client</h3>
<ul>
  <li><b>Nom:</b> ${fullName}</li>
  <li><b>Email:</b> ${clientEmail}</li>
  <li><b>Téléphone:</b> ${clientTel}</li>
  <li><b>Adresse:</b> ${clientAdr}</li>
  <li><b>Type de compte:</b> ${clientType}</li>
</ul>

<h3>Détails article</h3>
<ul>
  <li><b>Référence:</b> ${full.spec?.designation || full.spec?.titre || "-"}</li>
  <li><b>Dimensions:</b> ${full.spec?.dimensions || "-"}</li>
  <li><b>Quantité:</b> ${full.spec?.quantite ?? "-"}</li>
  <li><b>Matière:</b> ${full.spec?.matiere || "-"}</li>
  <li><b>Description:</b> ${(full.spec?.description || "").trim() || "-"}</li>
</ul>

<h3>Pièces jointes</h3>
<ul>
  <li>PDF de la demande: <code>devis-autre-${full._id}.pdf</code> (${human(pdfBuffer.length)})</li>
</ul>

<h3>Documents client</h3>
<pre>${docsList}</pre>
`;

        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: process.env.ADMIN_EMAIL,
          replyTo: clientEmail !== "-" ? clientEmail : undefined,
          subject: `${fullName} - ${full.numero}`,
          text: textBody,
          html: htmlBody,
          attachments,
        });
      } catch (err) {
        console.error("Post-send PDF/email failed:", err);
      }
    });
  } catch (e) {
    console.error("createDevisAutre:", e);
    res.status(400).json({ success: false, message: e.message || "Données invalides" });
  }
};
