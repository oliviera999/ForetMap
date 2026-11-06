'use strict';

/**
 * Évaluateur des badges automatiques.
 *
 * `evaluateUser(userId, { families?, source?, dryRun? })` calcule les mesures de l'élève,
 * en déduit les paliers atteints et insère (`INSERT IGNORE`) ceux qui manquent, avec
 * `source_type` / `source_ref` (ex. `task` + identifiant de la tâche qui a fait franchir le
 * seuil quand il est connu, sinon `backfill`). Il renvoie les badges **nouvellement**
 * obtenus.
 *
 *  - un badge n'est **jamais retiré**, même si une tâche est ensuite dévalidée ;
 *  - seuls les comptes élèves au profil n3beur reçoivent les badges de tâches, de projets,
 *    de savoirs et du collectif : ni personnels, ni visiteurs. Les badges de séance gardent
 *    leur règle historique (tout compte qui termine une séance) ;
 *  - l'attribution ne dépend pas de l'interrupteur `ui.modules.rewards_enabled` : module
 *    éteint, les badges sont enregistrés en silence (décision du 25/09/2026) ;
 *  - `scheduleRewardsEvaluation` ne fait jamais échouer l'action qui l'a déclenchée : erreur
 *    journalisée (Pino), la passe de nuit rattrape.
 */

const database = require('../../database');
const logger = require('../logger');
const { isN3beurTierSlug } = require('../shared/n3beurRolesCore');
const {
  REWARD_CATALOGUE,
  CATALOGUE_BY_KEY,
  tierRewardKey,
  tierReached,
  parseRewardKey,
} = require('./catalog');
const { createMetricContext } = require('./metrics');

/** Familles réservées aux comptes élèves au profil n3beur. */
const STUDENT_ONLY_FAMILIES = Object.freeze(
  new Set(['metiers', 'engagement', 'projet', 'polyvalence', 'nature', 'temps', 'collectif']),
);
const SOURCE_TYPE_MAX = 32;
const SOURCE_REF_MAX = 64;

function toIsoOrNull(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Badge décrit pour l'API : entrée du catalogue + palier / occurrence + date.
 * @returns {null|object}
 */
function describeReward(key, awardedAt = null, extra = {}) {
  const parsed = parseRewardKey(key);
  if (!parsed) return null;
  const { metric: _metric, ...entry } = parsed.entry;
  return {
    ...entry,
    key,
    baseKey: entry.key,
    tier: parsed.tier,
    occurrence: parsed.occurrence,
    awardedAt: toIsoOrNull(awardedAt),
    ...extra,
  };
}

/**
 * Le compte peut-il recevoir les badges réservés aux élèves ? Compte élève actif dont le
 * profil effectif est un palier n3beur (`n3beurRolesCore`).
 */
async function isRewardEligibleStudent(userId, db = database) {
  const user = await db.queryOne(
    'SELECT id, user_type, is_active FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  if (!user || String(user.user_type) !== 'student' || Number(user.is_active) === 0) return false;
  const { resolveEffectiveRole } = require('../effectiveRole');
  const resolved = await resolveEffectiveRole(userId);
  const role = resolved?.decision?.role;
  return Boolean(role && isN3beurTierSlug(role.slug, role.rank));
}

/** Insère un badge ; vrai seulement s'il vient d'être obtenu. */
async function insertReward(db, userId, key, source = {}) {
  const result = await db.execute(
    `INSERT IGNORE INTO user_rewards (user_id, reward_key, source_type, source_ref, awarded_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [
      userId,
      key,
      source.type ? String(source.type).slice(0, SOURCE_TYPE_MAX) : null,
      source.ref ? String(source.ref).slice(0, SOURCE_REF_MAX) : null,
    ],
  );
  return Number(result?.affectedRows) > 0;
}

/**
 * Attribue un badge d'événement (fresque…) ou une clé déjà calculée, par le même chemin
 * d'insertion que l'évaluateur. Vrai seulement s'il vient d'être obtenu.
 */
async function awardReward(userId, key, source = {}, db = database) {
  if (!userId || !parseRewardKey(key)) return false;
  return insertReward(db, userId, key, source);
}

/**
 * Valeurs des badges automatiques d'un élève (sans rien écrire).
 * @returns {Promise<Array<{ entry: object, value: number, reached: number }>>}
 */
async function computeRewardValues(
  userId,
  { families = null, eligible = true, db = database } = {},
) {
  const ctx = createMetricContext(db, userId);
  const out = [];
  for (const entry of REWARD_CATALOGUE) {
    if (entry.source !== 'auto' || !entry.metric) continue;
    if (families && !families.includes(entry.family)) continue;
    if (!eligible && STUDENT_ONLY_FAMILIES.has(entry.family)) continue;
    const value = await ctx.value(entry.metric);
    out.push({ entry, value, reached: tierReached(entry, value) });
  }
  return out;
}

/**
 * Évalue un compte et attribue les paliers manquants.
 * @param {string} userId
 * @param {{ families?: string[], source?: { type?: string, ref?: string },
 *           dryRun?: boolean, db?: object }} [options]
 * @returns {Promise<object[]>} badges nouvellement obtenus (dry-run : ceux qui le seraient)
 */
async function evaluateUser(
  userId,
  { families = null, source = null, dryRun = false, db = database } = {},
) {
  const id = String(userId || '').trim();
  if (!id) return [];
  const eligible = await isRewardEligibleStudent(id, db);
  const values = await computeRewardValues(id, { families, eligible, db });
  if (!values.length) return [];
  const existingRows = await db.queryAll('SELECT reward_key FROM user_rewards WHERE user_id = ?', [
    id,
  ]);
  const existing = new Set(existingRows.map((r) => r.reward_key));
  const effectiveSource = source && source.type ? source : { type: 'backfill', ref: null };
  const awarded = [];
  for (const { entry, reached } of values) {
    for (let n = 1; n <= reached; n += 1) {
      const key = tierRewardKey(entry, n);
      if (existing.has(key)) continue;
      const fresh = dryRun ? true : await insertReward(db, id, key, effectiveSource);
      if (fresh) awarded.push(describeReward(key, new Date()));
    }
  }
  return awarded;
}

/**
 * Évaluation « lancée sans attendre » après une action (validation de tâche, quiz…) :
 * chaque compte est évalué puis annoncé (notification regroupée, module allumé) ; une
 * erreur est journalisée et n'interrompt jamais l'action appelante.
 * @param {string[]} userIds
 * @param {{ source?: object, families?: string[], reason?: string }} [options]
 * @returns {Promise<void>}
 */
function scheduleRewardsEvaluation(userIds, options = {}) {
  const ids = [...new Set((userIds || []).map((u) => String(u || '').trim()).filter(Boolean))];
  if (!ids.length) return Promise.resolve();
  const run = async () => {
    const { announceRewards } = require('./announce');
    for (const id of ids) {
      try {
        const awarded = await evaluateUser(id, options);
        if (awarded.length) await announceRewards(id, awarded);
      } catch (err) {
        logger.error(
          { err, userId: id, reason: options.reason || null },
          'rewards_evaluation_failed',
        );
      }
    }
  };
  return new Promise((resolve) => {
    setImmediate(() => {
      run().finally(resolve);
    });
  });
}

module.exports = {
  STUDENT_ONLY_FAMILIES,
  describeReward,
  isRewardEligibleStudent,
  awardReward,
  computeRewardValues,
  evaluateUser,
  scheduleRewardsEvaluation,
  CATALOGUE_BY_KEY,
};
