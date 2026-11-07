'use strict';

/**
 * Invariants d'une partie « Tenir à deux » (simulation du 7 novembre 2026, étape 6).
 *
 * `checkTenirInvariants(snapshot)` est **pur** : il prend un instantané (bourses, équipes,
 * voile, pages, grand livre, relances) et renvoie `{ ok, violations: [{ code, message,
 * details }] }`. `loadTenirSnapshot(db, gameId, settings)` construit l'instantané depuis la base ;
 * `checkTenirInvariantsFromDb` enchaîne les deux. Le banc de simulation les rejoue à chaque
 * geste ; aucun nom d'élève ne sort (identifiants seulement).
 *
 * Codes :
 * - `BOURSE_BORNES`     : une bourse négative ou au-dessus du plafond de jeu ;
 * - `LIVRE_SOLDE`       : le dernier mouvement du livre d'un joueur ne tombe pas sur son solde ;
 * - `LIVRE_SOMME`       : solde initial + Σ mouvements ≠ solde courant (si l'initial est connu) ;
 * - `LIVRE_CAUSE`       : un mouvement sans cause admise ;
 * - `PION_HORS_PLATEAU` : un pion hors du chemin (rang < 0 ou > camp) ;
 * - `VOILE_HORS_BORNES` : voile < −1 ou ≥ rang du camp ;
 * - `PAGE_ETAT`         : état de page inconnu, page tenue sans découvreuse ou tenue par le
 *                         même peuple que la découvreuse ;
 * - `RELANCES_MAX`      : plus de relances de case par tour et par équipe que le réglage ;
 * - `GAIN_NON_DOCUMENTE`: un gain du livre dont la cause n'est pas une source de ressource
 *                         (page tenue, Trame, case positive, carnet complet, don, échange, nid,
 *                         héritage, réparation, geste du prof, migration).
 */

const { CAUSES } = require('./glBourses');

const PAGE_ETATS = new Set(['endormie', 'revelee', 'trouvee', 'tenue', 'palie', 'reparee']);
/** Causes qui peuvent créer une ressource (garde-fou § 1.5). */
const CAUSES_GAIN = new Set([
  'page_tenue',
  'trame',
  'case_positive',
  'carnet_complet',
  'don',
  'echange',
  'nid',
  'heritage',
  'reparation',
  'geste_prof',
  'migration',
  'defaut',
  'feuillet',
  'case_plateau',
]);

function peopleOf(type) {
  const t = String(type || '').toLowerCase();
  return t === 'unicorn' || t === 'licorne' ? 'unicorn' : 'gnome';
}

/**
 * @param {object} snapshot
 * @param {{ maxHealth?: number, maxPower?: number }} [snapshot.caps]
 * @param {Array<{ id, teamId?, health, power, initialHealth?, initialPower? }>} snapshot.players
 * @param {Array<{ id, type, pathIndex }>} snapshot.teams
 * @param {number} snapshot.campIndex rang du camp (dernière case)
 * @param {number} snapshot.voilePosition
 * @param {Array<{ zoneKey, etat, trouveeParTeamId, tenueParTeamId }>} [snapshot.pages]
 * @param {Array<{ playerId, deltaHealth, deltaPower, soldeHealthApres, soldePowerApres, cause }>} [snapshot.ledger] ordre chronologique
 * @param {Array<{ roundNumber, teamId, relances }>} [snapshot.relances]
 * @param {number} [snapshot.relancesMax] 0 = illimité
 */
