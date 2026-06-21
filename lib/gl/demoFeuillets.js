'use strict';

/**
 * Allowlist feuillets — Mode Découverte G&L (visiteur sans compte).
 *
 * Garde-fous lore (ABSOLUS) — ne jamais violer dans ce mode :
 * 1. Le Souffle n'est jamais personnifié.
 * 2. Le visage de Sélène n'est jamais montré.
 * 3. Le nom de Krâ (le corbeau) n'apparaît jamais — « le corbeau » uniquement.
 * 4. L'inversion spatiale et la fin ne sont jamais révélées.
 *
 * Avant d'ajouter un code à cette liste : relire le feuillet intégralement
 * (corpus `data/gl/corpus-feuillets-selene.xlsx` ou table `gl_lore_feuillets`)
 * et confirmer qu'il ne touche aucun des 4 interdits.
 */

/** Ordre de traversée plateau 1 (arc d'ouverture). */
const GL_DEMO_FEUILLET_CODES = Object.freeze([
  'ep-I-01', // Premier matin
  'ep-I-02', // Le corbeau (non nommé)
  'ep-I-03', // Le point d'eau tari
  'ep-I-04', // La lumière dans la mer
]);

const GL_DEMO_FEUILLET_CODE_SET = new Set(GL_DEMO_FEUILLET_CODES);

function isDemoFeuilletCode(code) {
  return GL_DEMO_FEUILLET_CODE_SET.has(String(code || '').trim());
}

module.exports = {
  GL_DEMO_FEUILLET_CODES,
  GL_DEMO_FEUILLET_CODE_SET,
  isDemoFeuilletCode,
};
