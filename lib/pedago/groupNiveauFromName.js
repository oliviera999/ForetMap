'use strict';

/**
 * Niveau d'un groupe **déduit de son nom** (décision du mainteneur du 25/09/2026, question 5).
 * Miroir ESM : `src/utils/groupNiveauFromName.js` (parité vérifiée par
 * `tests/group-niveau-from-name.test.js`).
 *
 * `groups.curriculum_niveau` devient la colonne de niveau des groupes ; elle n'était renseignée
 * nulle part. Trois consommateurs partagent **la même règle** :
 *
 * - le **formulaire du groupe** propose la valeur déduite, que l'administrateur confirme ;
 * - l'**import Moodle** la pose à la création d'un groupe, seulement sans ambiguïté ;
 * - la **migration 301** la pose sur les groupes existants, avec les mêmes motifs recopiés en
 *   SQL (un test rejoue la migration sur un jeu de noms et compare au résultat JS).
 *
 * La règle est volontairement **prudente** : un nom ne donne un niveau que s'il n'en évoque
 * qu'un seul. Les motifs reconnus (après passage en minuscules et retrait des accents) :
 *
 * | Niveau          | Motifs                                                                     |
 * | --------------- | -------------------------------------------------------------------------- |
 * | cycle 3         | `6e`, `6eme`, `6ème`, `6A`, `601`, `sixième`, `CM1`, `CM2`, `cycle 3`       |
 * | cycle 4         | idem pour 5, 4 et 3 (`5e`, `4B`, `302`, `troisième`…), `cycle 4`            |
 * | seconde         | `2nde`, `2de`, `201`, `seconde`                                            |
 * | première        | `1re`, `1ère`, `101`, `première` — **plus** une voie (voir ci-dessous)      |
 * | terminale       | `Tle`, `terminale` — **plus** une voie                                     |
 * | université      | `université`, `univ`, `licence`, `master`                                  |
 *
 * - Un préfixe d'année scolaire des cohortes Moodle (`26#601`) est ignoré ; un nom réduit à
 *   un chiffre après ce préfixe (`26#6`, l'unité « niveau 6ᵉ ») vaut ce niveau.
 * - Un chiffre isolé ailleurs (`Groupe 3`) ne veut rien dire : il n'est pas lu.
 * - Première et terminale ont deux voies de même palier (spécialité SVT, enseignement
 *   scientifique) : le nom doit dire laquelle (`spé`, `SVT` / `scientifique`, `ens. sci.`).
 *   « ES » n'est pas lu : c'était aussi l'ancienne série économique et sociale.
 * - Deux niveaux différents dans le même nom (`6e-5e`) : aucun niveau.
 */

/** Frontière de mot, identique en JS et en SQL (PCRE de MariaDB) : ni lettre ni chiffre. */
const B1 = '(^|[^a-z0-9])';
const B2 = '([^a-z0-9]|$)';

/**
 * Motifs par niveau « brut » (`premiere` et `terminale` attendent leur voie). Recopiés à
 * l'identique dans `migrations/301_groups_curriculum_niveau_unique.sql`.
 */
const NAME_PATTERNS = Object.freeze({
  cycle3: Object.freeze([
    `${B1}(cm[12]|6(e|eme|ieme)[a-z0-9]{0,2}|6[a-z]|6[0-9]{2}|sixiemes?)${B2}`,
    `${B1}cycle[^a-z0-9]*3${B2}`,
  ]),
  cycle4: Object.freeze([
    `${B1}([345](e|eme|ieme)[a-z0-9]{0,2}|[345][a-z]|[345][0-9]{2}|cinquiemes?|quatriemes?|troisiemes?)${B2}`,
    `${B1}cycle[^a-z0-9]*4${B2}`,
  ]),
  seconde: Object.freeze([`${B1}(2(nde|de|nd)[a-z0-9]{0,2}|2[0-9]{2}|secondes?)${B2}`]),
  premiere: Object.freeze([`${B1}(1(re|ere)[a-z0-9]{0,2}|1[0-9]{2}|premieres?)${B2}`]),
  terminale: Object.freeze([`${B1}(tle|terminales?)[a-z0-9]{0,2}${B2}`]),
  universite: Object.freeze([`${B1}(universites?|univ|licences?|masters?)${B2}`]),
});

/** Voies de première et de terminale. */
const VOIE_PATTERNS = Object.freeze({
  spe: Object.freeze([`${B1}(spe|specialite|svt)${B2}`]),
  es: Object.freeze([`${B1}(scientifique|ens[^a-z0-9]*sci)${B2}`]),
});

/** Préfixe d'année scolaire des cohortes (`26#`, `2026#`). */
const YEAR_PREFIX_PATTERN = '^[0-9]{2,4} *# *';

/** Nom réduit à un chiffre (après le préfixe) : niveau brut correspondant. */
const WHOLE_NAME_DIGIT = Object.freeze({
  1: 'premiere',
  2: 'seconde',
  3: 'cycle4',
  4: 'cycle4',
  5: 'cycle4',
  6: 'cycle3',
});

/** Ordre de lecture des niveaux bruts. */
const RAW_NIVEAUX = Object.freeze([
  'cycle3',
  'cycle4',
  'seconde',
  'premiere',
  'terminale',
  'universite',
]);

/**
 * Caractères remplacés avant le retrait des accents : exposants des abréviations (`6ᵉ`,
 * `1ʳᵉ`, `2ⁿᵈᵉ`) et signe degré (`6°1`). Même table dans la migration.
 */
