'use strict';

// =====================================================================
// Adaptateurs de produit du moteur de verrouillage (« gating ») — ForetMap et Gnomes & Licornes.
//
// Audit du 25/09/2026, § 3.1 (domaine Pédagogie : « le moteur `learningGating*` derrière un
// adaptateur de produit qui isole les appels GL ») ; décision Q18 du mainteneur.
//
// Le moteur (`lib/learningGating*.js`, `lib/gatingPolicyLoad.js`, `lib/learningLinksBulk.js`)
// est COMMUN aux deux produits. Ce qui les distingue était tranché par 50 lignes testant le
// produit (`product === 'gl'`, `p !== 'gl'`, `isGlProduct`…) réparties dans dix fichiers, avec
// 22 noms de tables GL et 9 imports GL (état au 25/09/2026, `bf96ada4`). C'est désormais décrit
// ici, UN OBJET PAR PRODUIT (`GATING_PRODUCTS.fm`, `GATING_PRODUCTS.gl`) :
//
//   partie statique (`lib/pedago/gatingProductCatalog.js`, sans dépendance) :
//   - `resourceTypes`, `markable` : types acceptés, types validables (« marquer comme… ») ;
//   - `tables`       : liens question ↔ ressource, politiques, verrous de re-tentative ;
//   - `learner`      : clé du lecteur dans la table des verrous (`user_id` pour ForetMap, couple
//                      `reader_user_type` / `reader_user_id` pour GL : un invité ou un MJ n'a pas
//                      de compte — même distinction que `lib/shared/learningAckCore.js`) ;
//   - `questions`    : source des questions et de leur niveau, fragments SQL des liens ;
//   - `answers`      : où sont les bonnes réponses du lecteur ;
//   - `capabilities` : filtre de niveau (ForetMap), jeux de questions, réponses d'équipe et
//                      granularité de chapitre (GL) ;
//
//   hooks (ce fichier) :
//   - `loadSiteSettings()`                       réglages du site du produit ;
//   - `readerKey(glAuth)` / `resolveLearner(…)`  identification du lecteur (403 sinon) ;
//   - `listCorrectCodes(db, learner)`            bonnes réponses du lecteur ;
//   - `listTeamCorrectCodes(db, glAuth)`         bonnes réponses de son équipe (GL) ;
//   - `resolveChapterGranularity(db, …)`         granularité imposée par le chapitre (GL) ;
//   - `filterLinksByLevel(links, level)`         filtre de niveau (ForetMap) ;
//   - `recordAttempt(db, attempt)`               tentative QCM (GL).
//
// Le moteur ne teste plus le produit : il interroge l'adaptateur, et une capacité absente
// désactive la règle. **Ce fichier est le seul du moteur à importer du code Gnomes & Licornes**
// (`lib/glSettings`, `lib/glGatingChapterGranularity`, `lib/glQcmAttempts`,
// `lib/glPlayerMembership`), sans le modifier.
//
// Aucun changement de comportement (piste B) : SQL, messages et normalisations sont repris à
// l'identique, y compris les trois lectures historiques du paramètre `product`
// (`resolveGatingProduct`, `gatingProductOrDefault`, `exactGatingProduct`). Caractérisation :
// tests/learning-gating-products-characterization.test.js ; contrat : tests/gating-products.test.js.
//
// Hors adaptateur, deux cœurs purs partagés restent paramétrés par l'identifiant de produit et
// sont appelés tels quels par les routes GL : `lib/shared/gatingPolicyLayersCore.js` (ForetMap
// force la granularité `player`) et `lib/shared/gatingSettingsCore.js` (clé `fmKey` / `glKey`).
// =====================================================================

