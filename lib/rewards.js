'use strict';

/**
 * Badges génériques (ludification). Le catalogue et les règles vivent ici, jamais dans le front :
 * une nouvelle source (tâches, observations…) ajoute ses règles sans toucher au schéma.
 */

const { queryAll, queryOne, execute } = require('../database');

const REWARD_CATALOGUE = Object.freeze([
  {
    key: 'session_first',
    emoji: '🌱',
    title: 'Première séance',
    description: 'Tu as terminé ta première séance.',
  },
  {
    key: 'session_three',
    emoji: '🌿',
    title: 'Explorateur',
    description: 'Tu as terminé trois séances différentes.',
  },
  {
    key: 'session_replay',
    emoji: '🔁',
    title: 'Encore une fois',
    description: 'Tu as refait une séance déjà terminée.',
  },
  {
    key: 'session_lycee',
    emoji: '🌳',
    title: 'Niveau lycée',
    description: 'Tu as terminé une séance de niveau lycée.',
  },
]);

const CATALOGUE_BY_KEY = new Map(REWARD_CATALOGUE.map((r) => [r.key, r]));

function toIsoOrNull(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function describeReward(key, awardedAt = null) {
  const entry = CATALOGUE_BY_KEY.get(key);
  if (!entry) return null;
  return { ...entry, awardedAt: toIsoOrNull(awardedAt) };
}

/**
 * Règles pures : badges mérités après une fin de séance.
 * @param {{ completionCount: number, distinctCompleted: number, level?: string }} facts
 * @returns {string[]}
 */
function sessionRewardKeysFor(facts) {
  const keys = [];
  const distinct = Number(facts?.distinctCompleted) || 0;
  if (distinct >= 1) keys.push('session_first');
  if (distinct >= 3) keys.push('session_three');
  if ((Number(facts?.completionCount) || 0) >= 2) keys.push('session_replay');
  if (facts?.level === 'lycee') keys.push('session_lycee');
  return keys;
}

/** Attribue un badge ; renvoie true seulement s'il vient d'être obtenu. */
async function awardReward(userId, key, source = {}) {
  if (!CATALOGUE_BY_KEY.has(key)) return false;
  const result = await execute(
    `INSERT IGNORE INTO user_rewards (user_id, reward_key, source_type, source_ref, awarded_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [userId, key, source.type || null, source.ref || null],
  );
  return Number(result?.affectedRows) > 0;
}

/**
 * Évalue les badges après une fin de séance. Renvoie uniquement les badges nouvellement obtenus.
 * @param {string} userId
 * @param {{ run: { sessionId: string, completionCount: number }, level?: string }} ctx
 */
async function evaluateSessionRewards(userId, { run, level } = {}) {
  if (!userId || !run) return [];
  const row = await queryOne(
    `SELECT COUNT(*) AS n FROM pedago_session_runs WHERE user_id = ? AND completion_count > 0`,
    [userId],
  );
  const keys = sessionRewardKeysFor({
    completionCount: run.completionCount,
    distinctCompleted: Number(row?.n) || 0,
    level,
  });
  const awarded = [];
  for (const key of keys) {
    if (await awardReward(userId, key, { type: 'pedago_session', ref: run.sessionId })) {
      awarded.push(describeReward(key, new Date()));
    }
  }
  return awarded;
}

async function listRewardsForUser(userId) {
  const rows = await queryAll(
    `SELECT reward_key, awarded_at FROM user_rewards WHERE user_id = ? ORDER BY awarded_at ASC`,
    [userId],
  );
  return rows.map((r) => describeReward(r.reward_key, r.awarded_at)).filter(Boolean);
}

module.exports = {
  REWARD_CATALOGUE,
  describeReward,
  sessionRewardKeysFor,
  awardReward,
  evaluateSessionRewards,
  listRewardsForUser,
};
