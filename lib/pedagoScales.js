'use strict';

/**
 * Échelles de niveau pédagogique — **référentiel unique des correspondances**.
 * Miroir ESM : `src/utils/pedagoScales.js` (parité vérifiée par `tests/pedago-scales.test.js`).
 *
 * Cinq échelles de niveau coexistent dans la base, chacune née d'un lot différent :
 *
 * | Échelle                      | Colonnes                                          | Valeurs                              |
 * | ---------------------------- | ------------------------------------------------- | ------------------------------------ |
 * | Étape d'affichage            | `maps` / `groups.pedago_level`, `users.biodiv_pedago_level`, `pedago_sessions.level` | `college`, `lycee`, `universite` |
 * | Niveau de question           | `quiz_questions.niveau`, `id_keys.niveau`         | `college`, `lycee`                   |
 * | Difficulté de question       | `quiz_questions.difficulte`                       | 1 à 5 (corpus livré : 1 à 3)         |
 * | Profondeur de terme          | `glossary_terms.niveau`                           | `base`, `approfondissement`, `avance` |
 * | Niveau scolaire du programme | `curriculum_notions.niveau`, `groups.curriculum_niveau` | `cycle3` … `es_terminale`      |
 *
 * Rien ne les reliait : un tirage « cycle 4 » sortait des questions de lycée, une séance
 * lycée demandait un `notionNiveau=lycee` que l'API refusait, et une classe de 6ᵉ ne
 * pouvait pas se distinguer d'une classe de 3ᵉ.
 *
 * Chaque échelle garde ses valeurs (elles sont en base, dans des exports, dans l'esprit des
 * professeurs), mais **toutes se projettent ici sur un pivot : le palier scolaire** du
 * programme officiel. C'est l'échelle la plus fine, et la seule qui ait un sens hors de
 * l'application.
 *
 * - une **étape** (`college`, `lycee`) couvre une **plage** de paliers ;
 * - un **contenu** (question, clé, terme) a un **palier d'entrée** : le premier palier où
 *   il est attendu. Un contenu peut servir au-dessus (révision), jamais en dessous ;
 * - la **difficulté** d'une question est orthogonale : elle classe les questions *à
 *   l'intérieur* de leur niveau, elle ne se projette pas sur le palier.
 *
 * Aucune I/O ici : ces fonctions servent au serveur, au front et aux tests.
 */

/** Niveaux scolaires du programme, dans l'ordre de l'ENUM `curriculum_notions.niveau`. */
const CURRICULUM_NIVEAU_VALUES = Object.freeze([
  'cycle3',
  'cycle4',
  'seconde',
  'premiere_spe',
  'terminale_spe',
  'es_premiere',
  'es_terminale',
]);

/**
 * Palier de chaque niveau (année de scolarité, du CM1 à la terminale). Spécialité SVT et
 * enseignement scientifique sont **parallèles** : même palier, d'où une table plutôt que
 * l'ordre de l'ENUM.
 */
const CURRICULUM_PALIERS = Object.freeze({
  cycle3: 1,
  cycle4: 2,
  seconde: 3,
  premiere_spe: 4,
  es_premiere: 4,
  terminale_spe: 5,
  es_terminale: 5,
});

/** Étapes (échelle d'affichage et de niveau de question), du plus simple au plus avancé. */
const ETAPES = Object.freeze(['college', 'lycee', 'universite']);

/**
 * Plage de niveaux scolaires couverte par chaque étape. L'université est **au-delà** du
 * programme du secondaire : aucune notion ne lui est propre, elle voit tout.
 */
const ETAPE_CURRICULUM_NIVEAUX = Object.freeze({
  college: Object.freeze(['cycle3', 'cycle4']),
  lycee: Object.freeze(['seconde', 'premiere_spe', 'terminale_spe', 'es_premiere', 'es_terminale']),
  universite: Object.freeze([]),
});

/** Palier d'entrée d'une question de quiz (et d'une clé d'identification) selon son niveau. */
const QUIZ_NIVEAU_ENTRY = Object.freeze({
  college: 'cycle3',
  lycee: 'seconde',
});

