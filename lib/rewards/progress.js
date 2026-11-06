'use strict';

/**
 * Progression vers le palier suivant, vitrine des professeurs et badges manuels.
 *
 *  - `buildRewardProgress(userId)` : badges obtenus, valeur actuelle, palier atteint, seuil
 *    suivant et reste à faire de chaque badge automatique (« encore 3 tâches de jardinage
 *    pour 🌼 Fleur ») ;
 *  - `buildGroupShowcase(students)` : élèves × familles (nombre de paliers), et « Qui est
 *    proche d'un palier ? » (à 1 du seuil). **Aucun classement** : ordre alphabétique ;
 *  - `awardManualReward(…)` : badge décerné par un adulte (`manuel.<type>.<n>`, `n`
 *    incrémenté), avec un mot obligatoire, journalisé.
 */

const database = require('../../database');
const { logAudit } = require('../auditLog');
const {
  REWARD_CATALOGUE,
  REWARD_FAMILIES,
  REWARD_TIERS,
  MANUAL_REWARD_TYPES,
  CATALOGUE_BY_KEY,
  parseRewardKey,
  publicCatalogueEntry,
} = require('./catalog');
const { computeRewardValues, describeReward, isRewardEligibleStudent } = require('./evaluator');

const NOTE_MAX = 280;
/** Distance au seuil retenue par « Qui est proche d'un palier ? ». */
const NEAR_THRESHOLD_GAP = 1;

/** Catalogue public complet (paliers inclus), familles et paliers. */
function publicCatalogue() {
  return {
    catalogue: REWARD_CATALOGUE.map(publicCatalogueEntry),
    families: REWARD_FAMILIES,
    tiers: REWARD_TIERS,
  };
}

async function listStoredRewards(userId, db = database) {
  const rows = await db.queryAll(
    `SELECT reward_key, awarded_at, note, seen_at FROM user_rewards
      WHERE user_id = ? ORDER BY awarded_at ASC, reward_key ASC`,
    [userId],
  );
  return rows
    .map((r) =>
      describeReward(r.reward_key, r.awarded_at, { note: r.note || null, seen: r.seen_at != null }),
    )
    .filter(Boolean);
}

/** Palier enregistré le plus haut par badge de base. */
function storedTierByBase(rewards) {
  const out = new Map();
  for (const r of rewards || []) {
    if (!r.tier) continue;
    out.set(r.baseKey, Math.max(out.get(r.baseKey) || 0, r.tier));
  }
  return out;
}

/**
 * Progression d'un compte.
 * @returns {Promise<{ rewards: object[], progress: Array<{ key: string, family: string,
 *   value: number, tier: number, nextTier: number|null, nextThreshold: number|null,
 *   remaining: number|null }> }>}
 */
async function buildRewardProgress(userId, { db = database } = {}) {
  const rewards = await listStoredRewards(userId, db);
  const storedTiers = storedTierByBase(rewards);
  const storedKeys = new Set(rewards.map((r) => r.key));
  const eligible = await isRewardEligibleStudent(userId, db);
  const values = await computeRewardValues(userId, { eligible, db });
  const progress = values.map(({ entry, value, reached }) => {
    const thresholds = entry.tiers || [1];
    // Un palier obtenu ne se perd pas : le palier affiché est le plus haut des deux.
    const stored = entry.tiers
      ? storedTiers.get(entry.key) || 0
      : storedKeys.has(entry.key)
        ? 1
        : 0;
    const tier = Math.max(reached, stored);
    const nextThreshold = tier < thresholds.length ? thresholds[tier] : null;
    return {
      key: entry.key,
      family: entry.family,
      value,
      tier,
      nextTier: nextThreshold == null ? null : tier + 1,
      nextThreshold,
      remaining: nextThreshold == null ? null : Math.max(0, nextThreshold - value),
    };
  });
  return { rewards, progress };
}

/** Nombre de paliers / badges obtenus par famille. */
function countByFamily(rewards) {
  const out = Object.fromEntries(REWARD_FAMILIES.map((f) => [f.key, 0]));
  for (const r of rewards || []) {
    if (Object.prototype.hasOwnProperty.call(out, r.family)) out[r.family] += 1;
  }
  return out;
}