const SPECIAL_CHARS = Object.freeze({ ᵉ: 'e', ʳ: 'r', ᵈ: 'd', ⁿ: 'n', '°': 'e' });

/** Raisons renvoyées avec la proposition (affichées au professeur). */
const SUGGESTION_REASONS = Object.freeze({
  deduit: 'deduit',
  aucunIndice: 'aucun_indice',
  plusieursNiveaux: 'plusieurs_niveaux',
  voieAPreciser: 'voie_a_preciser',
});

const COMPILED = Object.freeze({
  names: Object.fromEntries(
    Object.entries(NAME_PATTERNS).map(([k, list]) => [k, list.map((p) => new RegExp(p))]),
  ),
  voies: Object.fromEntries(
    Object.entries(VOIE_PATTERNS).map(([k, list]) => [k, list.map((p) => new RegExp(p))]),
  ),
  yearPrefix: new RegExp(YEAR_PREFIX_PATTERN),
});

/** Minuscules, exposants et degré remplacés, accents retirés. */
function normalizeGroupName(name) {
  let text = String(name == null ? '' : name).toLowerCase();
  for (const [from, to] of Object.entries(SPECIAL_CHARS)) text = text.split(from).join(to);
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function matchesAny(text, regexes) {
  return regexes.some((re) => re.test(text));
}

/**
 * Proposition de niveau pour un nom de groupe.
 *
 * @param {string|null|undefined} name
 * @returns {{ niveau: string|null, raison: string, indices: string[] }}
 *   `indices` : niveaux bruts reconnus (`cycle3`, `premiere`…), pour expliquer un refus.
 */
function suggestCurriculumNiveauFromName(name) {
  const text = normalizeGroupName(name).trim();
  const short = text.replace(COMPILED.yearPrefix, '').trim();
  const found = new Set();
  for (const raw of RAW_NIVEAUX) {
    if (matchesAny(text, COMPILED.names[raw])) found.add(raw);
  }
  const digit = WHOLE_NAME_DIGIT[short];
  if (/^[1-6]$/.test(short) && digit) found.add(digit);
  const indices = RAW_NIVEAUX.filter((raw) => found.has(raw));

  if (indices.length === 0) {
    return { niveau: null, raison: SUGGESTION_REASONS.aucunIndice, indices };
  }
  if (indices.length > 1) {
    return { niveau: null, raison: SUGGESTION_REASONS.plusieursNiveaux, indices };
  }
  const raw = indices[0];
  if (raw !== 'premiere' && raw !== 'terminale') {
    return { niveau: raw, raison: SUGGESTION_REASONS.deduit, indices };
  }
  const spe = matchesAny(text, COMPILED.voies.spe);
  const es = matchesAny(text, COMPILED.voies.es);
  if (spe === es) return { niveau: null, raison: SUGGESTION_REASONS.voieAPreciser, indices };
  const niveau =
    raw === 'premiere'
      ? spe
        ? 'premiere_spe'
        : 'es_premiere'
      : spe
        ? 'terminale_spe'
        : 'es_terminale';
  return { niveau, raison: SUGGESTION_REASONS.deduit, indices };
}

/** Types de groupe qui reçoivent un niveau **sans confirmation** (migration, import Moodle). */
const AUTO_NIVEAU_GROUP_KINDS = Object.freeze(['class', 'unit']);

/** Regroupement d'affichage d'un niveau (même table que `etapeForLearnerNiveau`). */
function etapeOfNiveau(niveau) {
  if (niveau === 'cycle3' || niveau === 'cycle4') return 'college';
  if (niveau === 'universite') return 'universite';
  return niveau ? 'lycee' : null;
}

/**
 * Niveau posé **automatiquement** (sans confirmation d'un humain), ou `null`. Plus strict que
 * la proposition du formulaire :
 *
 * - seules les **classes** et les **unités** ; une équipe ou un club mélange les niveaux par
 *   nature, et « Club 3D » n'est pas une classe de 3ᵉ ;
 * - un ancien réglage d'affichage (`pedago_level`) qui **contredit** le nom (« 601 » réglé en
 *   Lycée) est un choix d'administrateur : on ne tranche pas à sa place.
 *
 * @param {{ name?: string|null, kind?: string|null, pedagoLevel?: string|null }} group
 * @returns {string|null}
 */
function autoCurriculumNiveauForGroup({ name, kind, pedagoLevel } = {}) {
  const k = String(kind || 'class')
    .trim()
    .toLowerCase();
  if (!AUTO_NIVEAU_GROUP_KINDS.includes(k)) return null;
  const { niveau } = suggestCurriculumNiveauFromName(name);
  if (!niveau) return null;
  const legacy = pedagoLevel == null ? '' : String(pedagoLevel).trim().toLowerCase();
  if (legacy && legacy !== etapeOfNiveau(niveau)) return null;
  return niveau;
}

module.exports = {
  NAME_PATTERNS,
  VOIE_PATTERNS,
  YEAR_PREFIX_PATTERN,
  WHOLE_NAME_DIGIT,
  SPECIAL_CHARS,
  SUGGESTION_REASONS,
  AUTO_NIVEAU_GROUP_KINDS,
  normalizeGroupName,
  suggestCurriculumNiveauFromName,
  autoCurriculumNiveauForGroup,
};