const { getSettingValue } = require('../settings');
const gatingCore = require('../shared/gatingSettingsCore');
const { normalizeQuestionCode } = require('../shared/resourceQuestionGatingCore');
const { buildReaderKey } = require('../shared/learningAckCore');
const { filterGatingLinksByLevel } = require('./eligibility');
const catalog = require('./gatingProductCatalog');
// Gnomes & Licornes — seuls points d'entrée du moteur vers le module GL.
const { getGlGatingSettings } = require('../glSettings');
const { resolveGlChapterGranularity } = require('../glGatingChapterGranularity');
const { listCorrectQcmCodesForReader, recordGlQcmAttempt } = require('../glQcmAttempts');
const { resolveGlPlayerActiveMembership } = require('../glPlayerMembership');

/**
 * Réglages de conditionnement du site ForetMap, lus depuis le catalogue COMMUN
 * (lib/shared/gatingSettingsCore.js). Ajouter un réglage là-bas suffit : il
 * apparaît ici et côté GL, avec les mêmes bornes.
 */
async function getFmGatingSite() {
  const raw = {};
  for (const name of gatingCore.GATING_SETTING_NAMES) {
    const def = gatingCore.GATING_SETTING_DEFS[name];
    if (!def.fmKey) continue;
    raw[name] = await getSettingValue(def.fmKey, def.default);
  }
  return gatingCore.buildGatingSettings(raw, 'fm');
}

/** ForetMap — codes des questions réussies par le compte (toutes tentatives confondues). */
async function listFmCorrectQuestionCodes(db, userId) {
  if (!userId) return [];
  const rows = await db.queryAll(
    'SELECT DISTINCT question_code FROM user_quiz_attempts WHERE user_id = ? AND is_correct = 1',
    [String(userId)],
  );
  return rows.map((r) => normalizeQuestionCode(r.question_code)).filter(Boolean);
}

/** GL — codes réussis par le lecteur dans UN jeu de questions (`qcm` ou `qcm_lore`). */
async function listGlCorrectQuestionCodes(db, reader, dataset) {
  if (!reader) return [];
  return (await listCorrectQcmCodesForReader(db, reader, dataset))
    .map((c) => normalizeQuestionCode(c))
    .filter(Boolean);
}

/**
 * Équipe du lecteur GL, pour la granularité `team`. L'appartenance est lue **par partie**
 * (`gl_team_members`, partie du jeton en priorité) : les réponses de l'équipe comptées
 * sont celles de la partie en cours, pas celles d'une équipe d'un autre chapitre. À défaut
 * d'appartenance en base, le `teamId` du jeton fait foi (MJ en prise de contrôle, tests).
 */
async function resolveGlReaderTeamId(db, glAuth) {
  const fromToken = Number(glAuth?.teamId);
  const tokenTeamId = Number.isFinite(fromToken) && fromToken > 0 ? Math.trunc(fromToken) : null;
  if (glAuth?.userType !== 'gl_player' || glAuth?.userId == null) return tokenTeamId;
  try {
    const membership = await resolveGlPlayerActiveMembership(glAuth.userId, {
      preferredGameId: glAuth.gameId,
      preferredTeamId: tokenTeamId,
      queryOne: db.queryOne,
    });
    return membership?.teamId ?? tokenTeamId;
  } catch (_err) {
    return tokenTeamId;
  }
}

/** GL — codes réussis par l'ÉQUIPE (toute réponse juste portant ce team_id, MJ compris). */
async function listGlCorrectQuestionCodesForTeam(db, teamId) {
  if (!teamId) return [];
  try {
    const rows = await db.queryAll(
      `SELECT DISTINCT question_code FROM gl_qcm_attempts
        WHERE team_id = ? AND is_correct = 1`,
      [teamId],
    );
    return rows.map((r) => normalizeQuestionCode(r.question_code)).filter(Boolean);
  } catch (_err) {
    return [];
  }
}

