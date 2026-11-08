'use strict';

/**
 * « Tenir à deux » v2 — le voile (spec § 7). Jamais personnifié : une position (rang de case)
 * par partie, −1 avant le premier dé gris. Sous le voile : fouilles à 0 (sauf Abri), pages
 * `trouvee` non lues pâlissent (sauf Abri), zones `endormie` / `revelee` de rang ≤ position
 * → `palie`. **Aucune ressource n'est jamais retirée.** Reculs : carnet complet, Lumière.
 */

const { insertGameEvent } = require('./glGameEvents');
const { teamPathIndex } = require('./shared/glBoardPathCore');
const { parseJsonColumn, resolveTenirSettings } = require('./glTenir');

/** Équipes dont le rang du pion est ≤ position du voile (pur). */
function teamsUnderVoile(state, teams, markers) {
  const position = Number(state?.voilePosition ?? state?.voile_position ?? -1);
  if (position < 0) return [];
  return (teams || []).filter((t) => {
    const idx = teamPathIndex(t, markers);
    return idx != null && idx <= position;
  });
}

function isTeamSousVoile(state, team, markers) {
  return teamsUnderVoile(state, [team], markers).length > 0;
}

/** Un Abri (sort gnome) protège-t-il l'équipe ce tour ? */
async function hasAbri(tx, gameId, roundNumber, teamId) {
  const row = await tx.queryOne(
    `SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND kind = 'abri' AND team_id = ? LIMIT 1`,
    [gameId, roundNumber, teamId],
  );
  return !!row;
}

/** Une Cordée (pacte) immunise ses deux équipes ce tour. */
async function hasCordee(tx, gameId, roundNumber, teamId) {
  const row = await tx.queryOne(
    `SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND round_number = ? AND kind = 'cordee'
        AND (team_id = ? OR source_team_id = ?) LIMIT 1`,
    [gameId, roundNumber, teamId, teamId],
  );
  return !!row;
}

/**
 * Avance du voile en phase `souffle` : `position = min(position + total, rang du camp − 1)` ;
 * pâlissement des pages trouvées non lues des équipes recouvertes ; zones recouvertes → palie.
 * @returns {Promise<Array>} événements insérés
 */
