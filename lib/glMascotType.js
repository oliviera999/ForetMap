'use strict';

/**
 * Peuple (`gnome` | `unicorn`) d'une mascotte du catalogue G&L — fonction PURE.
 *
 * Le catalogue G&L ne contient plus que les packs publiés du studio ForêtMap
 * (`visit_mascot_packs.is_published = 1`), qui n'ont pas de peuple natif : la silhouette de
 * secours n'est pas fiable (les licornes du bestiaire sont en `backpackFox`). Ordre de résolution :
 *
 * 1. `pack.type` explicite (champ facultatif du pack, fixé au studio) : il prime toujours ;
 * 2. déduction depuis le libellé : `/gnome/i` → `gnome`, `/licorne|unicorn/i` → `unicorn` ;
 * 3. sinon `null` (Olu, Kraa…) : mascotte assignable à la main par le MJ, mais jamais choisie
 *    par défaut ni par la composition automatique.
 *
 * La migration `343_gl_mascots_packs_publies.sql` applique la même déduction en SQL
 * (`LIKE '%gnome%'` / `'%licorne%'`) : garder les deux alignées.
 */

const GL_MASCOT_TYPES = Object.freeze(['gnome', 'unicorn']);

/** Valeur de `type` explicite normalisée, ou `null` si absente / invalide. */
function normalizeGlMascotType(value) {
  const type = String(value == null ? '' : value)
    .trim()
    .toLowerCase();
  return GL_MASCOT_TYPES.includes(type) ? type : null;
}

/** Peuple déduit d'un libellé, ou `null`. Le gnome est testé en premier. */
function inferGlMascotTypeFromLabel(label) {
  const text = String(label == null ? '' : label);
  if (/gnome/i.test(text)) return 'gnome';
  if (/licorne|unicorn/i.test(text)) return 'unicorn';
  return null;
}

/**
 * @param {{ type?: unknown, labels?: Array<unknown> }} input
 *   `type` : valeur explicite du pack ; `labels` : libellés candidats, par priorité.
 * @returns {'gnome'|'unicorn'|null}
 */
function resolveGlMascotType({ type, labels = [] } = {}) {
  const explicit = normalizeGlMascotType(type);
  if (explicit) return explicit;
  for (const label of Array.isArray(labels) ? labels : [labels]) {
    const inferred = inferGlMascotTypeFromLabel(label);
    if (inferred) return inferred;
  }
  return null;
}

module.exports = {
  GL_MASCOT_TYPES,
  normalizeGlMascotType,
  inferGlMascotTypeFromLabel,
  resolveGlMascotType,
};
