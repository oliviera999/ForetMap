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

/** Largeur moyenne d'un caractère, en fraction de la taille de police (estimation sans mesure DOM). */
const AVG_CHAR_WIDTH_RATIO = 0.55;

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
 * @param {{ x: number, y: number, text: string, fontSizePx: number, padding?: number,
 *   maxWidthPx?: number }} label
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
export function estimateLabelBox({
  x,
  y,
  text,
  fontSizePx,
  padding = LABEL_COLLISION_PADDING_PX,
  maxWidthPx = Number.POSITIVE_INFINITY,
}) {
  const size = Math.max(toFinite(fontSizePx, 12), 1);
  const chars = String(text ?? '').length;
  const cap = Number(maxWidthPx) > 0 ? Number(maxWidthPx) : Number.POSITIVE_INFINITY;
  const width = Math.min(Math.max(chars * size * AVG_CHAR_WIDTH_RATIO, size), cap);
  const height = size * 1.2;
  const cx = toFinite(x);
  const cy = toFinite(y);
  return {
    left: cx - width / 2 - padding,
    right: cx + width / 2 + padding,
    top: cy - height / 2 - padding,
    bottom: cy + height / 2 + padding,
  };
}

/** Deux boîtes se recouvrent-elles ? (contact strict : se toucher ne gêne pas). */
export function boxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Retient les étiquettes qui ne se recouvrent pas, par ordre de priorité.
 *
 * @param {Array<{ id: string, box: object, priority?: number, weight?: number, pinned?: boolean }>} candidates
 *   `priority` : rang de catégorie (plus petit = plus important) ; `weight` : importance propre
 *   (aire d'une zone, par exemple — plus grand = plus important) ; `pinned` : toujours gardée
 *   (lieu sélectionné), et elle occupe la place avant tout le monde.
 * @returns {Set<string>} identifiants des étiquettes à afficher.
 */
export function resolveLabelCollisions(candidates) {
  const list = (candidates || []).filter((c) => c && c.box);
  const ordered = list
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const ap = a.candidate.pinned ? 1 : 0;
      const bp = b.candidate.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const apr = toFinite(a.candidate.priority, Number.POSITIVE_INFINITY);
      const bpr = toFinite(b.candidate.priority, Number.POSITIVE_INFINITY);
      if (apr !== bpr) return apr - bpr;
      const aw = toFinite(a.candidate.weight, 0);
      const bw = toFinite(b.candidate.weight, 0);
      if (aw !== bw) return bw - aw;
      return a.index - b.index;
    });

  const kept = [];
  const visible = new Set();
  for (const { candidate } of ordered) {
    if (kept.some((box) => boxesOverlap(box, candidate.box))) continue;
    kept.push(candidate.box);
    visible.add(String(candidate.id));
  }
  return visible;
}