/**
 * Palier d'entrée d'un terme de glossaire selon sa profondeur. Lecture du corpus :
 * « base » (pollinisateur, photosynthèse, compost) dès le cycle 3 ; « approfondissement »
 * (réseau trophique, humus, stomate) à partir du cycle 4 ; « avancé » (biocénose,
 * minéralisation, sélection naturelle) au lycée.
 */
const GLOSSARY_NIVEAU_ENTRY = Object.freeze({
  base: 'cycle3',
  approfondissement: 'cycle4',
  avance: 'seconde',
});

function normalizeKey(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Niveau scolaire canonique, ou `null`. */
function normalizeCurriculumNiveauValue(value) {
  const key = normalizeKey(value);
  return Object.prototype.hasOwnProperty.call(CURRICULUM_PALIERS, key) ? key : null;
}

/** Étape canonique (`college` / `lycee` / `universite`), ou `null`. */
function normalizeEtape(value) {
  const key = normalizeKey(value);
  return ETAPES.includes(key) ? key : null;
}

/** Palier d'un niveau scolaire (1 = cycle 3 … 5 = terminale), ou `null`. */
function curriculumPalier(niveau) {
  const value = normalizeCurriculumNiveauValue(niveau);
  return value ? CURRICULUM_PALIERS[value] : null;
}

/** Étape d'un niveau scolaire : `college` pour les cycles 3 et 4, `lycee` au-delà. */
function etapeForCurriculumNiveau(niveau) {
  const value = normalizeCurriculumNiveauValue(niveau);
  if (!value) return null;
  for (const etape of ETAPES) {
    if (ETAPE_CURRICULUM_NIVEAUX[etape].includes(value)) return etape;
  }
  return null;
}

/** Niveaux scolaires couverts par une étape (copie ; tableau vide pour l'université). */
function curriculumNiveauxForEtape(etape) {
  const value = normalizeEtape(etape);
  return value ? [...ETAPE_CURRICULUM_NIVEAUX[value]] : [];
}

/** Trie et dédoublonne une liste de niveaux scolaires dans l'ordre de l'ENUM. */
function sortCurriculumNiveaux(niveaux) {
  const set = new Set(
    (Array.isArray(niveaux) ? niveaux : []).map(normalizeCurriculumNiveauValue).filter(Boolean),
  );
  return CURRICULUM_NIVEAU_VALUES.filter((value) => set.has(value));
}

/** Tous les niveaux scolaires dont le palier ne dépasse pas celui de `niveau`. */
function curriculumNiveauxUpTo(niveau) {
  const palier = curriculumPalier(niveau);
  if (palier == null) return [];
  return CURRICULUM_NIVEAU_VALUES.filter((value) => CURRICULUM_PALIERS[value] <= palier);
}

/**
 * Filtre « niveau de notion » d'une requête (`notionNiveau`). Accepte, séparés par des
 * virgules :
 * - un niveau scolaire (`cycle4`, `seconde`…) ;
 * - une étape (`college` = cycles 3 et 4, `lycee` = seconde → terminale) — c'est ce que
 *   les séances lycée envoyaient déjà, et que l'API refusait en 400.
 *
 * @returns {null|{ niveaux: string[] }|{ error: string }} `null` si rien n'est demandé.
 */
function parseNotionNiveauFilter(raw) {
  if (raw == null) return null;
  const tokens = String(raw)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const niveaux = [];
  for (const token of tokens) {
    const niveau = normalizeCurriculumNiveauValue(token);
    if (niveau) {
      niveaux.push(niveau);
      continue;
    }
    const etape = normalizeEtape(token);
    if (etape && ETAPE_CURRICULUM_NIVEAUX[etape].length > 0) {
      niveaux.push(...ETAPE_CURRICULUM_NIVEAUX[etape]);
      continue;
    }
    return { error: 'notionNiveau invalide' };
  }
  return { niveaux: sortCurriculumNiveaux(niveaux) };
}

/** Palier d'entrée d'une question de quiz (`college` → 1, `lycee` → 3), ou `null`. */
function quizNiveauEntryPalier(niveau) {
  const entry = QUIZ_NIVEAU_ENTRY[normalizeKey(niveau)];
  return entry ? CURRICULUM_PALIERS[entry] : null;
}

/** Palier d'entrée d'un terme de glossaire (`base` → 1 … `avance` → 3), ou `null`. */
function glossaryNiveauEntryPalier(niveau) {
  const entry = GLOSSARY_NIVEAU_ENTRY[normalizeKey(niveau)];
  return entry ? CURRICULUM_PALIERS[entry] : null;
}

/**
 * Règle de rattachement par héritage : un contenu de palier d'entrée `entryPalier` ne
 * reçoit une notion de sa catégorie que si la notion est **au moins** à ce palier. Une
 * question de lycée n'hérite donc pas des notions de cycle 3 ou 4 de sa catégorie (elle
 * serait trop difficile pour ce public) ; une question de collège peut servir de révision
 * sur une notion de lycée. Palier d'entrée inconnu : aucune restriction.
 */
function contentMayInheritNotion(entryPalier, notionNiveau) {
  if (entryPalier == null) return true;
  const palier = curriculumPalier(notionNiveau);
  return palier != null && palier >= entryPalier;
}

/**
 * Pour chaque valeur d'une échelle de contenu, les niveaux scolaires **trop bas** pour
 * qu'elle en hérite. Sert à écrire la règle en SQL, une paire (niveau du contenu, liste)
 * par valeur concernée ; les valeurs sans restriction sont omises.
 *
 * @param {Record<string, string>} entryMap `QUIZ_NIVEAU_ENTRY` ou `GLOSSARY_NIVEAU_ENTRY`
 * @returns {Array<{ contentNiveau: string, notionNiveaux: string[] }>}
 */
function inheritanceExclusionsFor(entryMap) {
  const rules = [];
  for (const [contentNiveau, entry] of Object.entries(entryMap || {})) {
    const entryPalier = CURRICULUM_PALIERS[entry];
    const tooLow = CURRICULUM_NIVEAU_VALUES.filter(
      (value) => CURRICULUM_PALIERS[value] < entryPalier,
    );
    if (tooLow.length > 0) rules.push({ contentNiveau, notionNiveaux: tooLow });
  }
  return rules;
}

/**
 * **Échelle unique de l'apprenant** (décision du mainteneur du 25/09/2026, question 4) : les
 * niveaux du programme, plus `universite` au-delà du secondaire. C'est le domaine de
 * `groups.curriculum_niveau` depuis la migration 301 (la colonne de niveau des groupes,
 * question 5). Collège, lycée et université n'en sont que des **regroupements d'affichage**,
 * déduits par `etapeForLearnerNiveau`. `curriculum_notions.niveau` garde son ENUM : aucune
 * notion n'est propre à l'université.
 */
const LEARNER_NIVEAU_VALUES = Object.freeze([...CURRICULUM_NIVEAU_VALUES, 'universite']);

/**
 * Palier de l'université : au-delà de la terminale. Il sert à **comparer** des niveaux (le
 * plus haut l'emporte), jamais à borner un contenu — un élève d'université n'a pas de palier
 * maximal.
 */
const UNIVERSITE_PALIER = 6;

/** Niveau canonique de l'échelle de l'apprenant (`cycle3` … `es_terminale`, `universite`), ou `null`. */
function normalizeLearnerNiveau(value) {
  const key = normalizeKey(value);
  return LEARNER_NIVEAU_VALUES.includes(key) ? key : null;
}

/** Palier d'un niveau de l'apprenant (1 = cycle 3 … 5 = terminale, 6 = université), ou `null`. */
function learnerNiveauPalier(niveau) {
  const value = normalizeLearnerNiveau(niveau);
  if (!value) return null;
  return value === 'universite' ? UNIVERSITE_PALIER : CURRICULUM_PALIERS[value];
}

/** Regroupement d'affichage d'un niveau de l'apprenant : `college`, `lycee` ou `universite`. */
function etapeForLearnerNiveau(niveau) {
  const value = normalizeLearnerNiveau(niveau);
  if (!value) return null;
  return value === 'universite' ? 'universite' : etapeForCurriculumNiveau(value);
}

/** Trie et dédoublonne des niveaux de l'apprenant dans l'ordre de l'ENUM des groupes. */
function sortLearnerNiveaux(niveaux) {
  const set = new Set(
    (Array.isArray(niveaux) ? niveaux : []).map(normalizeLearnerNiveau).filter(Boolean),
  );
  return LEARNER_NIVEAU_VALUES.filter((value) => set.has(value));
}

/**
 * Le plus haut niveau d'une liste, ou `null`. Plusieurs classes : on ne retire pas à un élève
 * ce qu'une de ses classes travaille. À palier égal (spécialité et enseignement scientifique),
 * le premier dans l'ordre de l'ENUM — le choix ne change ni le palier ni l'affichage.
 */
function highestLearnerNiveau(niveaux) {
  let best = null;
  for (const value of sortLearnerNiveaux(niveaux)) {
    if (best == null || learnerNiveauPalier(value) > learnerNiveauPalier(best)) best = value;
  }
  return best;
}

/**
 * Niveaux scolaires proposés à un public, ou `null` pour « tous ».
 *
 * - l'étape d'affichage donne le plafond : `college` → cycles 3 et 4 ; lycée et
 *   université voient tout le référentiel ;
 * - le **niveau du programme de la classe** (`groups.curriculum_niveau`), s'il est connu,
 *   resserre à « tout ce qui précède la classe » : une 6ᵉ (cycle 3) ne voit plus le
 *   cycle 4, une seconde voit cycles 3, 4 et seconde. Plusieurs classes : le plus haut
 *   palier l'emporte (on ne retire pas à un élève ce qu'une de ses classes travaille).
 *
 * Classe incompatible avec l'étape (classe de seconde, affichage Collège choisi par
 * l'élève) : l'étape l'emporte, c'est le réglage le plus restrictif.
 *
 * @param {{ level?: string|null, classNiveaux?: Array<string|null> }} input
 * @returns {string[]|null}
 */
function visibleCurriculumNiveaux({ level, classNiveaux } = {}) {
  const etape = normalizeEtape(level);
  const ceiling = etape === 'college' ? [...ETAPE_CURRICULUM_NIVEAUX.college] : null;

  let highest = null;
  for (const raw of Array.isArray(classNiveaux) ? classNiveaux : []) {
    const palier = curriculumPalier(raw);
    if (palier != null && (highest == null || palier > curriculumPalier(highest))) {
      highest = normalizeCurriculumNiveauValue(raw);
    }
  }
  if (!highest) return ceiling;

  const upTo = curriculumNiveauxUpTo(highest);
  if (!ceiling) return upTo;
  const narrowed = upTo.filter((value) => ceiling.includes(value));
  return narrowed.length > 0 ? narrowed : ceiling;
}

module.exports = {
  CURRICULUM_NIVEAU_VALUES,
  CURRICULUM_PALIERS,
  ETAPES,
  ETAPE_CURRICULUM_NIVEAUX,
  QUIZ_NIVEAU_ENTRY,
  GLOSSARY_NIVEAU_ENTRY,
  normalizeCurriculumNiveauValue,
  normalizeEtape,
  curriculumPalier,
  etapeForCurriculumNiveau,
  curriculumNiveauxForEtape,
  sortCurriculumNiveaux,
  curriculumNiveauxUpTo,
  parseNotionNiveauFilter,
  quizNiveauEntryPalier,
  glossaryNiveauEntryPalier,
  contentMayInheritNotion,
  inheritanceExclusionsFor,
  visibleCurriculumNiveaux,
  LEARNER_NIVEAU_VALUES,
  UNIVERSITE_PALIER,
  normalizeLearnerNiveau,
  learnerNiveauPalier,
  etapeForLearnerNiveau,
  sortLearnerNiveaux,
  highestLearnerNiveau,
};
