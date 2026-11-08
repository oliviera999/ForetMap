'use strict';

/**
 * Niveaux de questions admis pour le public de Gnomes & Licornes (élèves de 6ᵉ, cycle 3).
 *
 * Noyau unique, sans dépendance : lu par le moteur (`lib/glMarkerQuestionPool.js` pour le
 * tirage des cases en mode « tenir », `lib/glChasse.js` pour la question de secours d'une
 * fouille) et par le contrôle `gl_case_levels_not_6e` de `lib/mcp/audits/checks.js`. Le
 * moteur ne doit jamais dépendre de `lib/mcp/`, d'où ce fichier.
 *
 * Alignement avec le catalogue ForetMap 6ᵉ : niveau de quiz `college` (palier d'entrée cycle
 * 3, cf. `lib/pedagoScales.js`) et profondeur de glossaire `base`. Règle « Tenir à deux »
 * § 4 : « Pool des cases : tout le biome du chapitre, niveau 6e (les filtres cassés sont
 * remplacés) ».
 */

/** Clé de comparaison : minuscules, sans accents (`ᵉ` compris), espaces réduits. */
function normalizeNiveau(value) {
  return String(value == null ? '' : value)
    .replace(/ᵉ/g, 'e')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clés normalisées admises (comparer après `normalizeNiveau`). */
const SIXIEME_LEVELS = Object.freeze(
  new Set(['6e', '6eme', 'sixieme', 'cycle 3', 'cycle3', 'college', 'base']),
);

/**
 * Variantes telles qu'elles s'écrivent en base (`gl_qcm_questions.niveau`), pour un
 * `niveau IN (…)` paramétré. La collation `utf8mb4_unicode_ci` confond déjà accents et
 * casse ; la liste reste explicite pour une base qui ne l'aurait pas.
 */
const NIVEAUX_ADMIS_SQL = Object.freeze([
  '6e',
  '6eme',
  '6ème',
  '6ᵉ',
  'sixieme',
  'sixième',
  'cycle 3',
  'cycle3',
  'college',
  'collège',
  'base',
]);

/** @returns {boolean} vrai si le niveau est compatible avec le public (6ᵉ / cycle 3). */
function isNiveauAdmis(value) {
  return SIXIEME_LEVELS.has(normalizeNiveau(value));
}

module.exports = { NIVEAUX_ADMIS_SQL, SIXIEME_LEVELS, isNiveauAdmis, normalizeNiveau };
