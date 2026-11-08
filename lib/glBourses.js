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
 *
 * **Réserve de la caravane** (E4, équilibrage du 7 novembre 2026, migration 338) : un gain qui
 * dépasserait le plafond d'un élève n'est plus perdu — quand l'appelant donne `reserveTeamId`,
 * le surplus va à la réserve de son équipe (`gl_game_team_reserves`, par partie, dans la
 * ressource qui déborde, donc celle du peuple). La réserve paie en premier le pot des sorts
 * (`debitReserveTx`, cause `reserve_sortie`) et s'éteint au Seuil (`reserve_seuil`). Chaque
 * mouvement de réserve est une ligne du livre `kind = 'reserve'` (`team_id`, `player_id` =
 * origine du surplus ou nul) : la somme du livre vaut les bourses **plus** les réserves.
 * Les dons et échanges du Marché n'alimentent jamais la réserve (règle § 9 : le surplus d'un
 * don reste au donneur).
 */

const { normalizeVitalityCap, parseVitalityDelta, applyDeltaWithCap } = require('./glVitality');

/** Causes admises (enum de `gl_resource_ledger.cause`, migrations 334 et 338). */
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
  'reserve_entree',
  'reserve_sortie',
  'reserve_seuil',
]);

/** Causes des lignes de réserve (`kind = 'reserve'`). */
const RESERVE_CAUSES = Object.freeze(['reserve_entree', 'reserve_sortie', 'reserve_seuil']);

function normalizeCause(cause) {
  const c = String(cause || '').trim();
  return CAUSES.includes(c) ? c : 'defaut';
}

function isMissingTable(err) {
  return err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE';
}

function isUnknownColumn(err) {
  return err?.errno === 1054 || err?.code === 'ER_BAD_FIELD_ERROR';
}

/**
 * Ligne du livre. `kind = 'reserve'` : `team_id` obligatoire, `player_id` facultatif, soldes
 * après = soldes de la réserve. Base en retard de migration : la bourse est écrite, le livre
 * attendra (table 334 absente) ; colonnes 338 absentes → ligne « bourse » sans `kind`.
 */