/** ForetMap : le lecteur est un compte (`userId`), obligatoire pour un défi. */
const FM = Object.freeze({
  ...catalog.GATING_PRODUCT_CATALOG.fm,
  loadSiteSettings: getFmGatingSite,
  /** ForetMap n'a pas de clé de lecteur « GL » : la clé est le compte. */
  readerKey: () => null,
  /**
   * Lecteur d'un défi : `{ ok: true, userId, reader }` ou le refus historique (403).
   * @returns {{ ok: true, userId: *, reader: null } | { ok: false, status: 403, error: string }}
   */
  resolveLearner: ({ userId } = {}) =>
    userId
      ? { ok: true, userId, reader: null }
      : { ok: false, status: 403, error: 'Authentification requise' },
  listCorrectCodes: (db, { userId } = {}) => listFmCorrectQuestionCodes(db, userId),
  listTeamCorrectCodes: async () => [],
  resolveChapterGranularity: async () => null,
  filterLinksByLevel: filterGatingLinksByLevel,
  recordAttempt: null,
});

/** Gnomes & Licornes : le lecteur est un couple (type, identifiant) — joueur, invité ou MJ. */
const GL = Object.freeze({
  ...catalog.GATING_PRODUCT_CATALOG.gl,
  loadSiteSettings: () => getGlGatingSettings(),
  readerKey: (glAuth) => buildReaderKey(glAuth),
  resolveLearner: ({ userId = null, glAuth = null } = {}) => {
    const reader = buildReaderKey(glAuth);
    return reader
      ? { ok: true, userId, reader }
      : { ok: false, status: 403, error: 'Profil invalide' };
  },
  /** Bonnes réponses du lecteur, les deux jeux confondus (`qcm` puis `qcm_lore`). */
  listCorrectCodes: async (db, { reader } = {}) => {
    const codes = [];
    for (const ds of ['qcm', 'qcm_lore']) {
      codes.push(...(await listGlCorrectQuestionCodes(db, reader, ds)));
    }
    return codes;
  },
  /** Bonnes réponses de l'équipe du lecteur (granularité `team`). */
  listTeamCorrectCodes: async (db, glAuth) =>
    listGlCorrectQuestionCodesForTeam(db, await resolveGlReaderTeamId(db, glAuth)),
  resolveChapterGranularity: (db, { resourceType, resourceRef, glAuth } = {}) =>
    resolveGlChapterGranularity(db, { resourceType, resourceRef, glAuth }),
  filterLinksByLevel: null,
  /** Enregistre une tentative QCM (sans marquer la ressource) — `recordGlQcmAttemptForReader`. */
  recordAttempt: (db, attempt) => recordGlQcmAttempt(db, attempt),
});

const GATING_PRODUCTS = Object.freeze({ fm: FM, gl: GL });

/** Adaptateur complet d'une entrée du catalogue (ou `null`). */
function withHooks(entry) {
  return entry ? GATING_PRODUCTS[entry.id] : null;
}

/**
 * Produit désigné par une valeur libre : `fm` / `foretmap` / `gl`, casse et espaces ignorés.
 * Inconnu → `null` (le défi répond alors 400).
 */
function resolveGatingProduct(value) {
  return withHooks(catalog.resolveGatingProduct(value));
}

/** Seul « gl » (casse ignorée) désigne GL ; toute autre valeur désigne ForetMap. */
function gatingProductOrDefault(value) {
  return withHooks(catalog.gatingProductOrDefault(value));
}

/** « fm » → ForetMap, « gl » → GL, exactement ; sinon `null`. */
function exactGatingProduct(value) {
  return withHooks(catalog.exactGatingProduct(value));
}

module.exports = {
  GATING_PRODUCTS,
  FM_MARKABLE: catalog.FM_MARKABLE,
  GL_MARKABLE: catalog.GL_MARKABLE,
  resolveGatingProduct,
  gatingProductOrDefault,
  exactGatingProduct,
  gatingTablesOf: catalog.gatingTablesOf,
  getFmGatingSite,
  listFmCorrectQuestionCodes,
  listGlCorrectQuestionCodes,
  listGlCorrectQuestionCodesForTeam,
  resolveGlReaderTeamId,
};
