'use strict';

// =====================================================================
// Catalogue des produits du verrouillage — partie STATIQUE de l'adaptateur de produit.
//
// Descripteurs purs (aucune lecture en base, aucun import de module applicatif) : types de
// ressources, tables, clé du lecteur, fragments SQL des liens, capacités. Les modules qui n'ont
// besoin que de cela (verrous, politiques, orphelins, liens en lot, vue des verrous) l'importent
// directement et restent des feuilles du graphe d'imports.
//
// Les hooks (réglages du site, bonnes réponses, lecteur, granularité de chapitre…) complètent
// ces descripteurs dans `lib/pedago/gatingProducts.js`, seul fichier du moteur à importer du
// code Gnomes & Licornes. Contexte et contrat : en-tête de ce fichier-là.
// =====================================================================

const {
  FORETMAP_RESOURCE_TYPES,
  GL_RESOURCE_TYPES,
  GL_QUESTION_DATASETS,
} = require('../shared/resourceQuestionGatingCore');

// `glossary` a rejoint la liste avec la migration 201 : ForetMap sait desormais valider un
// terme (« j'ai appris ce terme »), comme GL le faisait deja. Tant que ce geste n'existait
// pas, un lien bloquant sur un terme etait accepte mais ne conditionnait rien.
const FM_MARKABLE = new Set(['tutorial', 'plant', 'glossary']);
const GL_MARKABLE = new Set([
  'species',
  'glossary',
  'tutorial',
  'lore_glossary',
  'feuillet',
  'content_page',
  'ecosystem',
]);

/**
 * Un lien bloquant n'est retenu que si sa question est ACTIVE : une question archivée reste
 * introuvable à la présentation (404), donc impossible à réussir — en mode « toutes », la
 * ressource devenait insatisfiable sans aucun signal (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, A5).
 */
const FM_ACTIVE_QUESTION_EXISTS = `EXISTS (
          SELECT 1 FROM quiz_questions q
           WHERE q.question_code = l.question_code AND q.statut = 'actif')`;
/**
 * Niveau propre de la question (ForetMap) : sert au filtre de niveau de l'apprenant
 * (`lib/pedago/eligibility.js`). Sous-requête scalaire sur la clé primaire.
 */
const FM_QUESTION_NIVEAU = `(SELECT q.niveau FROM quiz_questions q
          WHERE q.question_code = l.question_code) AS question_niveau`;
const GL_ACTIVE_QUESTION_EXISTS = `(
          (l.question_dataset = 'qcm_lore' AND EXISTS (
             SELECT 1 FROM gl_qcm_lore_questions q
              WHERE q.question_code = l.question_code AND q.statut = 'actif'))
          OR (l.question_dataset <> 'qcm_lore' AND EXISTS (
             SELECT 1 FROM gl_qcm_questions q
              WHERE q.question_code = l.question_code AND q.statut = 'actif')))`;

/** Fragments SQL de la clé du lecteur dans la table des verrous, calculés une fois. */
function learnerSql(columns) {
  return {
    columns: Object.freeze([...columns]),
    /** `user_id = ?` ou `reader_user_type = ? AND reader_user_id = ?` */
    where: columns.map((c) => `${c} = ?`).join(' AND '),
    /** Colonnes et marqueurs d'un INSERT. */
    insertColumns: columns.join(', '),
    insertPlaceholders: columns.map(() => '?').join(', '),
  };
}

/** ForetMap : le lecteur est un compte (`user_id`). */
const FM = Object.freeze({
  id: 'fm',
  label: 'ForetMap',
  resourceTypes: FORETMAP_RESOURCE_TYPES,
  markable: FM_MARKABLE,
  tables: Object.freeze({
    links: 'resource_question_links',
    policy: 'resource_gating_policy',
    cooldowns: 'resource_gating_cooldowns',
  }),
  questions: Object.freeze({
    /** Table des questions et colonne de leur niveau propre (`college` / `lycee`). */
    source: 'quiz_questions',
    levelColumn: 'niveau',
    datasets: null,
    activeFilterSql: FM_ACTIVE_QUESTION_EXISTS,
    linkColumnsSql: `l.question_code, l.is_gating, l.weight, ${FM_QUESTION_NIVEAU}`,
  }),
  answers: Object.freeze({ source: 'user_quiz_attempts', key: 'user_id' }),
  capabilities: Object.freeze({
    /** Filtre de niveau de l'apprenant (`filterGatingLinksByLevel`, décision Q1). */
    levelFilter: true,
    /** Les liens portent un jeu de questions (`question_dataset`). */
    questionDatasets: false,
    /** Granularité `team` : les bonnes réponses de l'équipe comptent. */
    teamAnswers: false,
    /** Granularité déduite du chapitre de la partie. */
    chapterGranularity: false,
  }),
  learner: Object.freeze({
    ...learnerSql(['user_id']),
    /** Valeurs de la clé, sans contrôle (l'appelant a déjà décidé). */
    values: ({ userId } = {}) => [String(userId)],
    isKnown: ({ userId } = {}) => Boolean(userId),
  }),
  /** Champs propres au produit sur une entrée de question du défi : aucun. */
  decorateQuestionEntry: () => {},
  /** Apprenant d'une ligne de verrou (vue enseignante). */
  lockLearner: (row) => ({ user_id: row.user_id, user_type: 'student' }),
});

