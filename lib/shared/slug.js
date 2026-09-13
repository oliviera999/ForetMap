'use strict';

/**
 * Normalisation d'identifiants textuels — deux opérations distinctes que sept copies locales
 * de `normalizeSlug` confondaient sous un même nom (audit du 13/09/2026, §3.1) :
 *
 * - `lowerTrim` : minuscules + rognage, **sans** toucher aux caractères. C'est la forme
 *   attendue des slugs déjà canoniques (chapitres, biomes, catégories G&L) que l'on compare.
 * - `slugify` : fabrique un slug à partir d'un libellé libre — tout ce qui n'est pas
 *   `[a-z0-9_-]` devient `-`, tirets de bord rognés ; `null` si rien ne subsiste.
 *   Option `allowDots` pour les identifiants de tutoriels (`intro.v2`).
 */

function lowerTrim(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} value
 * @param {{ allowDots?: boolean }} [options]
 * @returns {string|null}
 */
function slugify(value, options = {}) {
  const pattern = options.allowDots ? /[^a-z0-9._-]+/g : /[^a-z0-9_-]+/g;
  const s = lowerTrim(value)
    .replace(pattern, '-')
    .replace(/^-+|-+$/g, '');
  return s || null;
}

module.exports = { lowerTrim, slugify };
