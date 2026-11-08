'use strict';

/**
 * Gnomes & Licornes — rattrapage des badges hérités : convertit `gl_player_badges`
 * (13 badges plats, un seul niveau, table héritée en lecture seule) en paliers équivalents de
 * `gl_player_rewards`, puis évalue chaque joueur sur le moteur commun. Idempotent
 * (`INSERT IGNORE`), `dryRun` ne touche rien. Aucune donnée d'élève dans les journaux.
 */

const database = require('../database');
const { glRewards } = require('./glRewards');
const { evaluateManyGl, listAllGlPlayerIds } = require('./glRewardsBatch');

const T = glRewards.store.table;
const OWNER = glRewards.store.ownerColumn;

/** Badge hérité → `[clé de base, palier]` (palier absent : badge décerné `manuel.<type>`). */
const LEGACY_MAP = Object.freeze({
  premiere_page: ['chasse.pages', 1],
  lecteur: ['lecture.pages', 2],
  fouilleur: ['chasse.fouilles', 1],
  mains_tendues: ['cooperation.dons', 2],
  veilleur: ['veillee.semaines', 2],
  nommeur: ['nature.especes', 2],
  cartographe: ['nature.biomes', 2],
  passeur_de_seuil: ['voyage.chapitres', 3],
  chuchoteur: ['manuel.chuchoteur'],
  correcteur_du_renard: ['manuel.renard'],
});

const LEGACY_NOTE = 'Badge repris de l’ancien carnet « Tenir à deux ».';

/** Clés à écrire pour une ligne héritée (paliers 1..n, ou `manuel.<type>` à numéroter). */
function keysForLegacy(badgeCode) {
  const mapping = LEGACY_MAP[String(badgeCode)];
  if (!mapping) return null;
  const [base, tier] = mapping;
  const entry = glRewards.CATALOGUE_BY_KEY.get(base);
  if (!entry) return null;
  if (entry.source === 'manual') return { manual: base };
  const keys = [];
  for (let n = 1; n <= (tier || 1); n += 1) keys.push(entry.tiers ? `${base}.${n}` : base);
  return { keys };
}

/**
 * Convertit les badges hérités d'un joueur.
 * @returns {Promise<{ converted: number, skipped: number }>}
 */
async function convertLegacyBadgesForPlayer(db, playerId, legacyRows, { dryRun = true } = {}) {
  const existing = new Set(
    (await db.queryAll(`SELECT reward_key FROM ${T} WHERE ${OWNER} = ?`, [playerId])).map(
      (r) => r.reward_key,
    ),
  );
  let converted = 0;
  let skipped = 0;
  for (const row of legacyRows) {
    const plan = keysForLegacy(row.badge_code);
    if (!plan) {
      skipped += 1;
      continue;
    }
    if (plan.manual) {
      // Un seul badge décerné par type repris : s'il en existe déjà un, rien à faire.
      if ([...existing].some((k) => k.startsWith(`${plan.manual}.`))) {
        skipped += 1;
        continue;
      }
      const key = `${plan.manual}.1`;
      if (!dryRun) {
        await db.execute(
          `INSERT IGNORE INTO ${T} (${OWNER}, reward_key, source_type, source_ref, awarded_at, awarded_by_user_id, note)
           VALUES (?, ?, 'legacy', ?, ?, ?, ?)`,
          [
            playerId,
            key,
            String(row.badge_code).slice(0, 64),
            row.awarded_at || new Date(),
            row.awarded_by && row.awarded_by !== 'app' ? String(row.awarded_by).slice(0, 64) : null,
            LEGACY_NOTE,
          ],
        );
      }
      existing.add(key);
      converted += 1;
      continue;
    }
    for (const key of plan.keys) {
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      if (!dryRun) {
        await db.execute(
          `INSERT IGNORE INTO ${T} (${OWNER}, reward_key, source_type, source_ref, awarded_at)
           VALUES (?, ?, 'legacy', ?, ?)`,
          [playerId, key, String(row.badge_code).slice(0, 64), row.awarded_at || new Date()],
        );
      }
      existing.add(key);
      converted += 1;
    }
  }
  return { converted, skipped };
}

/**
 * Rattrapage complet : conversion des badges hérités puis évaluation de chaque joueur actif.
 * @param {{ dryRun?: boolean, db?: object, playerIds?: string[] }} [options]
 */
async function runGlRewardsBackfill({ dryRun = true, db = database, playerIds = null } = {}) {
  const ids = playerIds || (await listAllGlPlayerIds(db));
  const summary = { dryRun, players: ids.length, legacyRows: 0, converted: 0, skipped: 0 };
  let legacy = [];
  try {
    legacy = await db.queryAll(
      'SELECT player_id, badge_code, awarded_at, awarded_by FROM gl_player_badges ORDER BY player_id, awarded_at',
    );
  } catch (err) {
    if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  const wanted = new Set(ids.map(String));
  const byPlayer = new Map();
  for (const row of legacy) {
    const pid = String(row.player_id);
    if (!wanted.has(pid)) continue;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid).push(row);
    summary.legacyRows += 1;
  }
  for (const [pid, rows] of byPlayer) {
    const r = await convertLegacyBadgesForPlayer(db, pid, rows, { dryRun });
    summary.converted += r.converted;
    summary.skipped += r.skipped;
  }
  const evaluated = await evaluateManyGl(ids, { dryRun, db });
  return { ...summary, evaluation: evaluated };
}

module.exports = {
  LEGACY_MAP,
  LEGACY_NOTE,
  keysForLegacy,
  convertLegacyBadgesForPlayer,
  runGlRewardsBackfill,
};
