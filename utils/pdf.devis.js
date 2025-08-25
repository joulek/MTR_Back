// utils/pdf.devis.js
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";

/* ---------- helpers format ---------- */
const fmt3 = (n) => Number(n || 0).toFixed(3);
const fmt2 = (n) => Number(n || 0).toFixed(2);

/* ---------- calcul des totaux ---------- */
function computeTotals(devis) {
  const items = devis.items || [];
  const baseByRate = { 0: 0, 7: 0, 13: 0, 19: 0 };
  let mtht = 0, remise = 0, mtnetht = 0;

  for (const it of items) {
    const q = Number(it.quantite || 0);
    const pu = Number(it.puht || 0);
    const rp = Number(it.remisePct || 0);
    const rate = (it.tvaPct === 7 || it.tvaPct === 13 || it.tvaPct === 19) ? it.tvaPct : 0;

    const brut = q * pu;
    const net = brut * (1 - rp / 100);

    mtht += brut;
    remise += brut - net;
    mtnetht += net;
    baseByRate[rate] += net;
  }

  const fodecPct = Number(devis?.totaux?.fodecPct ?? devis?.fodecPct ?? 1);
  const mfodec = mtnetht * (fodecPct / 100);
  const mttva = baseByRate[0] * 0 + baseByRate[7] * 0.07 + baseByRate[13] * 0.13 + baseByRate[19] * 0.19;
  const timbre = Number(devis?.totaux?.timbre ?? devis?.timbre ?? 0);
  const mttc = mtnetht + mfodec + mttva + timbre;

  return { baseByRate, fodecPct, mtht, remise, mtnetht, mfodec, mttva, timbre, mttc };
}

