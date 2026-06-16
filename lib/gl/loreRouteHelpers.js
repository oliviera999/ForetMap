'use strict';

/**
 * Logique pure de `routes/gl/lore.js` (O10) : coercition d'identifiant
 * (`parseId`), résolution des réglages lore d'une partie (`resolveLoreSettings`),
 * normalisations de codes/slugs (`normalizeLoreQuestionCode`,
 * `normalizeChapitreSlug`), parsing CSV de filtres (`parseCsvQuery`), constante
 * SQL de sélection des questions (`LORE_QUESTION_SELECT`) et enrichissement
 * glossaire d'une question (`enrichLoreQuestionWithGlossary`). Déplacement
 * byte-identique depuis la route — aucune I/O directe, aucun accès req/res/DB.
 * Les dépendances sont réimportées depuis les mêmes sources que la route.
 */

const { parseGlId } = require('../glTeamContext');
const {
  resolveLoreFeuilletRetrigger,
  resolveLoreBoolSetting,
} = require('../glLoreFeuilletRetrigger');
const { matchLoreGlossaryTermsForText } = require('../glLoreGlossaryMatch');
const { combineKeywords: combineLoreQcmKeywords } = require('../glQcmLoreImport');
const { normalizeOptionalString } = require('../shared/httpHelpers');

function parseId(value) {
  return parseGlId(value);
}

function resolveLoreSettings(gameRow, gameplaySettings) {
  return {
    retrigger: resolveLoreFeuilletRetrigger(gameRow, gameplaySettings),
    effacementEnabled: resolveLoreBoolSetting(
      gameRow,
      'lore_effacement_enabled',
      gameplaySettings,
      'loreEffacementEnabled',
      true,
    ),
    gemmeCostsEnabled: resolveLoreBoolSetting(
      gameRow,
      'lore_gemme_costs_enabled',
      gameplaySettings,
      'loreGemmeCostsEnabled',
      true,
    ),
    heartRewardsEnabled: resolveLoreBoolSetting(
      gameRow,
      'lore_heart_rewards_enabled',
      gameplaySettings,
      'loreHeartRewardsEnabled',
      true,
    ),
    spoilerMaxLevel: gameplaySettings.loreSpoilerMaxLevel || 'recit',
  };
}

function normalizeLoreQuestionCode(value) {
  const s = String(value || '')
    .trim()
    .toUpperCase();
  return s.length > 0 ? s : null;
}

function normalizeChapitreSlug(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s.length > 0 ? s : null;
}

function parseCsvQuery(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const LORE_QUESTION_SELECT = `
  SELECT question_code, chapitre_slug, categorie_slug, numero_dans_categorie, tier_lore, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
         notes_pedagogiques, source_lore, tags, mots_cles, statut,
         feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
    FROM gl_qcm_lore_questions
`;

async function enrichLoreQuestionWithGlossary(questionRow, glossaryByKey) {
  if (!questionRow) return [];
  return matchLoreGlossaryTermsForText(combineLoreQcmKeywords(questionRow), glossaryByKey);
}

module.exports = {
  parseId,
  resolveLoreSettings,
  normalizeLoreQuestionCode,
  normalizeChapitreSlug,
  parseCsvQuery,
  LORE_QUESTION_SELECT,
  enrichLoreQuestionWithGlossary,
};