function checkTenirInvariants(snapshot) {
  const s = snapshot || {};
  const violations = [];
  const push = (code, message, details = {}) => violations.push({ code, message, details });
  const maxHealth = Number(s.caps?.maxHealth) > 0 ? Number(s.caps.maxHealth) : null;
  const maxPower = Number(s.caps?.maxPower) > 0 ? Number(s.caps.maxPower) : null;
  const players = Array.isArray(s.players) ? s.players : [];
  const teams = Array.isArray(s.teams) ? s.teams : [];
  const teamsById = new Map(teams.map((t) => [Number(t.id), t]));

  // Bourses : plancher 0, plafond de jeu (un solde hérité au-dessus du plafond est signalé :
  // le plafond bloque les gains, il ne confisque rien, mais le banc doit le voir).
  for (const p of players) {
    const h = Number(p.health);
    const g = Number(p.power);
    if (!Number.isFinite(h) || !Number.isFinite(g) || h < 0 || g < 0) {
      push('BOURSE_BORNES', 'bourse négative ou invalide', { playerId: p.id, health: h, power: g });
    }
    if ((maxHealth != null && h > maxHealth) || (maxPower != null && g > maxPower)) {
      push('BOURSE_BORNES', 'bourse au-dessus du plafond de jeu', {
        playerId: p.id,
        health: h,
        power: g,
        maxHealth,
        maxPower,
      });
    }
  }

  // Grand livre : dernier solde = solde courant ; somme des mouvements ; causes admises.
  const ledger = Array.isArray(s.ledger) ? s.ledger : [];
  const lastByPlayer = new Map();
  const sumByPlayer = new Map();
  for (const row of ledger) {
    const pid = Number(row.playerId);
    lastByPlayer.set(pid, row);
    const acc = sumByPlayer.get(pid) || { dh: 0, dg: 0 };
    acc.dh += Number(row.deltaHealth) || 0;
    acc.dg += Number(row.deltaPower) || 0;
    sumByPlayer.set(pid, acc);
    if (!CAUSES.includes(String(row.cause))) {
      push('LIVRE_CAUSE', 'mouvement sans cause admise', { playerId: pid, cause: row.cause });
    }
    const gain = (Number(row.deltaHealth) || 0) > 0 || (Number(row.deltaPower) || 0) > 0;
    if (gain && !CAUSES_GAIN.has(String(row.cause))) {
      push('GAIN_NON_DOCUMENTE', 'gain de ressource par une cause qui ne crée rien', {
        playerId: pid,
        cause: row.cause,
      });
    }
  }
  for (const p of players) {
    const pid = Number(p.id);
    const last = lastByPlayer.get(pid);
    if (last) {
      if (
        Number(last.soldeHealthApres) !== Number(p.health) ||
        Number(last.soldePowerApres) !== Number(p.power)
      ) {
        push('LIVRE_SOLDE', 'le dernier mouvement du livre ne tombe pas sur le solde courant', {
          playerId: pid,
          livre: { health: last.soldeHealthApres, power: last.soldePowerApres },
          bourse: { health: p.health, power: p.power },
        });
      }
    }
    if (p.initialHealth != null && p.initialPower != null) {
      const sum = sumByPlayer.get(pid) || { dh: 0, dg: 0 };
      if (
        Number(p.initialHealth) + sum.dh !== Number(p.health) ||
        Number(p.initialPower) + sum.dg !== Number(p.power)
      ) {
        push('LIVRE_SOMME', 'solde initial + mouvements ≠ solde courant', {
          playerId: pid,
          initial: { health: p.initialHealth, power: p.initialPower },
          mouvements: sum,
          bourse: { health: p.health, power: p.power },
        });
      }
    }
  }

  // Plateau : pions et voile dans les bornes.
  const campIndex = Number(s.campIndex);
  if (Number.isInteger(campIndex) && campIndex >= 0) {
    for (const t of teams) {
      const idx = t.pathIndex == null ? null : Number(t.pathIndex);
      if (idx != null && (!Number.isInteger(idx) || idx < 0 || idx > campIndex)) {
        push('PION_HORS_PLATEAU', 'pion hors du chemin du plateau', {
          teamId: t.id,
          pathIndex: idx,
          campIndex,
        });
      }
    }
    const voile = Number(s.voilePosition);
    if (Number.isFinite(voile) && (voile < -1 || voile >= campIndex)) {
      push('VOILE_HORS_BORNES', 'voile hors des bornes (−1 … rang du camp − 1)', {
        voilePosition: voile,
        campIndex,
      });
    }
  }

  // Pages : état connu ; une page tenue a une découvreuse et une tenante de l'autre peuple.
  for (const page of Array.isArray(s.pages) ? s.pages : []) {
    const etat = String(page.etat || '');
    if (!PAGE_ETATS.has(etat)) {
      push('PAGE_ETAT', 'état de page inconnu', { zoneKey: page.zoneKey, etat });
      continue;
    }
    if (etat === 'tenue') {
      const d = teamsById.get(Number(page.trouveeParTeamId));
      const t = teamsById.get(Number(page.tenueParTeamId));
      if (!d || !t) {
        push('PAGE_ETAT', 'page tenue sans découvreuse ou sans tenante', {
          zoneKey: page.zoneKey,
          trouveeParTeamId: page.trouveeParTeamId,
          tenueParTeamId: page.tenueParTeamId,
        });
      } else if (peopleOf(d.type) === peopleOf(t.type)) {
        push('PAGE_ETAT', 'page tenue par le même peuple que la découvreuse', {
          zoneKey: page.zoneKey,
          trouveeParTeamId: page.trouveeParTeamId,
          tenueParTeamId: page.tenueParTeamId,
        });
      }
    }
  }

  // Relances de case : au plus `relancesMax` par équipe et par tour.
  const max = Number(s.relancesMax);
  if (Number.isInteger(max) && max > 0) {
    for (const r of Array.isArray(s.relances) ? s.relances : []) {
      if (Number(r.relances) > max) {
        push('RELANCES_MAX', 'plus de relances de case que le maximum par tour', {
          roundNumber: r.roundNumber,
          teamId: r.teamId,
          relances: r.relances,
          max,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Instantané d'une partie depuis la base (lecture seule). */
async function loadTenirSnapshot(db, gameId, settings = null) {
  const { getGameplaySettings } = require('./glSettings');
  const { resolveTenirSettings } = require('./glTenir');
  const { resolveVitalityCaps } = require('./glVitality');
  const { sortMarkersByPath, teamPathIndex } = require('./shared/glBoardPathCore');
  const gameplay = settings || (await getGameplaySettings());
  const game = await db.queryOne(
    `SELECT g.id, g.chapter_id, g.tenir_profil, g.tenir_overrides_json, ch.plateau_number
       FROM gl_games g LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  if (!game) return null;
  const resolved = resolveTenirSettings(gameplay, game);
  const caps = resolveVitalityCaps(gameplay);
  const markers = sortMarkersByPath(
    await db.queryAll(
      'SELECT id, x_pct, y_pct, order_index FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC',
      [game.chapter_id],
    ),
  );
  const teams = (
    await db.queryAll(
      'SELECT id, type, position_marker_id, position_x_pct, position_y_pct FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
      [gameId],
    )
  ).map((t) => ({ id: Number(t.id), type: t.type, pathIndex: teamPathIndex(t, markers) }));
  const players = (
    await db.queryAll(
      `SELECT p.id, tm.team_id, p.health_points, p.power_points FROM gl_team_members tm
         INNER JOIN gl_players p ON p.id = tm.player_id WHERE tm.game_id = ? ORDER BY p.id ASC`,
      [gameId],
    )
  ).map((p) => ({
    id: Number(p.id),
    teamId: Number(p.team_id),
    health: Number(p.health_points) || 0,
    power: Number(p.power_points) || 0,
  }));
  const state = await db.queryOne(
    'SELECT voile_position FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1',
    [gameId],
  );
  let pages = [];
  try {
    pages = (
      await db.queryAll(
        `SELECT z.zone_key, p.etat, p.trouvee_par_team_id, p.tenue_par_team_id
           FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id WHERE p.game_id = ?`,
        [gameId],
      )
    ).map((r) => ({
      zoneKey: String(r.zone_key),
      etat: String(r.etat),
      trouveeParTeamId: r.trouvee_par_team_id != null ? Number(r.trouvee_par_team_id) : null,
      tenueParTeamId: r.tenue_par_team_id != null ? Number(r.tenue_par_team_id) : null,
    }));
  } catch (_) {
    pages = [];
  }
  let ledger = [];
  try {
    ledger = (
      await db.queryAll(
        `SELECT player_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause
           FROM gl_resource_ledger WHERE game_id = ? ORDER BY id ASC`,
        [gameId],
      )
    ).map((r) => ({
      playerId: Number(r.player_id),
      deltaHealth: Number(r.delta_health) || 0,
      deltaPower: Number(r.delta_power) || 0,
      soldeHealthApres: Number(r.solde_health_apres) || 0,
      soldePowerApres: Number(r.solde_power_apres) || 0,
      cause: String(r.cause),
    }));
  } catch (_) {
    ledger = [];
  }
  let relances = [];
  try {
    relances = (
      await db.queryAll(
        `SELECT round_number, team_id, COUNT(*) AS n FROM gl_game_tenir_effets
          WHERE game_id = ? AND kind = 'relance_case' GROUP BY round_number, team_id`,
        [gameId],
      )
    ).map((r) => ({
      roundNumber: Number(r.round_number),
      teamId: Number(r.team_id),
      relances: Number(r.n) || 0,
    }));
  } catch (_) {
    relances = [];
  }
  return {
    gameId: Number(gameId),
    caps,
    players,
    teams,
    campIndex: markers.length ? markers.length - 1 : 0,
    voilePosition: state ? Number(state.voile_position ?? -1) : -1,
    pages,
    ledger,
    relances,
    relancesMax: Number(resolved.relances_max_par_tour) || 0,
  };
}

async function checkTenirInvariantsFromDb(db, gameId, settings = null) {
  const snapshot = await loadTenirSnapshot(db, gameId, settings);
  if (!snapshot)
    return {
      ok: false,
      violations: [{ code: 'GAME_NOT_FOUND', message: 'partie introuvable', details: { gameId } }],
    };
  return { ...checkTenirInvariants(snapshot), snapshot };
}

module.exports = {
  PAGE_ETATS,
  CAUSES_GAIN,
  checkTenirInvariants,
  loadTenirSnapshot,
  checkTenirInvariantsFromDb,
};
