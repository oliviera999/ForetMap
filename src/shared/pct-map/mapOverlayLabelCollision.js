/**
 * Priorité et collisions des étiquettes de carte — module pur (lot 5,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` N5).
 *
 * Problème : les étiquettes (noms de zones et de repères) sont posées indépendamment les unes
 * des autres. Au dézoom, elles se chevauchent et deviennent illisibles — précisément le cas du
 * plan de Lyautey, dense et fortement superposé.
 *
 * Méthode : le placement « glouton par priorité » des moteurs de rendu cartographique. Les
 * candidats sont triés (priorité de catégorie, puis importance propre, puis ordre stable) ;
 * chaque étiquette est retenue si sa boîte ne recouvre aucune boîte déjà retenue. Pas de
 * déplacement, pas de recuit : on garde la plus importante et l'on masque l'autre, ce qui est
 * le comportement attendu d'une carte que l'on lit debout.
 *
 * Coordonnées et tailles en **pixels écran** : c'est la seule échelle où « ça se chevauche »
 * a un sens. Le produit convertit avant d'appeler.
 */

/** Marge ajoutée autour de chaque boîte (px écran) : deux étiquettes qui se frôlent gênent. */
export const LABEL_COLLISION_PADDING_PX = 2;

/**
 * Largeur moyenne d'un caractère, en fraction de la taille de police (estimation sans mesure
 * DOM). Source unique : l'ajustement des noms du calque d'édition (`fitOverlayLabelToWidth`)
 * la reprend, sans quoi les deux calques ne tronquaient pas au même endroit.
 */
export const AVG_CHAR_WIDTH_RATIO = 0.55;

/** Hauteur de ligne des noms (CSS `line-height: 1.2`), en fraction de la taille de police. */
export const LABEL_LINE_HEIGHT_RATIO = 1.2;

/**
 * Largeur des glyphes par classe, en fraction de la taille de police — relevée au canvas sur
 * la police des étiquettes (DM Sans, graisse 700) le 21/11/2026. Une moyenne unique
 * (`AVG_CHAR_WIDTH_RATIO`) suffit pour décider d'un masquage, pas pour savoir si un **mot**
 * tient sur une ligne : « Aromatiques » mesure 142 px à 22,4 px, la moyenne en annonce 136, et
 * le mot se coupait au milieu (audit UI/UX du 19/11/2026, U5).
 */