/** Gnomes & Licornes : le lecteur est un couple (type, identifiant) — joueur, invité ou MJ. */
const GL = Object.freeze({
  id: 'gl',
  label: 'Gnomes & Licornes',
  resourceTypes: GL_RESOURCE_TYPES,
  markable: GL_MARKABLE,
  tables: Object.freeze({
    links: 'gl_resource_question_links',
    policy: 'gl_resource_gating_policy',
    cooldowns: 'gl_resource_gating_cooldowns',
  }),
  questions: Object.freeze({
    /** Deux jeux de questions, choisis par `question_dataset` ; aucun niveau exploité. */
    source: Object.freeze({ qcm: 'gl_qcm_questions', qcm_lore: 'gl_qcm_lore_questions' }),
    levelColumn: null,
    datasets: GL_QUESTION_DATASETS,
    activeFilterSql: GL_ACTIVE_QUESTION_EXISTS,
    linkColumnsSql: 'l.question_code, l.question_dataset, l.is_gating, l.weight',
  }),
  answers: Object.freeze({ source: 'gl_qcm_attempts', key: 'reader_user_type, reader_user_id' }),
  capabilities: Object.freeze({
    levelFilter: false,
    questionDatasets: true,
    teamAnswers: true,
    chapterGranularity: true,
  }),
  learner: Object.freeze({
    ...learnerSql(['reader_user_type', 'reader_user_id']),
    values: ({ reader } = {}) => [reader?.reader_user_type, reader?.reader_user_id],
    isKnown: ({ reader } = {}) =>
      Boolean(reader && reader.reader_user_type && reader.reader_user_id),
  }),
  decorateQuestionEntry: (entry, link) => {
    entry.question_dataset = String(link.question_dataset || 'qcm')
      .trim()
      .toLowerCase();
  },
  lockLearner: (row) => ({ user_id: row.reader_user_id, user_type: row.reader_user_type }),
});

const GATING_PRODUCT_CATALOG = Object.freeze({ fm: FM, gl: GL });

/**
 * Trois lectures historiques du paramètre `product`, conservées telles quelles (piste B : aucun
 * changement de comportement, même pour une valeur non canonique). Elles ne diffèrent que
 * hors de « fm » / « gl » en minuscules.
 */
const productReaders = Object.freeze({
  /** `fm` / `foretmap` / `gl`, casse et espaces ignorés ; sinon `null` (défi → 400). */
  free: (value) => {
    const v = String(value || '')
      .trim()
      .toLowerCase();
    if (v === 'fm' || v === 'foretmap') return 'fm';
    if (v === 'gl') return 'gl';
    return null;
  },
  /** Seul « gl » (casse ignorée, espaces conservés) désigne GL ; tout le reste ForetMap. */
  orDefault: (value) => (String(value || '').toLowerCase() === 'gl' ? 'gl' : 'fm'),
  /** « fm » ou « gl » exactement ; sinon `null`. */
  exact: (value) => (value === 'gl' || value === 'fm' ? value : null),
});

/** Lecture `free` : défi, accusé, liens bloquants (`learningGatingAcknowledge`). */
function resolveGatingProduct(value) {
  const id = productReaders.free(value);
  return id ? GATING_PRODUCT_CATALOG[id] : null;
}

/** Lecture `orDefault` : verrous, sévérité, présentation, liens en lot, orphelins. */
function gatingProductOrDefault(value) {
  return GATING_PRODUCT_CATALOG[productReaders.orDefault(value)];
}

/** Lecture `exact` : résumé groupé, chargement des politiques, vue des verrous. */
function exactGatingProduct(value) {
  const id = productReaders.exact(value);
  return id ? GATING_PRODUCT_CATALOG[id] : null;
}

/** Les trois tables du conditionnement d'un produit (liens, politiques, verrous), dans cet ordre. */
function gatingTablesOf(product) {
  return Object.freeze([product.tables.links, product.tables.policy, product.tables.cooldowns]);
}

module.exports = {
  GATING_PRODUCT_CATALOG,
  FM_MARKABLE,
  GL_MARKABLE,
  productReaders,
  resolveGatingProduct,
  gatingProductOrDefault,
  exactGatingProduct,
  gatingTablesOf,
};
