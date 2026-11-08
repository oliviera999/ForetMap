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
 *                         héritage, réparation, geste du prof, migration) ;
 * - `RESERVE_NEGATIVE`  : réserve de la caravane (E4) sous zéro ;
 * - `RESERVE_LIVRE`     : Σ des mouvements de réserve d'une équipe ≠ sa réserve ;
 * - `LIVRE_TOTAL`       : Σ soldes initiaux + Σ mouvements (bourses et réserves) ≠ Σ bourses +
 *                         Σ réserves — le surplus au plafond n'est jamais perdu ;
 * - `FOUILLES_QUOTA`    : plus de fouilles dans un tour que le quota (base + Grand Regard, et
 *                         réparation E2 pour les Gnomes).
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
  'reserve_entree',
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
  // Les lignes de réserve (`kind = 'reserve'`, E4) sont sommées par équipe, pas par joueur.
  const ledger = Array.isArray(s.ledger) ? s.ledger : [];
  const lastByPlayer = new Map();
  const sumByPlayer = new Map();
  const reserveSumByTeam = new Map();
  let totalDeltas = { dh: 0, dg: 0 };
  for (const row of ledger) {
    const dh = Number(row.deltaHealth) || 0;
    const dg = Number(row.deltaPower) || 0;
    totalDeltas = { dh: totalDeltas.dh + dh, dg: totalDeltas.dg + dg };
    if (!CAUSES.includes(String(row.cause))) {
      push('LIVRE_CAUSE', 'mouvement sans cause admise', {
        playerId: row.playerId,
        teamId: row.teamId,
        cause: row.cause,
      });
    }
    const gain = dh > 0 || dg > 0;
    if (gain && !CAUSES_GAIN.has(String(row.cause))) {
      push('GAIN_NON_DOCUMENTE', 'gain de ressource par une cause qui ne crée rien', {
        playerId: row.playerId,
        teamId: row.teamId,
        cause: row.cause,
      });
    }
    if (row.kind === 'reserve') {
      const tid = Number(row.teamId);
      const acc = reserveSumByTeam.get(tid) || { dh: 0, dg: 0 };
      reserveSumByTeam.set(tid, { dh: acc.dh + dh, dg: acc.dg + dg });
      continue;
    }
    const pid = Number(row.playerId);
    lastByPlayer.set(pid, row);
    const acc = sumByPlayer.get(pid) || { dh: 0, dg: 0 };
    acc.dh += dh;
    acc.dg += dg;
    sumByPlayer.set(pid, acc);
  }

  // Réserves (E4) : jamais négatives ; le livre de réserve d'une équipe tombe sur son solde.
  const reserves = Array.isArray(s.reserves) ? s.reserves : [];
  for (const r of reserves) {
    const h = Number(r.health) || 0;
    const g = Number(r.power) || 0;
    if (h < 0 || g < 0) {
      push('RESERVE_NEGATIVE', 'réserve de la caravane négative', {
        teamId: r.teamId,
        health: h,
        power: g,
      });
    }
    const sum = reserveSumByTeam.get(Number(r.teamId));
    if ((sum || h || g) && ((sum?.dh || 0) !== h || (sum?.dg || 0) !== g)) {
      push('RESERVE_LIVRE', 'Σ des mouvements de réserve ≠ réserve de l’équipe', {
        teamId: r.teamId,
        livre: sum || { dh: 0, dg: 0 },
        reserve: { health: h, power: g },
      });
    }
  }
  // Somme totale : rien ne se perd entre bourses et réserves (si tous les initiaux sont connus).
  if (players.length && players.every((p) => p.initialHealth != null && p.initialPower != null)) {
    const initial = players.reduce(
      (acc, p) => ({ h: acc.h + Number(p.initialHealth), g: acc.g + Number(p.initialPower) }),
      { h: 0, g: 0 },
    );
    const current = players.reduce(
      (acc, p) => ({ h: acc.h + Number(p.health), g: acc.g + Number(p.power) }),
      { h: 0, g: 0 },
    );
    const reserveTotal = reserves.reduce(
      (acc, r) => ({ h: acc.h + (Number(r.health) || 0), g: acc.g + (Number(r.power) || 0) }),
      { h: 0, g: 0 },
    );
    if (
      initial.h + totalDeltas.dh !== current.h + reserveTotal.h ||
      initial.g + totalDeltas.dg !== current.g + reserveTotal.g
    ) {
      push('LIVRE_TOTAL', 'Σ initiaux + Σ mouvements ≠ Σ bourses + Σ réserves', {
        initial,
        mouvements: totalDeltas,
        bourses: current,
        reserves: reserveTotal,
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

  // Fouilles (E2) : par tour et par équipe, au plus le quota (base + Grand Regard) de fouilles
  // générales et au plus `quotaReparation` fouilles de réparation.
  for (const f of Array.isArray(s.fouilles) ? s.fouilles : []) {
    const n = Number(f.n) || 0;
    const rep = Number(f.nReparation) || 0;
    const quota = Number(f.quotaMax);
    const quotaRep = Number(f.quotaReparation) || 0;
    if ((Number.isFinite(quota) && n - rep > quota) || rep > quotaRep) {
      push('FOUILLES_QUOTA', 'plus de fouilles dans le tour que le quota', {
        roundNumber: f.roundNumber,
        teamId: f.teamId,
        fouilles: n,
        reparation: rep,
        quotaMax: quota,
        quotaReparation: quotaRep,
      });
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
    let rows;
    try {
      rows = await db.queryAll(
        `SELECT player_id, kind, team_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause
           FROM gl_resource_ledger WHERE game_id = ? ORDER BY id ASC`,
        [gameId],
      );
    } catch (err) {
      if (err?.errno !== 1054 && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
      rows = await db.queryAll(
        `SELECT player_id, delta_health, delta_power, solde_health_apres, solde_power_apres, cause
           FROM gl_resource_ledger WHERE game_id = ? ORDER BY id ASC`,
        [gameId],
      );
    }
    ledger = rows.map((r) => ({
      playerId: r.player_id != null ? Number(r.player_id) : null,
      kind: r.kind === 'reserve' ? 'reserve' : 'bourse',
      teamId: r.team_id != null ? Number(r.team_id) : null,
      deltaHealth: Number(r.delta_health) || 0,
      deltaPower: Number(r.delta_power) || 0,
      soldeHealthApres: Number(r.solde_health_apres) || 0,
      soldePowerApres: Number(r.solde_power_apres) || 0,
      cause: String(r.cause),
    }));
  } catch (_) {
    ledger = [];
  }
  let reserves = [];
  try {
    const { listReserves } = require('./glBourses');
    reserves = await listReserves(db, gameId);
  } catch (_) {
    reserves = [];
  }
  // Fouilles par tour et par équipe (E2) : quota = base du peuple + Grand Regard (+ réparation).
  let fouilles = [];
  try {
    const { resolveFouillesParTour, resolveFouillesReparation } = require('./glTenir');
    let rows;
    try {
      rows = await db.queryAll(
        `SELECT round_number, team_id, COUNT(*) AS n, COALESCE(SUM(reparation), 0) AS r
           FROM gl_game_chasse_empreintes WHERE game_id = ? AND round_number > 0 AND team_id IS NOT NULL
          GROUP BY round_number, team_id`,
        [gameId],
      );
    } catch (err) {
      if (err?.errno !== 1054 && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
      rows = await db.queryAll(
        `SELECT round_number, team_id, COUNT(*) AS n, 0 AS r
           FROM gl_game_chasse_empreintes WHERE game_id = ? AND round_number > 0 AND team_id IS NOT NULL
          GROUP BY round_number, team_id`,
        [gameId],
      );
    }
    const bonus = await db.queryAll(
      `SELECT round_number, team_id, payload_json FROM gl_game_tenir_effets
        WHERE game_id = ? AND kind = 'fouilles_bonus'`,
      [gameId],
    );
    const teamType = new Map(teams.map((t) => [Number(t.id), t.type]));
    fouilles = rows.map((r) => {
      const round = Number(r.round_number);
      const tid = Number(r.team_id);
      let extra = 0;
      for (const b of bonus) {
        if (Number(b.round_number) !== round) continue;
        if (b.team_id != null && Number(b.team_id) !== tid) continue;
        let n = 1;
        try {
          const p = JSON.parse(b.payload_json || '{}');
          if (Number.isInteger(Number(p?.n))) n = Number(p.n);
        } catch (_) {
          n = 1;
        }
        extra += n;
      }
      return {
        roundNumber: round,
        teamId: tid,
        n: Number(r.n) || 0,
        nReparation: Number(r.r) || 0,
        quotaMax: resolveFouillesParTour(resolved, teamType.get(tid)) + extra,
        quotaReparation: resolveFouillesReparation(resolved, teamType.get(tid)),
      };
    });
  } catch (_) {
    fouilles = [];
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
    reserves,
    fouilles,
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