/* ---------- génération PDF ---------- */
export async function buildDevisPDF(devis, outDir = "storage/devis") {
  fs.mkdirSync(outDir, { recursive: true });
  const filename = `${devis.numero}.pdf`;
  const fullpath = path.join(outDir, filename);

  const doc = new PDFDocument({ size: "A4", margin: 30 });
  doc.pipe(fs.createWriteStream(fullpath));

  const W = doc.page.width;
  const M = doc.page.margins.left;      // 30
  const innerW = W - 2 * M;             // largeur utile
  const tableW = innerW, tableX = M;    // tableau pleine largeur

  const FONT = { tiny: 8, small: 9, normal: 10, section: 13, title: 16, big: 24 };

  /* ===== ENTÊTE ===== */
  const yTopTitle = 10;
  const xLogo = M;
  const yLogo = 2;

  // ⬇️ Augmenter un peu la taille du logo (avant: 120 x 62)
  const logoW = 155;      // largeur cible
  const logoHMax = 80;    // hauteur max

  const logoPath = path.resolve("assets/logo.png");
  let logoH = 0;

  if (fs.existsSync(logoPath)) {
    // même position (xLogo, yLogo), juste plus grand
    doc.image(logoPath, xLogo, yLogo, { fit: [logoW, logoHMax] });
    logoH = logoHMax;
  }



  const titleX = M + logoW + 18;
  const titleW = innerW - logoW - 18;

  doc.font("Helvetica-Bold").fontSize(FONT.big)
    .text("FABRICATION TOUT ARTICLE", titleX, yTopTitle, { width: titleW, align: "left" })
    .text("EN FIL METALLIQUE", titleX, yTopTitle + 24, { width: titleW, align: "left" });

  doc.font("Helvetica").fontSize(11)
    .text("Conception et Fabrication des Ressorts", titleX, yTopTitle + 50, { width: titleW })
    .text("Dressage fils, Cambrage, Cintrage fils et tubes", titleX, yTopTitle + 65, { width: titleW });

  /* ===== 2 CADRES ===== */
  const infoYBase = 118;
  const infoY = Math.max(infoYBase, yLogo + logoH + 12);   // pas de chevauchement avec le logo
  const infoH = 76;
  const BOX_GAP = 16;
  const leftW = Math.round(innerW * 0.45);
  const rightW = innerW - leftW - BOX_GAP;

  const leftBox = { x: tableX, y: infoY, w: leftW, h: infoH };
  const rightBox = { x: tableX + leftW + BOX_GAP, y: infoY, w: rightW, h: infoH };

  // gauche
  doc.rect(leftBox.x, leftBox.y, leftBox.w, leftBox.h).stroke();
  doc.rect(leftBox.x, leftBox.y, leftBox.w, 20).stroke();
  doc.font("Helvetica-Bold").fontSize(FONT.section)
    .text("Devis - Offre de Prix", leftBox.x, leftBox.y + 3, { width: leftBox.w, align: "center" });

  const lh = 14, lPad = 8;
  let ly = leftBox.y + 24;
  doc.font("Helvetica-Bold").fontSize(FONT.small).text("NUMERO : ", leftBox.x + lPad, ly);
  doc.font("Helvetica").text(String(devis.numero || ""), leftBox.x + lPad + 62, ly); ly += lh;
  doc.font("Helvetica-Bold").text("Du : ", leftBox.x + lPad, ly);
  doc.font("Helvetica").text(dayjs(devis.createdAt).format("DD/MM/YYYY"), leftBox.x + lPad + 25, ly); ly += lh;
  doc.font("Helvetica-Bold").text("PAGE", leftBox.x + lPad, ly);
  doc.font("Helvetica").text("1 / 1", leftBox.x + lPad + 35, ly);

  // droite
  doc.rect(rightBox.x, rightBox.y, rightBox.w, rightBox.h).stroke();
  doc.rect(rightBox.x, rightBox.y, rightBox.w, 20).stroke();
  doc.font("Helvetica-Bold").fontSize(FONT.section)
    .text("Client", rightBox.x, rightBox.y + 3, { width: rightBox.w, align: "center" });

  const c = devis.client || {};
  let cy = rightBox.y + 24;
  const cPad = 8;
  const row = (label, value, noWrap = false) => {
    doc.font("Helvetica-Bold").fontSize(FONT.small).text(label, rightBox.x + cPad, cy);
    const lw = doc.widthOfString(label);
    doc.font("Helvetica").text(String(value || ""), rightBox.x + cPad + lw + 3, cy, {
      width: rightBox.w - 2 * cPad - lw - 3,
      lineBreak: !noWrap,
    });
    cy += lh;
  };
  const fullName = [c.nom, c.prenom].filter(Boolean).join(" ") || c.name || c.code || "";
  row("Code : ", String(fullName).toUpperCase(), true);
  row("Adresse : ", c.adresse || "");
  row("Code TVA : ", c.codeTVA || "");
  row("Tél. : ", c.tel || "");

  /* ===== TABLEAU ARTICLES (colonnes uniquement) ===== */
  let y = infoY + infoH + 18;

  const baseW = [65, 190, 50, 35, 55, 45, 40, 35]; // somme=515
  const labels = ["Référence", "Libellé", "Quantité", "Unité", "PUHT", "Remise", "PT HT", "TVA"];
  const aligns = ["left", "left", "right", "center", "right", "right", "right", "right"];
  const scale = innerW / 515;

  const widths = [];
  let acc = 0;
  for (let i = 0; i < baseW.length - 1; i++) {
    const w = Math.round(baseW[i] * scale);
    widths.push(w);
    acc += w;
  }
  widths.push(innerW - acc);
  const cols = labels.map((label, i) => ({ label, w: widths[i], align: aligns[i] }));

  // entête
  const headerH = 22;
  const headerTopY = y;
  doc.rect(tableX, y, tableW, headerH).stroke();
  let x = tableX;
  doc.font("Helvetica-Bold").fontSize(FONT.normal);
  cols.forEach(cdef => {
    doc.text(cdef.label, x + 4, y + 5, { width: cdef.w - 8, align: cdef.align, lineBreak: false });
    x += cdef.w;
    doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
  });
  y += headerH;

  // lignes (pas d’horizontales)
  const rowH = 22;
  doc.font("Helvetica").fontSize(FONT.normal);
  (devis.items || []).forEach((it) => {
    const q = Number(it.quantite || 0);
    const pu = Number(it.puht || 0);
    const rp = Number(it.remisePct || 0);
    const lineNet = q * pu * (1 - rp / 100);
    const values = [
      it.reference || "",
      it.designation || "",
      fmt2(q),
      (it.unite || "").toString(),
      fmt3(pu),
      fmt2(rp),
      fmt3(lineNet),
      fmt2(it.tvaPct ?? 0),
    ];
    let cx = tableX;
    for (let i = 0; i < cols.length; i++) {
      const cdef = cols[i];
      doc.text(values[i], cx + 4, y + 5, { width: cdef.w - 8, align: cdef.align, lineBreak: false });
      cx += cdef.w;
    }
    y += rowH;
  });

  /* ===== RÉSERVE POUR LE BOX DES MONTANTS ===== */
  const totals = computeTotals(devis);
  const cellH = 16;
  const recapLines = [
    ["MONTANT HT", fmt3(totals.mtht)],
    ["MT REMISE", fmt3(totals.remise)],
    ["MT NET HT", fmt3(totals.mtnetht)],
    ["M.FODEC", fmt3(totals.mfodec)],
    ["MTVA", fmt3(totals.mttva)],
    ...(totals.timbre ? [["Timbre Fiscal", fmt3(totals.timbre)]] : []),
    ["MTTC", fmt3(totals.mttc)],
  ];

  // Étire les colonnes vers le bas, en réservant la place du box + pied
  const FOOT_RESERVED = 120;
  const recapBlockH = recapLines.length * cellH + 8;
  const bodyTop = headerTopY + headerH;
  const minBody = y;
  const bodyBottomTarget = doc.page.height - FOOT_RESERVED - recapBlockH - 18;
  const bodyBottom = Math.max(minBody, bodyTop + 1, bodyBottomTarget);

  doc.rect(tableX, bodyTop, tableW, Math.max(0, bodyBottom - bodyTop)).stroke();
  let vx = tableX;
  cols.forEach((cdef) => {
    vx += cdef.w;
    doc.moveTo(vx, bodyTop).lineTo(vx, bodyBottom).stroke();
  });

  y = bodyBottom + 8;

  /* ===== BOX DES MONTANTS (élargi, sans TAUX/BASE/MT) ===== */
  const recapW = 360;                      // largeur du box
  const recapX = M + innerW - recapW;      // aligné à droite
  const recapValW = 110;                   // colonne montants
  const recapLabelW = recapW - recapValW;

  const drawRecapLine = (label, val, bold = false) => {
    doc.rect(recapX, y, recapW, cellH).stroke();
    doc.font(bold ? "Helvetica-Bold" : "Helvetica")
      .text(label, recapX + 6, y + 3, { width: recapLabelW - 6, align: "left", lineBreak: false });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica")
      .text(val, recapX + recapLabelW, y + 3, { width: recapValW - 6, align: "right", lineBreak: false });
    y += cellH;
  };
  recapLines.forEach(([lbl, val], i) => drawRecapLine(lbl, val, i === recapLines.length - 1)); // MTTC en gras

  /* ===== PIED DE PAGE + QR ===== */
  const footY = doc.page.height - 90;
  doc.font("Helvetica").fontSize(FONT.small)
    .text("Adresse :  ZI  EL  ONS Route de Tunis KM 10 Sakiet Ezzit BP 237 Sfax - Tunisie", M, footY)
    .text("Code TVA : 1327477/EAM 000", M, footY + 14)
    .text("E-mail : mtrsfax@gmail.com", M, footY + 28)
    .text("GSM : 98 333 883", M, footY + 42);
  doc.text("TEL : (216)74 850 999 / 74 863 888", M + 300, footY + 14)
    .text("FAX : (216)74 864 863", M + 300, footY + 28);

  try {
    const qrPath = path.resolve("assets/Code_QR_fb.png");
    const qrSize = 90;
    if (fs.existsSync(qrPath)) {
      doc.image(qrPath, W - M - qrSize, footY - 6, { width: qrSize, height: qrSize, fit: [qrSize, qrSize] });
    }
  } catch { }

  doc.end();
  return { filename, fullpath };
}
