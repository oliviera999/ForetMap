/**
 * Export image (PNG) d'une fresque : cartes en vignettes, flèches, post-it, titre et, en bas,
 * la bande de crédit OBLIGATOIRE (licence CC BY-NC-ND : le crédit figure sur toute image
 * exportée). `buildExportScene` est pur (testable) ; `renderFresquePng` dessine sur un canvas.
 * Inspiré de `exportPng` du réseau trophique (`src/components/pedago/FoodWebGraph.jsx`).
 */

import {
  ARROW_COLORS,
  CARD_H_PCT,
  CARD_W_PCT,
  NOTE_H_PCT,
  NOTE_W_PCT,
  TABLE_ASPECT,
} from './fresqueCore.js';
import { arrowOffsets, arrowSegment } from './fresqueGeometry.js';

export const EXPORT_W = 1600;
export const EXPORT_H = Math.round(EXPORT_W / TABLE_ASPECT);
export const EXPORT_TITLE_H = 64;
export const EXPORT_CREDIT_H = 72;

/** Couleurs par catégorie (mêmes teintes que `fresque.css`). */
export const EXPORT_TONE_COLORS = Object.freeze({
  default: '#334155',
  trouvee: '#15803d',
  inversee: '#7c3aed',
  raccourci: '#0369a1',
  piege: '#b91c1c',
  a_discuter: '#d97706',
  manquante: '#9ca3af',
});

export const EXPORT_NOTE_COLORS = Object.freeze({
  yellow: '#fde68a',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  pink: '#fbcfe8',
  orange: '#fed7aa',
  hint: '#e9d5ff',
});

const SVG_TO_PX = EXPORT_W / (100 * TABLE_ASPECT);

/**
 * Scène dessinable (unités px) : la table occupe `EXPORT_W × EXPORT_H` sous une bande de titre,
 * la bande de crédit ferme l'image.
 */
export function buildExportScene(model, state, { publicBase = '', evaluation = null } = {}) {
  const top = EXPORT_TITLE_H;
  const px = (xPct) => (xPct / 100) * EXPORT_W;
  const py = (yPct) => top + (yPct / 100) * EXPORT_H;
  const cards = [];
  for (const [id, pos] of Object.entries(state.cards || {})) {
    const card = model.cardsById[id];
    if (!card) continue;
    cards.push({
      id,
      x: px(pos.x),
      y: py(pos.y),
      w: px(CARD_W_PCT),
      h: (CARD_H_PCT / 100) * EXPORT_H,
      src: `${publicBase}${pos.flipped ? card.versoSmall : card.rectoSmall}`,
      alt: card.title,
    });
  }
  const categoryById = {};
  if (evaluation?.links) for (const l of evaluation.links) categoryById[l.id] = l.category;
  const links = state.links || [];
  const offsets = arrowOffsets(links);
  const arrowColor = ARROW_COLORS.find((c) => c.id === state.creative?.arrowColor)?.hex || null;
  const arrows = [];
  for (const link of links) {
    const seg = arrowSegment(state.cards[link.from], state.cards[link.to], {
      offset: offsets[link.id] || 0,
    });
    if (!seg) continue;
    const category = categoryById[link.id] || null;
    arrows.push({
      id: link.id,
      x1: seg.x1 * SVG_TO_PX,
      y1: top + seg.y1 * SVG_TO_PX,
      x2: seg.x2 * SVG_TO_PX,
      y2: top + seg.y2 * SVG_TO_PX,
      color: category
        ? EXPORT_TONE_COLORS[category] || EXPORT_TONE_COLORS.default
        : arrowColor || EXPORT_TONE_COLORS.default,
      dashed: link.revealed === true,
      category,
    });
  }
  const notes = (state.notes || [])
    .filter((n) => !n.dismissed)
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      x: px(n.x),
      y: py(n.y),
      w: px(NOTE_W_PCT),
      h: (NOTE_H_PCT / 100) * EXPORT_H,
      color: EXPORT_NOTE_COLORS[n.color] || EXPORT_NOTE_COLORS.yellow,
      text: String(n.text || ''),
    }));
  const bands = (model.guideBands || []).map((band, index, all) => ({
    id: band.id,
    label: band.label,
    x: (index * EXPORT_W) / all.length,
    y: top,
    w: EXPORT_W / all.length,
    h: EXPORT_H,
  }));
  return {
    width: EXPORT_W,
    height: top + EXPORT_H + EXPORT_CREDIT_H,
    tableTop: top,
    tableHeight: EXPORT_H,
    creditBandY: top + EXPORT_H,
    creditBandHeight: EXPORT_CREDIT_H,
    title: String(state.creative?.title || '').trim() || model.deck.title,
    deckTitle: model.deck.title,
    creditLine: model.deck.attribution?.creditLine || '',
    licenceUrl: model.deck.attribution?.licence?.url || '',
    showBands: state.level === 'eclaireur' || state.showBands === true,
    bands,
    cards,
    arrows,
    notes,
  };
}

function defaultLoadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawArrow(ctx, a) {
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  if (a.dashed) ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(a.x1, a.y1);
  ctx.lineTo(a.x2, a.y2);
  ctx.stroke();
  ctx.setLineDash([]);
  const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
  const size = 18;
  ctx.beginPath();
  ctx.moveTo(a.x2, a.y2);
  ctx.lineTo(a.x2 - size * Math.cos(angle - 0.45), a.y2 - size * Math.sin(angle - 0.45));
  ctx.lineTo(a.x2 - size * Math.cos(angle + 0.45), a.y2 - size * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Dessine la scène sur un canvas et rend un Blob PNG. `loadImage` injectable (tests).
 */
export async function renderFresquePng(scene, { loadImage = defaultLoadImage, scale = 1 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.width * scale);
  canvas.height = Math.round(scene.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(0, scene.tableTop, scene.width, scene.tableHeight);
  if (scene.showBands) {
    const tints = [
      'rgba(251,191,36,.14)',
      'rgba(248,113,113,.12)',
      'rgba(96,165,250,.12)',
      'rgba(52,211,153,.12)',
      'rgba(167,139,250,.12)',
    ];
    scene.bands.forEach((band, i) => {
      ctx.fillStyle = tints[i % tints.length];
      ctx.fillRect(band.x, band.y, band.w, band.h);
      ctx.fillStyle = '#6b6358';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(band.label.toUpperCase(), band.x + band.w / 2, band.y + band.h - 14);
    });
  }

  ctx.fillStyle = '#2a2620';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(scene.title, 24, scene.tableTop / 2);

  for (const a of scene.arrows) drawArrow(ctx, a);

  const images = await Promise.all(scene.cards.map((c) => loadImage(c.src)));
  scene.cards.forEach((c, i) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.restore();
    const img = images[i];
    if (img) {
      // `contain` : l'image n'est jamais recadrée (licence).
      const ratio = Math.min(c.w / img.width, c.h / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, c.x + (c.w - w) / 2, c.y + (c.h - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#2a2620';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.alt, c.x + c.w / 2, c.y + c.h / 2);
    }
  });

  for (const n of scene.notes) {
    ctx.fillStyle = n.color;
    ctx.fillRect(n.x, n.y, n.w, n.h);
    ctx.fillStyle = '#1f2937';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = wrapText(ctx, n.kind === 'hint' ? `Indice : ${n.text}` : n.text, n.w - 12);
    lines
      .slice(0, Math.floor((n.h - 10) / 17))
      .forEach((line, i) => ctx.fillText(line, n.x + 6, n.y + 6 + i * 17));
  }

  // Bande de crédit obligatoire.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, scene.creditBandY, scene.width, scene.creditBandHeight);
  ctx.fillStyle = '#2a2620';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const credit = scene.licenceUrl ? `${scene.creditLine} — ${scene.licenceUrl}` : scene.creditLine;
  ctx.fillText(credit, 24, scene.creditBandY + scene.creditBandHeight / 2, scene.width - 48);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export impossible'))),
      'image/png',
    );
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function exportFilename(model, state) {
  const base = String(state.creative?.title || model.deck.shortTitle || 'fresque')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'fresque'}.png`;
}