const GLYPH_WIDTH_CLASSES = Object.freeze([
  { re: /[iljIîïìíÎÏ'’.,:;!|]/u, ratio: 0.27 },
  { re: /[frt1()[\]³²¹]/u, ratio: 0.43 },
  { re: /[sz]/u, ratio: 0.53 },
  { re: /[m]/u, ratio: 0.94 },
  { re: /[w]/u, ratio: 0.82 },
  { re: /[MW—]/u, ratio: 1.02 },
  { re: /[A-ZÀ-ÖØ-Þ]/u, ratio: 0.72 },
  { re: /[0-9]/u, ratio: 0.65 },
  { re: /\s/u, ratio: 0.23 },
  { re: /\p{Extended_Pictographic}/u, ratio: 1.2 },
]);

/** Classe par défaut (minuscules courantes, lettres accentuées, signes). */
const GLYPH_DEFAULT_RATIO = 0.62;

/** Marge de sûreté sur une largeur de mot estimée : mieux vaut un nom un peu large qu'un mot coupé. */
export const TEXT_WIDTH_SAFETY_RATIO = 1.04;

/**
 * Largeur estimée d'un texte (px écran), glyphe par glyphe, marge de sûreté comprise. Sert à
 * savoir si un mot tient sur une ligne ; les boîtes de collision gardent leur estimation
 * moyenne (`estimateLabelBox`).
 * @param {string} text
 * @param {number} fontSizePx
 * @returns {number}
 */
export function estimateTextWidthPx(text, fontSizePx) {
  const size = Math.max(toFinite(fontSizePx, 12), 1);
  let em = 0;
  for (const ch of String(text ?? '')) {
    if (/[️‍]/u.test(ch)) continue;
    const cls = GLYPH_WIDTH_CLASSES.find((c) => c.re.test(ch));
    em += cls ? cls.ratio : GLYPH_DEFAULT_RATIO;
  }
  return em * size * TEXT_WIDTH_SAFETY_RATIO;
}

/**
 * Largeur minimale pour poser `text` sur au plus `maxLines` lignes **sans couper de mot**
 * (retour à la ligne aux espaces seulement, comme le navigateur sans `overflow-wrap`). Le mot
 * le plus long est un plancher : en dessous, aucune largeur ne suffit.
 * @param {string} text
 * @param {number} fontSizePx
 * @param {number} [maxLines=1]
 * @returns {number} px écran (0 pour un texte vide).
 */
export function unbrokenTextWidthPx(text, fontSizePx, maxLines = 1) {
  const words = String(text ?? '')
    .split(/\s+/u)
    .filter(Boolean);
  if (!words.length) return 0;
  const widths = words.map((w) => estimateTextWidthPx(w, fontSizePx));
  const space = estimateTextWidthPx(' ', fontSizePx);
  const longest = Math.max(...widths);
  const total = widths.reduce((s, w) => s + w, 0) + space * (words.length - 1);
  const lines = Math.max(Math.round(toFinite(maxLines, 1)), 1);
  if (lines === 1 || words.length === 1) return lines === 1 ? total : longest;
  /** Lignes nécessaires à la largeur `limit` (remplissage glouton, celui du navigateur). */
  const linesAt = (limit) => {
    let count = 1;
    let line = widths[0];
    for (let i = 1; i < widths.length; i += 1) {
      if (line + space + widths[i] <= limit) line += space + widths[i];
      else {
        count += 1;
        line = widths[i];
      }
    }
    return count;
  };
  let lo = longest;
  let hi = total;
  if (linesAt(lo) <= lines) return lo;
  // Recherche dichotomique au demi-pixel : la plus petite largeur qui tient en `lines` lignes.
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (linesAt(mid) <= lines) hi = mid;
    else lo = mid;
  }
  return hi;
}

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Boîte d'une étiquette centrée sur un point, estimée sans mesurer le DOM (largeur ≈ nombre
 * de caractères × 0,55 × taille de police). Suffisant pour décider d'un masquage, et sans le
 * coût d'un `getBBox` par étiquette à chaque commit de zoom.
 *
 * `maxWidthPx` borne la largeur estimée : quand le rendu tronque l'étiquette (CSS
 * `max-width` + `text-overflow`), la boîte de collision doit être tronquée de la même façon,
 * sinon une étiquette courte à l'écran continue d'en masquer d'autres.
 *
 * `maxLines` suit le rendu quand celui-ci **replie** le nom au lieu de le tronquer (noms de
 * zones sur deux lignes, `docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N11) : la boîte doit
 * alors réserver la hauteur des lignes réellement occupées, sans quoi une étiquette repliée
 * recouvrirait sa voisine du dessous.
 *
 * `anchorY: 'top'` pose le **haut** du texte sur `y` au lieu de son centre : c'est le cas d'un
 * nom de zone rendu sous son emoji, dont la hauteur (une ou deux lignes) ne doit pas déplacer
 * le haut. `extraWidthPx` ajoute un habillage horizontal (pilule du lieu sélectionné).
 *
 * `naturalWidthPx` remplace l'estimation moyenne de la largeur sur une ligne quand le produit
 * en a une meilleure (`estimateTextWidthPx`, noms de zone coupés aux espaces).
 *
 * @param {{ x: number, y: number, text: string, fontSizePx: number, padding?: number,
 *   maxWidthPx?: number, maxLines?: number, anchorY?: 'center'|'top',
 *   extraWidthPx?: number, naturalWidthPx?: number }} label
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
export function estimateLabelBox({
  x,
  y,
  text,
  fontSizePx,
  padding = LABEL_COLLISION_PADDING_PX,
  maxWidthPx = Number.POSITIVE_INFINITY,
  maxLines = 1,
  anchorY = 'center',
  extraWidthPx = 0,
  naturalWidthPx = null,
}) {
  const size = Math.max(toFinite(fontSizePx, 12), 1);
  const chars = String(text ?? '').length;
  const cap = Number(maxWidthPx) > 0 ? Number(maxWidthPx) : Number.POSITIVE_INFINITY;
  const estimated =
    Number(naturalWidthPx) > 0 ? Number(naturalWidthPx) : chars * size * AVG_CHAR_WIDTH_RATIO;
  const natural = Math.max(estimated, size);
  const width = Math.min(natural, cap) + Math.max(toFinite(extraWidthPx), 0);
  const lines = Math.min(
    Math.max(Math.round(toFinite(maxLines, 1)), 1),
    Math.max(Math.ceil(natural / (cap > 0 && Number.isFinite(cap) ? cap : natural)), 1),
  );
  const height = size * LABEL_LINE_HEIGHT_RATIO * lines;
  const cx = toFinite(x);
  const top = anchorY === 'top' ? toFinite(y) : toFinite(y) - height / 2;
  return {
    left: cx - width / 2 - padding,
    right: cx + width / 2 + padding,
    top: top - padding,
    bottom: top + height + padding,
  };
}

/**
 * Boîte carrée d'un glyphe centré sur un point (emoji d'une zone, `line-height: 1`).
 * @param {{ x: number, y: number, sizePx: number, padding?: number }} glyph
 */
export function estimateGlyphBox({ x, y, sizePx, padding = LABEL_COLLISION_PADDING_PX }) {
  const half = Math.max(toFinite(sizePx, 16), 1) / 2;
  const cx = toFinite(x);
  const cy = toFinite(y);
  return {
    left: cx - half - padding,
    right: cx + half + padding,
    top: cy - half - padding,
    bottom: cy + half + padding,
  };
}

/** Deux boîtes se recouvrent-elles ? (contact strict : se toucher ne gêne pas). */
export function boxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Ordre de placement : épinglées, puis famille (`tier`), rang de catégorie, importance propre,
 * ordre d'entrée (tri stable).
 * @template {{ tier?: number, priority?: number, weight?: number, pinned?: boolean }} T
 * @param {Array<T>} candidates
 * @returns {Array<T>} nouvelle liste triée.
 */
export function orderLabelCandidates(candidates) {
  return (candidates || [])
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const ap = a.candidate.pinned ? 1 : 0;
      const bp = b.candidate.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = toFinite(a.candidate.tier, 0);
      const bt = toFinite(b.candidate.tier, 0);
      if (at !== bt) return at - bt;
      const apr = toFinite(a.candidate.priority, Number.POSITIVE_INFINITY);
      const bpr = toFinite(b.candidate.priority, Number.POSITIVE_INFINITY);
      if (apr !== bpr) return apr - bpr;
      const aw = toFinite(a.candidate.weight, 0);
      const bw = toFinite(b.candidate.weight, 0);
      if (aw !== bw) return bw - aw;
      return a.index - b.index;
    })
    .map(({ candidate }) => candidate);
}

/**
 * Retient les étiquettes qui ne se recouvrent pas, par ordre de priorité.
 *
 * @param {Array<{ id: string, box: object, tier?: number, priority?: number, weight?: number,
 *   pinned?: boolean }>} candidates
 *   `tier` : famille d'étiquettes (plus petit = placé d'abord ; les emojis de zone passent
 *   avant les noms) ; `priority` : rang de catégorie (plus petit = plus important) ;
 *   `weight` : importance propre (aire d'une zone, par exemple — plus grand = plus important) ;
 *   `pinned` : toujours gardée (lieu sélectionné), et elle occupe la place avant tout le monde.
 * @returns {Set<string>} identifiants des étiquettes à afficher.
 */
export function resolveLabelCollisions(candidates) {
  const kept = [];
  const visible = new Set();
  for (const candidate of orderLabelCandidates((candidates || []).filter((c) => c && c.box))) {
    if (kept.some((box) => boxesOverlap(box, candidate.box))) continue;
    kept.push(candidate.box);
    visible.add(String(candidate.id));
  }
  return visible;
}
