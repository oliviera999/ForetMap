'use strict';

/**
 * « Tenir à deux » v2 — Olu commentateur (spec § 13) : table événement du journal → `moment`
 * des lignes d'Olu (`gl_tenir_olu_lignes`). Servie au client par `GET /tenir/olu` (`moments`),
 * qui tire une ligne par moment et substitue `{equipe}`, `{n}`, `{biome}`. Les lignes
 * `moment = oiseau` se disent après l'animation de l'oiseau ; Olu se fige pendant.
 */

const EVENT_MOMENTS = Object.freeze({
  tour_ouvert: 'ouverture',
  dice_roll: 'jet',
  avance_libre: 'jet',
  relance_bonus: 'question',
  qcm_answer: 'question',
  fouille: 'fouille',
  page_trouvee: 'fouille',
  page_reparee: 'fouille',
  page_revelee: 'fouille',
  page_lue: 'tenir',
  page_tenue: 'tenir',
  carnet_complet: 'tenir',
  voile_avance: 'voile',
  voile_dort: 'voile',
  voile_recul: 'voile',
  spell_cast: 'sort',
  spell_effect: 'sort',
  spell_file: 'sort',
  seuil_clos: 'seuil',
  honneur: 'seuil',
  peripetie: 'peripetie',
  chimere_validee: 'bestiaire',
  chapardeur: 'oiseau',
  nid_rendu: 'oiseau',
  // E5 : dit à l'écran de l'équipe concernée seulement (le client filtre sur `teamId`).
  olu_bourse_pleine: 'bourse_pleine',
});

/** Moment d'un type d'événement, ou `null` (Olu se tait). */
function momentForEvent(eventType) {
  return EVENT_MOMENTS[String(eventType || '')] || null;
}

/** Substitue `{equipe}`, `{n}`, `{biome}` (pur, partagé avec le client via `moments`). */
function renderOluLine(texte, vars = {}) {
  return String(texte || '').replace(/\{(equipe|n|biome)\}/g, (m, key) =>
    vars[key] != null && vars[key] !== '' ? String(vars[key]) : m,
  );
}

/**
 * E5 — « Vos bourses débordent » : quand au moins `seuil` membres d'une équipe sont au
 * plafond de leur ressource du peuple, Olu le dit **une fois par séance** à l'écran d'équipe
 * (événement `olu_bourse_pleine`, privé, filtré sur l'équipe côté client ; jamais en
 * projection). Idempotent par (partie, tour, équipe) grâce à `gl_game_tenir_effets`.
 * @returns {Promise<object|null>} l'événement inséré, ou `null`
 */
async function signalerBoursePleineSiBesoin(
  db,
  { gameId, teamId, teamType, roundNumber, resolved, actorId = null, seuil = 3 },
) {
  if (!gameId || !teamId || !roundNumber) return null;
  if (resolved?.olu_bourse_pleine === false) return null;
  const { resourceOfPeople } = require('./glTenir');
  const resource = resourceOfPeople(teamType);
  const cap = Number(
    resource === 'power' ? resolved?.max_power_points : resolved?.max_health_points,
  );
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const rows = await db.queryAll(
    `SELECT p.health_points, p.power_points FROM gl_team_members tm
       INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ? AND tm.team_id = ?`,
    [gameId, teamId],
  );
  const auPlafond = rows.filter(
    (r) => Number(resource === 'power' ? r.power_points : r.health_points) >= cap,
  ).length;
  if (auPlafond < seuil) return null;
  const deja = await db.queryOne(
    `SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND kind = 'olu_bourse_pleine' AND team_id = ? LIMIT 1`,
    [gameId, roundNumber, teamId],
  );
  if (deja) return null;
  await db.execute(
    `INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, team_id, payload_json, created_at)
     VALUES (?, ?, 'olu_bourse_pleine', ?, ?, NOW())`,
    [gameId, roundNumber, teamId, JSON.stringify({ auPlafond })],
  );
  const { insertGameEvent } = require('./glGameEvents');
  return insertGameEvent(db, {
    gameId,
    teamId,
    actorType: 'system',
    actorId: actorId != null ? String(actorId) : null,
    eventType: 'olu_bourse_pleine',
    payload: {
      roundNumber: Number(roundNumber),
      teamId: Number(teamId),
      auPlafond,
      private: true,
      publicKeys: ['roundNumber', 'teamId'],
    },
  });
}

module.exports = { EVENT_MOMENTS, momentForEvent, renderOluLine, signalerBoursePleineSiBesoin };