/** Badges à `NEAR_THRESHOLD_GAP` du palier suivant. */
function nearThresholds(progress) {
  return (progress || [])
    .filter((p) => p.remaining != null && p.remaining > 0 && p.remaining <= NEAR_THRESHOLD_GAP)
    .map(({ key, value, nextThreshold, nextTier, remaining }) => ({
      key,
      title: CATALOGUE_BY_KEY.get(key)?.title || key,
      emoji: CATALOGUE_BY_KEY.get(key)?.emoji || '',
      value,
      nextThreshold,
      nextTier,
      remaining,
    }));
}

function studentLabel(row) {
  const dn = String(row.display_name || '').trim();
  if (dn) return dn;
  return `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim();
}

/**
 * Vitrine d'un ensemble d'élèves (déjà filtrés sur le périmètre de l'appelant).
 * Tri alphabétique — jamais par nombre de badges.
 * @param {string[]} studentIds
 */
async function buildGroupShowcase(studentIds, { db = database } = {}) {
  const ids = [...new Set((studentIds || []).map(String))];
  if (!ids.length) return { students: [], near: [] };
  const rows = await db.queryAll(
    `SELECT id, first_name, last_name, display_name FROM users
      WHERE id IN (${ids.map(() => '?').join(',')}) AND user_type = 'student' AND is_active = 1`,
    ids,
  );
  const students = [];
  const near = [];
  for (const row of rows) {
    const { rewards, progress } = await buildRewardProgress(row.id, { db });
    const label = studentLabel(row);
    students.push({
      id: row.id,
      name: label,
      families: countByFamily(rewards),
      total: rewards.length,
    });
    for (const item of nearThresholds(progress))
      near.push({ studentId: row.id, name: label, ...item });
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  students.sort(byName);
  near.sort((a, b) => byName(a, b) || a.key.localeCompare(b.key));
  return { students, near };
}

class RewardAwardError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Décerne un badge manuel. Le contrôle de permission (`rewards.award`) et de périmètre est
 * fait par la route.
 * @param {{ studentId: string, type: string, note: string, awardedBy: string|null, req?: object }} input
 * @returns {Promise<object>} badge décrit
 */
async function awardManualReward({ studentId, type, note, awardedBy, req = null }, db = database) {
  const kind = String(type || '').trim();
  if (!MANUAL_REWARD_TYPES.includes(kind)) {
    throw new RewardAwardError(
      400,
      `Type de badge inconnu (valeurs : ${MANUAL_REWARD_TYPES.join(', ')})`,
    );
  }
  const text = String(note ?? '').trim();
  if (!text) throw new RewardAwardError(400, 'Un mot pour l’élève est obligatoire');
  if (text.length > NOTE_MAX) {
    throw new RewardAwardError(400, `Le mot est limité à ${NOTE_MAX} caractères`);
  }
  const base = `manuel.${kind}`;
  const key = await db.withTransaction(async (tx) => {
    const rows = await tx.queryAll(
      'SELECT reward_key FROM user_rewards WHERE user_id = ? AND reward_key LIKE ? FOR UPDATE',
      [studentId, `${base}.%`],
    );
    const max = rows.reduce(
      (m, r) => Math.max(m, parseRewardKey(r.reward_key)?.occurrence || 0),
      0,
    );
    const next = `${base}.${max + 1}`;
    await tx.execute(
      `INSERT INTO user_rewards (user_id, reward_key, source_type, source_ref, awarded_at,
                                 awarded_by_user_id, note)
       VALUES (?, ?, 'manual', NULL, NOW(), ?, ?)`,
      [studentId, next, awardedBy || null, text],
    );
    return next;
  });
  logAudit('reward_award', 'user', studentId, `Badge décerné : ${key}`, {
    req,
    payload: { reward_key: key, type: kind },
  });
  return describeReward(key, new Date(), { note: text, seen: false });
}

/** Marque comme vues les annonces de badges d'un compte ; renvoie le nombre de lignes. */
async function markRewardsSeen(userId, db = database) {
  const result = await db.execute(
    'UPDATE user_rewards SET seen_at = NOW() WHERE user_id = ? AND seen_at IS NULL',
    [userId],
  );
  return Number(result?.affectedRows) || 0;
}

module.exports = {
  NOTE_MAX,
  NEAR_THRESHOLD_GAP,
  RewardAwardError,
  publicCatalogue,
  buildRewardProgress,
  countByFamily,
  nearThresholds,
  buildGroupShowcase,
  awardManualReward,
  markRewardsSeen,
};