async function insertLedgerRow(
  tx,
  { gameId, playerId, teamId = null, kind = 'bourse', dh, dg, health, power, cause, eventId },
) {
  const base = [
    gameId != null ? Number(gameId) : null,
    playerId != null ? Number(playerId) : null,
    dh,
    dg,
    health,
    power,
    normalizeCause(cause),
    eventId != null ? Number(eventId) : null,
  ];
  try {
    const inserted = await tx.execute(
      `INSERT INTO gl_resource_ledger
         (game_id, player_id, kind, team_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause, event_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        base[0],
        base[1],
        kind === 'reserve' ? 'reserve' : 'bourse',
        teamId != null ? Number(teamId) : null,
        ...base.slice(2),
      ],
    );
    return Number(inserted?.insertId) || null;
  } catch (err) {
    if (isMissingTable(err)) return null;
    if (!isUnknownColumn(err) || kind === 'reserve') throw err;
    const inserted = await tx.execute(
      `INSERT INTO gl_resource_ledger
         (game_id, player_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause, event_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      base,
    );
    return Number(inserted?.insertId) || null;
  }
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
 * @param {number|null} [p.reserveTeamId] E4 : équipe dont la réserve reçoit le surplus d'un
 *   gain rogné par le plafond (`null` = surplus perdu, comportement d'avant la migration 338)
 * @returns {Promise<{ playerId, health, power, dhApplied, dgApplied, healthCapped, powerCapped, ledgerId, reserve }>}
 */
async function applyBourseDeltaTx(
  tx,
  {
    gameId = null,
    playerId,
    dh = 0,
    dg = 0,
    cause = 'defaut',
    eventId = null,
    caps = null,
    reserveTeamId = null,
  },
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
    ledgerId = await insertLedgerRow(tx, {
      gameId,
      playerId,
      dh: dhApplied,
      dg: dgApplied,
      health,
      power,
      cause,
      eventId,
    });
  }
  // E4 : surplus d'un gain au plafond → réserve de la caravane de l'équipe.
  const surplusH = wantedDh > 0 ? wantedDh - dhApplied : 0;
  const surplusG = wantedDg > 0 ? wantedDg - dgApplied : 0;
  let reserve = null;
  if (reserveTeamId != null && gameId != null && (surplusH > 0 || surplusG > 0)) {
    reserve = await creditReserveTx(tx, {
      gameId,
      teamId: reserveTeamId,
      dh: surplusH,
      dg: surplusG,
      cause: 'reserve_entree',
      eventId,
      playerId,
    });
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
    reserve,
  };
}

/** Ligne de réserve verrouillée (créée à zéro si absente). `null` si la table manque. */
async function lockReserveRow(tx, gameId, teamId) {
  try {
    await tx.execute(
      `INSERT IGNORE INTO gl_game_team_reserves (game_id, team_id, reserve_health, reserve_power, updated_at)
       VALUES (?, ?, 0, 0, NOW())`,
      [gameId, teamId],
    );
    return await tx.queryOne(
      'SELECT reserve_health, reserve_power FROM gl_game_team_reserves WHERE game_id = ? AND team_id = ? LIMIT 1 FOR UPDATE',
      [gameId, teamId],
    );
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/**
 * Mouvement de réserve (positif = entrée, négatif = sortie, jamais sous zéro). Écrit la ligne
 * du livre `kind = 'reserve'`. Renvoie les soldes après et les deltas réellement appliqués.
 */
async function moveReserveTx(
  tx,
  { gameId, teamId, dh = 0, dg = 0, cause, eventId = null, playerId = null },
) {
  const row = await lockReserveRow(tx, gameId, teamId);
  if (!row) return null;
  const beforeH = Math.max(0, Number(row.reserve_health) || 0);
  const beforeP = Math.max(0, Number(row.reserve_power) || 0);
  const health = Math.max(0, beforeH + parseVitalityDelta(dh));
  const power = Math.max(0, beforeP + parseVitalityDelta(dg));
  const dhApplied = health - beforeH;
  const dgApplied = power - beforeP;
  if (dhApplied === 0 && dgApplied === 0) {
    return { teamId: Number(teamId), health, power, dhApplied: 0, dgApplied: 0, ledgerId: null };
  }
  await tx.execute(
    'UPDATE gl_game_team_reserves SET reserve_health = ?, reserve_power = ?, updated_at = NOW() WHERE game_id = ? AND team_id = ?',
    [health, power, gameId, teamId],
  );
  const ledgerId = await insertLedgerRow(tx, {
    gameId,
    playerId,
    teamId,
    kind: 'reserve',
    dh: dhApplied,
    dg: dgApplied,
    health,
    power,
    cause: RESERVE_CAUSES.includes(String(cause)) ? cause : 'reserve_entree',
    eventId,
  });
  return { teamId: Number(teamId), health, power, dhApplied, dgApplied, ledgerId };
}

/** Entrée en réserve (surplus au plafond). */
function creditReserveTx(
  tx,
  { gameId, teamId, dh = 0, dg = 0, cause = 'reserve_entree', eventId = null, playerId = null },
) {
  return moveReserveTx(tx, {
    gameId,
    teamId,
    dh: Math.max(0, parseVitalityDelta(dh)),
    dg: Math.max(0, parseVitalityDelta(dg)),
    cause,
    eventId,
    playerId,
  });
}

/** Sortie de réserve (pot d'un sort, Seuil) : bornée au solde ; renvoie ce qui a été pris. */
function debitReserveTx(
  tx,
  { gameId, teamId, dh = 0, dg = 0, cause = 'reserve_sortie', eventId = null },
) {
  return moveReserveTx(tx, {
    gameId,
    teamId,
    dh: -Math.max(0, parseVitalityDelta(dh)),
    dg: -Math.max(0, parseVitalityDelta(dg)),
    cause,
    eventId,
  });
}

/** Réserve d'une équipe (lecture ; `{ health: 0, power: 0 }` si aucune ligne). */
async function loadReserve(db, gameId, teamId) {
  try {
    const row = await db.queryOne(
      'SELECT reserve_health, reserve_power FROM gl_game_team_reserves WHERE game_id = ? AND team_id = ? LIMIT 1',
      [gameId, teamId],
    );
    return {
      teamId: Number(teamId),
      health: Math.max(0, Number(row?.reserve_health) || 0),
      power: Math.max(0, Number(row?.reserve_power) || 0),
    };
  } catch (err) {
    if (isMissingTable(err)) return { teamId: Number(teamId), health: 0, power: 0 };
    throw err;
  }
}

/** Réserves de toutes les équipes d'une partie (équipes sans ligne : zéro). */
async function listReserves(db, gameId) {
  const teams = await db.queryAll('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id ASC', [
    gameId,
  ]);
  let rows = [];
  try {
    rows = await db.queryAll(
      'SELECT team_id, reserve_health, reserve_power FROM gl_game_team_reserves WHERE game_id = ?',
      [gameId],
    );
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  const byTeam = new Map(rows.map((r) => [Number(r.team_id), r]));
  return teams.map((t) => {
    const r = byTeam.get(Number(t.id));
    return {
      teamId: Number(t.id),
      health: Math.max(0, Number(r?.reserve_health) || 0),
      power: Math.max(0, Number(r?.reserve_power) || 0),
    };
  });
}

/** Lignes du livre d'une partie (prof / simulation), plus récentes en premier. */
async function listLedger(db, { gameId, playerId = null, limit = 500 } = {}) {
  const where = ['game_id = ?'];
  const params = [gameId];
  if (playerId != null) {
    where.push('player_id = ?');
    params.push(playerId);
  }
  const bound = Math.max(1, Math.min(5000, Number(limit) || 500));
  let rows;
  try {
    rows = await db.queryAll(
      `SELECT id, game_id, player_id, kind, team_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause, event_id, created_at
         FROM gl_resource_ledger WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${bound}`,
      params,
    );
  } catch (err) {
    if (!isUnknownColumn(err)) throw err;
    rows = await db.queryAll(
      `SELECT id, game_id, player_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause, event_id, created_at
         FROM gl_resource_ledger WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${bound}`,
      params,
    );
  }
  return rows.map((r) => ({
    id: Number(r.id),
    gameId: r.game_id != null ? Number(r.game_id) : null,
    playerId: r.player_id != null ? Number(r.player_id) : null,
    kind: r.kind === 'reserve' ? 'reserve' : 'bourse',
    teamId: r.team_id != null ? Number(r.team_id) : null,
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

module.exports = {
  CAUSES,
  RESERVE_CAUSES,
  normalizeCause,
  applyBourseDeltaTx,
  creditReserveTx,
  debitReserveTx,
  loadReserve,
  listReserves,
  listLedger,
  sumLedgerByCause,
};