async function advanceVoileTx(
  tx,
  { gameId, roundNumber, total, bonus = 0, settings, resolved = null, game = null, actorId = null },
) {
  const gameRow =
    game ||
    (await tx.queryOne(
      `SELECT g.id, g.chapter_id, g.tenir_profil, g.tenir_overrides_json, ch.plateau_number
         FROM gl_games g LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id WHERE g.id = ? LIMIT 1`,
      [gameId],
    ));
  const settingsResolved = resolved || resolveTenirSettings(settings, gameRow);
  const markers = await tx.queryAll(
    'SELECT id, order_index FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC',
    [gameRow.chapter_id],
  );
  const state = await tx.queryOne(
    'SELECT * FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  if (!state) return [];
  if (Number(state.voile_last_roll_round) >= Number(roundNumber)) {
    // Une seule avance par tour.
    return [];
  }
  const from = Number(state.voile_position ?? -1);
  const campIndex = Math.max(0, markers.length - 1);
  const to = Math.min(from + Math.max(0, Number(total) || 0), campIndex - 1);
  const position = Math.max(from, to);
  await tx.execute(
    'UPDATE gl_game_tenir_state SET voile_position = ?, voile_last_roll_round = ?, updated_at = NOW() WHERE game_id = ?',
    [position, roundNumber, gameId],
  );
  const events = [];

  // Équipes recouvertes : pâlissement des pages trouvées non lues (sauf Abri / Cordée).
  const teams = await tx.queryAll(
    'SELECT id, type, position_marker_id FROM gl_teams WHERE game_id = ?',
    [gameId],
  );
  const under = teamsUnderVoile({ voilePosition: position }, teams, markers);
  const pct = Number(settingsResolved.palissement_pct) || 10;
  const max = Number(settingsResolved.palissement_max) || 50;
  const pagesPalies = [];
  for (const team of under) {
    if (
      (await hasAbri(tx, gameId, roundNumber, team.id)) ||
      (await hasCordee(tx, gameId, roundNumber, team.id))
    )
      continue;
    const pages = await tx.queryAll(
      `SELECT p.zone_id, p.palissement_json, z.zone_key, z.feuillet_code FROM gl_game_chasse_pages p
         INNER JOIN gl_chasse_zones z ON z.id = p.zone_id
        WHERE p.game_id = ? AND p.trouvee_par_team_id = ? AND p.etat IN ('trouvee', 'reparee')`,
      [gameId, team.id],
    );
    for (const page of pages) {
      const read = await tx.queryOne(
        `SELECT read_at FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ? LIMIT 1`,
        [gameId, team.id, page.feuillet_code],
      );
      if (read?.read_at) continue;
      const map = parseJsonColumn(page.palissement_json, {}) || {};
      const current = Number(map[String(team.id)]) || 0;
      const next = Math.min(max, current + pct);
      if (next === current) continue;
      map[String(team.id)] = next;
      await tx.execute(
        'UPDATE gl_game_chasse_pages SET palissement_json = ?, updated_at = NOW() WHERE game_id = ? AND zone_id = ?',
        [JSON.stringify(map), gameId, page.zone_id],
      );
      pagesPalies.push({ zoneKey: page.zone_key, teamId: Number(team.id), pct: next });
    }
  }

  // Zones endormies / révélées recouvertes → pâlies (réparables par les Gnomes). E3 : une zone
  // de rang < plancher est traitée comme de rang `plancher` (les zones proches du départ ne
  // pâlissent plus dès le premier dé gris) ; géométrie et rang affiché inchangés.
  const zonesPalies = [];
  const plancher = Math.max(0, Number(settingsResolved.palissement_rang_plancher) || 0);
  const recouvertes = await tx.queryAll(
    `SELECT p.zone_id, z.zone_key FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id
      WHERE p.game_id = ? AND p.etat IN ('endormie', 'revelee') AND z.rang_case IS NOT NULL
        AND GREATEST(z.rang_case, ?) <= ?`,
    [gameId, plancher, position],
  );
  for (const z of recouvertes) {
    await tx.execute(
      "UPDATE gl_game_chasse_pages SET etat = 'palie', updated_at = NOW() WHERE game_id = ? AND zone_id = ?",
      [gameId, z.zone_id],
    );
    zonesPalies.push(z.zone_key);
  }

  events.push(
    await insertGameEvent(tx, {
      gameId,
      actorType: actorId ? 'mj' : 'system',
      actorId: actorId != null ? String(actorId) : null,
      eventType: 'voile_avance',
      payload: {
        roundNumber,
        total: Number(total) || 0,
        bonus,
        from,
        to: position,
        teamsUnderVoile: under.map((t) => Number(t.id)),
        pagesPalies,
        zonesPalies,
      },
    }),
  );
  return events;
}

/** Recul du voile (carnet complet, Lumière) : jamais sous −1. */
async function retreatVoileTx(tx, { gameId, cases, reason, actorId = null }) {
  const state = await tx.queryOne(
    'SELECT voile_position FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  if (!state) return [];
  const from = Number(state.voile_position ?? -1);
  const to = Math.max(-1, from - Math.max(0, Number(cases) || 0));
  await tx.execute(
    'UPDATE gl_game_tenir_state SET voile_position = ?, updated_at = NOW() WHERE game_id = ?',
    [to, gameId],
  );
  return [
    await insertGameEvent(tx, {
      gameId,
      actorType: actorId ? 'mj' : 'system',
      actorId: actorId != null ? String(actorId) : null,
      eventType: 'voile_recul',
      payload: { cases: Number(cases) || 0, reason, from, to },
    }),
  ];
}

module.exports = {
  teamsUnderVoile,
  isTeamSousVoile,
  hasAbri,
  hasCordee,
  advanceVoileTx,
  retreatVoileTx,
};
