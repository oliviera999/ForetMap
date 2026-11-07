'use strict';

/**
 * Grand livre des ressources (« Tenir à deux », simulation du 7 novembre 2026).
 *
 * **Une seule fonction écrit les bourses** (`gl_players.health_points` / `power_points`) :
 * `applyBourseDeltaTx`. Elle verrouille la ligne, applique plafond et plancher (le plafond
 * bloque les gains, ne confisque jamais un solde déjà supérieur — cf. `lib/glVitality.js`),
 * écrit le livre `gl_resource_ledger` (delta, soldes après, cause, évènement) et renvoie le
 * delta réellement appliqué. Le test `tests/gl-bourses-ledger.test.js` échoue si un autre
 * fichier écrit ces colonnes. Le livre est privé comme les bourses : il n'est servi qu'au prof
 * et aux outils de simulation, jamais à un élève d'une autre équipe ni à la projection.
 */

const { normalizeVitalityCap, parseVitalityDelta, applyDeltaWithCap } = require('./glVitality');

/** Causes admises (enum de `gl_resource_ledger.cause`, migration 334). */
const CAUSES = Object.freeze([
  'page_tenue',
  'trame',
  'case_positive',
  'case_souffle',
  'carnet_complet',
  'sort_pot',
  'echange',
  'don',
  'parure',
  'chapardeur',
  'nid',
  'heritage',
  'reparation',
  'geste_prof',
  'migration',
  'case_plateau',
  'feuillet',
  'defaut',
]);

function normalizeCause(cause) {
  const c = String(cause || '').trim();
  return CAUSES.includes(c) ? c : 'defaut';
}

/**
 * @param {object} tx transaction `{ queryOne, execute }`
 * @param {object} p
 * @param {number|null} [p.gameId]
 * @param {number} p.playerId
 * @param {number} [p.dh] delta cœurs demandé
 * @param {number} [p.dg] delta gemmes demandé
 * @param {string} [p.cause] cause (`CAUSES`)
 * @param {number|null} [p.eventId] évènement `gl_game_events` lié
 * @param {{ maxHealth?: number, maxPower?: number }|null} [p.caps] plafonds de jeu
 * @returns {Promise<{ playerId, health, power, dhApplied, dgApplied, healthCapped, powerCapped, ledgerId }>}
 */
async function applyBourseDeltaTx(
  tx,
  { gameId = null, playerId, dh = 0, dg = 0, cause = 'defaut', eventId = null, caps = null },
) {
  const row = await tx.queryOne(
    'SELECT id, health_points, power_points FROM gl_players WHERE id = ? LIMIT 1 FOR UPDATE',
    [playerId],
  );
  if (!row) {
    const err = new Error('PLAYER_NOT_FOUND');
    err.status = 404;
    throw err;
  }
  const maxHealth = normalizeVitalityCap(caps?.maxHealth);
  const maxPower = normalizeVitalityCap(caps?.maxPower);
  const beforeHealth = Math.max(0, Number(row.health_points) || 0);
  const beforePower = Math.max(0, Number(row.power_points) || 0);
  const wantedDh = parseVitalityDelta(dh);
  const wantedDg = parseVitalityDelta(dg);
  const health = applyDeltaWithCap(beforeHealth, wantedDh, maxHealth);
  const power = applyDeltaWithCap(beforePower, wantedDg, maxPower);
  const dhApplied = health - beforeHealth;
  const dgApplied = power - beforePower;
  await tx.execute(
    'UPDATE gl_players SET health_points = ?, power_points = ?, updated_at = NOW() WHERE id = ?',
    [health, power, playerId],
  );
  let ledgerId = null;
  if (dhApplied !== 0 || dgApplied !== 0 || wantedDh !== 0 || wantedDg !== 0) {
    try {
      const inserted = await tx.execute(
        `INSERT INTO gl_resource_ledger
           (game_id, player_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause, event_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          gameId != null ? Number(gameId) : null,
          Number(playerId),
          dhApplied,
          dgApplied,
          health,
          power,
          normalizeCause(cause),
          eventId != null ? Number(eventId) : null,
        ],
      );
      ledgerId = Number(inserted?.insertId) || null;
    } catch (err) {
      // Base en retard de la migration 334 : la bourse est écrite, le livre attendra.
      if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }
  return {
    playerId: Number(playerId),
    health,
    power,
    dhApplied,
    dgApplied,
    // Gain rogné par le plafond de jeu : l'interface peut dire « tu es au maximum ».
    healthCapped: dhApplied !== wantedDh,
    powerCapped: dgApplied !== wantedDg,
    ledgerId,
  };
}

/** Lignes du livre d'une partie (prof / simulation), plus récentes en premier. */
async function listLedger(db, { gameId, playerId = null, limit = 500 } = {}) {
  const where = ['game_id = ?'];
  const params = [gameId];
  if (playerId != null) {
    where.push('player_id = ?');
    params.push(playerId);
  }
  const rows = await db.queryAll(
    `SELECT id, game_id, player_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause, event_id, created_at
       FROM gl_resource_ledger WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${Math.max(1, Math.min(5000, Number(limit) || 500))}`,
    params,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    gameId: r.game_id != null ? Number(r.game_id) : null,
    playerId: Number(r.player_id),
    deltaHealth: Number(r.delta_health) || 0,
    deltaPower: Number(r.delta_power) || 0,
    soldeHealthApres: Number(r.solde_health_apres) || 0,
    soldePowerApres: Number(r.solde_power_apres) || 0,
    cause: String(r.cause),
    eventId: r.event_id != null ? Number(r.event_id) : null,
    createdAt: r.created_at,
  }));
}

/** Somme des mouvements par cause d'une partie (comptes seulement, aucun nom). */
async function sumLedgerByCause(db, gameId) {
  const rows = await db.queryAll(
    `SELECT cause, SUM(delta_health) AS dh, SUM(delta_power) AS dg, COUNT(*) AS n
       FROM gl_resource_ledger WHERE game_id = ? GROUP BY cause ORDER BY cause`,
    [gameId],
  );
  return rows.map((r) => ({
    cause: String(r.cause),
    deltaHealth: Number(r.dh) || 0,
    deltaPower: Number(r.dg) || 0,
    count: Number(r.n) || 0,
  }));
}

module.exports = { CAUSES, normalizeCause, applyBourseDeltaTx, listLedger, sumLedgerByCause };
