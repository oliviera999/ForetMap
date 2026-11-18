'use strict';

/**
 * « Tenir à deux » — lectures de **diagnostic** d'une partie pour le connecteur MCP
 * (`lib/mcp/tools/domains/gl*.js`) et tout banc d'observation.
 *
 * Deux étages, comme `lib/glTenirInvariants.js` :
 * - des fonctions **pures** sur des lignes déjà lues (agrégats de bourses par équipe, durées des
 *   tours, comptes de pages, résumé d'un tour) — testables sans base ;
 * - des **chargeurs** qui ne font que des `SELECT` paramétrés sur un exécuteur
 *   `{ queryOne, queryAll }` (module `database`, transaction, ou connexion READ ONLY du
 *   connecteur). Aucune écriture, aucun nom d'élève : les pseudos ne sortent que de
 *   `loadPlayersBourses`, réservé à l'action nominative `bourses_eleves`.
 *
 * Rien ici ne touche au moteur (`lib/glTour.js`, `lib/glChasse.js`…) : on ne fait que relire.
 */

function num(v) {
  return Number(v) || 0;
}

function toIso(v) {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function minutesBetween(a, b) {
  const da = a ? new Date(a instanceof Date ? a : String(a).replace(' ', 'T')) : null;
  const db = b ? new Date(b instanceof Date ? b : String(b).replace(' ', 'T')) : null;
  if (!da || !db || Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 60000);
}

/* ------------------------------------------------------------------ pures */

function statsOf(values, cap) {
  if (!values.length) return { somme: 0, min: null, max: null, auPlafond: 0 };
  return {
    somme: values.reduce((a, b) => a + b, 0),
    min: Math.min(...values),
    max: Math.max(...values),
    auPlafond: cap > 0 ? values.filter((v) => v >= cap).length : 0,
  };
}

/**
 * Bourses de gemmes **agrégées par équipe** (jamais par élève) : somme, min, max, nombre au
 * plafond.
 * @param {Array<{ id, teamId, power }>} players
 * @param {Array<{ id, name?, type? }>} teams
 * @param {{ maxPower?: number }} caps
 */
function aggregateBourses(players, teams, caps = {}) {
  const byTeam = new Map((teams || []).map((t) => [Number(t.id), []]));
  for (const p of players || []) {
    const key = Number(p.teamId);
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(p);
  }
  const teamMeta = new Map((teams || []).map((t) => [Number(t.id), t]));
  const out = [];
  for (const [teamId, members] of byTeam) {
    const meta = teamMeta.get(teamId) || {};
    out.push({
      teamId,
      name: meta.name ?? null,
      type: meta.type ?? null,
      membres: members.length,
      // Ensemble unifié (M1) : une seule monnaie — l'agrégat ne porte que les gemmes.
      gemmes: statsOf(
        members.map((m) => num(m.power)),
        num(caps.maxPower),
      ),
    });
  }
  out.sort((a, b) => a.teamId - b.teamId);
  return out;
}

/** Comptes de pages par état (`endormie`, `revelee`, `trouvee`, `tenue`, `palie`, `reparee`). */
function countPages(pages) {
  const out = { total: 0 };
  for (const p of pages || []) {
    const etat = String(p.etat || 'inconnu');
    out[etat] = (out[etat] || 0) + 1;
    out.total += 1;
  }
  return out;
}

/**
 * Durées des tours (ouverture → clos) et séances jusqu'au Seuil.
 * @param {Array<{ round_number|number, phase, started_at|startedAt, ended_at|endedAt }>} rounds
 * @param {{ seuilRound?: number|null }} [opts] tour où le Seuil a été clos (évènement `seuil_clos`)
 */
function summarizeRounds(rounds, opts = {}) {
  const items = (rounds || [])
    .map((r) => {
      const started = r.started_at ?? r.startedAt ?? null;
      const ended = r.ended_at ?? r.endedAt ?? null;
      return {
        number: num(r.round_number ?? r.number),
        phase: r.phase || null,
        startedAt: toIso(started),
        endedAt: toIso(ended),
        dureeMinutes: minutesBetween(started, ended),
      };
    })
    .sort((a, b) => a.number - b.number);
  const clos = items.filter((r) => r.dureeMinutes != null);
  const moyenne = clos.length
    ? Math.round(clos.reduce((a, r) => a + r.dureeMinutes, 0) / clos.length)
    : null;
  const seuilRound = opts.seuilRound != null ? num(opts.seuilRound) : null;
  return {
    tours: items.length,
    toursClos: items.filter((r) => r.phase === 'clos').length,
    dureeMoyenneMinutes: moyenne,
    dureeMaxMinutes: clos.length ? Math.max(...clos.map((r) => r.dureeMinutes)) : null,
    seancesJusquAuSeuil: seuilRound,
    items,
  };
}

/**
 * Durées **par phase** (`gl_game_round_phases`, migration 346) : par tour, et moyennes des
 * phases fermées. Un tour joué avant la migration n'a pas de ligne : il n'apparaît pas.
 * @param {Array<{ round_number, phase, started_at, ended_at }>} phaseRows
 */
function summarizePhases(phaseRows) {
  const { PHASES_CHRONOMETREES, dureesParTour, formatDureesTour } = require('./glRoundPhases');
  const tours = dureesParTour(phaseRows);
  const moyennesSecondes = {};
  for (const phase of PHASES_CHRONOMETREES) {
    const valeurs = tours.map((t) => t.phases[phase]).filter((v) => v != null);
    moyennesSecondes[phase] = valeurs.length
      ? Math.round(valeurs.reduce((a, b) => a + b, 0) / valeurs.length)
      : null;
  }
  return {
    toursMesures: tours.length,
    moyennesSecondes,
    tours: tours.map((t) => ({ ...t, libelle: formatDureesTour(t.phases) })),
  };
}

function timeOf(v) {
  const iso = toIso(v);
  return iso ? new Date(iso).getTime() : null;
}

/**
 * Rythme d'une partie, tour par tour (pur) :
 * - par équipe, l'écart entre son premier et son dernier geste de la phase `jeu` (évènements
 *   portant un `team_id`, quel que soit l'auteur : au tableau, le prof joue pour l'équipe) ;
 * - le nombre de gestes du prof dans le tour (évènements `actor_type = 'mj'`, hors le doublon
 *   de compatibilité `round_start`).
 * Aucun nom d'élève : équipes seulement.
 *
 * @param {Array<{ team_id, actor_type, event_type, created_at }>} events
 * @param {Array<{ round_number, phase, started_at, ended_at }>} phaseRows
 * @param {Array<{ round_number, started_at, ended_at }>} rounds
 * @param {Array<{ id, name?, type? }>} [teams]
 */
function summarizeRythme(events, phaseRows, rounds, teams = []) {
  const teamMeta = new Map((teams || []).map((t) => [num(t.id), t]));
  const jeuBy = new Map();
  for (const row of phaseRows || []) {
    if (String(row.phase) !== 'jeu') continue;
    jeuBy.set(num(row.round_number), {
      debut: timeOf(row.started_at),
      fin: timeOf(row.ended_at),
    });
  }
  const dated = (events || [])
    .map((e) => ({
      teamId: e.team_id != null ? num(e.team_id) : null,
      actorType: String(e.actor_type || ''),
      eventType: String(e.event_type || ''),
      at: timeOf(e.created_at),
    }))
    .filter((e) => e.at != null);
  const tours = (rounds || [])
    .map((r) => {
      const number = num(r.round_number ?? r.number);
      const debut = timeOf(r.started_at ?? r.startedAt);
      const fin = timeOf(r.ended_at ?? r.endedAt);
      const dansLeTour = (e) => debut != null && e.at >= debut && (fin == null || e.at <= fin);
      const gestesProf = dated.filter(
        (e) => e.actorType === 'mj' && e.eventType !== 'round_start' && dansLeTour(e),
      ).length;
      const jeu = jeuBy.get(number) || null;
      const parEquipe = new Map();
      if (jeu?.debut != null) {
        for (const e of dated) {
          if (e.teamId == null || e.at < jeu.debut) continue;
          if (jeu.fin != null && e.at > jeu.fin) continue;
          if (!parEquipe.has(e.teamId)) parEquipe.set(e.teamId, []);
          parEquipe.get(e.teamId).push(e.at);
        }
      }
      const equipes = [...parEquipe.entries()]
        .map(([teamId, instants]) => {
          const premier = Math.min(...instants);
          const dernier = Math.max(...instants);
          return {
            teamId,
            name: teamMeta.get(teamId)?.name || null,
            gestes: instants.length,
            premierGesteAt: new Date(premier).toISOString(),
            dernierGesteAt: new Date(dernier).toISOString(),
            ecartSecondes: Math.round((dernier - premier) / 1000),
          };
        })
        .sort((a, b) => a.teamId - b.teamId);
      return { number, gestesProf, phaseJeuMesuree: jeu?.debut != null, equipes };
    })
    .sort((a, b) => a.number - b.number);
  return { tours };
}

/** Compte d'évènements par type (`gl_game_events.event_type`). */
function countEventsByType(rows) {
  const out = {};
  for (const r of rows || []) {
    const t = String(r.event_type || r.eventType || 'inconnu');
    out[t] = (out[t] || 0) + num(r.n ?? 1);
  }
  return out;
}

/* -------------------------------------------------------------- chargeurs */

const GAME_SELECT = `
  SELECT g.id, g.name, g.status, g.class_id, c.name AS class_name, g.chapter_id,
         ch.title AS chapter_title, ch.slug AS chapter_slug, ch.plateau_number,
         g.current_team_id, g.current_round_number, g.tenir_profil, g.tenir_surface,
         g.tenir_overrides_json, g.board_movement_mode, g.created_at, g.updated_at
    FROM gl_games g
    LEFT JOIN gl_classes c ON c.id = g.class_id
    LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id`;

function formatGame(row, extra = {}) {
  if (!row) return null;
  return {
    id: num(row.id),
    name: row.name || '',
    status: row.status,
    classId: row.class_id != null ? num(row.class_id) : null,
    className: row.class_name || null,
    chapterId: row.chapter_id != null ? num(row.chapter_id) : null,
    chapterTitle: row.chapter_title || null,
    chapterSlug: row.chapter_slug || null,
    plateau: row.plateau_number != null ? num(row.plateau_number) : null,
    tenirProfil: row.tenir_profil || null,
    tenirSurface: row.tenir_surface || null,
    boardMovementMode: row.board_movement_mode || null,
    currentRoundNumber: num(row.current_round_number),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...extra,
  };
}

/**
 * Parties (filtres : classe, statut, mode tenir), avec le nombre d'équipes et la phase du
 * tour courant. Aucune donnée d'élève.
 */
async function loadGamesList(db, { classId = null, status = null, tenir = null } = {}) {
  const where = [];
  const params = [];
  if (classId != null) {
    where.push('g.class_id = ?');
    params.push(classId);
  }
  if (status) {
    where.push('g.status = ?');
    params.push(status);
  }
  if (tenir === true) where.push('g.tenir_profil IS NOT NULL');
  if (tenir === false) where.push('g.tenir_profil IS NULL');
  const rows = await db.queryAll(
    `${GAME_SELECT}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY g.updated_at DESC, g.id DESC`,
    params,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => num(r.id));
  const ph = ids.map(() => '?').join(', ');
  const teams = await db.queryAll(
    `SELECT game_id, COUNT(*) AS n FROM gl_teams WHERE game_id IN (${ph}) GROUP BY game_id`,
    ids,
  );
  const members = await db.queryAll(
    `SELECT game_id, COUNT(DISTINCT player_id) AS n FROM gl_team_members WHERE game_id IN (${ph}) GROUP BY game_id`,
    ids,
  );
  const rounds = await db.queryAll(
    `SELECT r.game_id, r.round_number, r.phase
       FROM gl_game_rounds r
       INNER JOIN gl_games g ON g.id = r.game_id AND g.current_round_number = r.round_number
      WHERE r.game_id IN (${ph})`,
    ids,
  );
  const teamsBy = new Map(teams.map((r) => [num(r.game_id), num(r.n)]));
  const membersBy = new Map(members.map((r) => [num(r.game_id), num(r.n)]));
  const roundBy = new Map(rounds.map((r) => [num(r.game_id), r.phase || null]));
  return rows.map((r) =>
    formatGame(r, {
      teamsCount: teamsBy.get(num(r.id)) || 0,
      playersCount: membersBy.get(num(r.id)) || 0,
      currentPhase: roundBy.get(num(r.id)) || null,
    }),
  );
}

async function loadGameOverview(db, gameId) {
  const row = await db.queryOne(`${GAME_SELECT} WHERE g.id = ? LIMIT 1`, [gameId]);
  return row || null;
}

/** Cases du chemin (ordre de plateau) du chapitre d'une partie. */
async function loadPathMarkers(db, chapterId) {
  const { sortMarkersByPath } = require('./shared/glBoardPathCore');
  return sortMarkersByPath(
    await db.queryAll(
      'SELECT id, x_pct, y_pct, order_index FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY order_index ASC, id ASC',
      [chapterId],
    ),
  );
}

/** Équipes d'une partie : peuple, pion (rang de case), au camp, nombre de membres. */
async function loadTeamsWithPath(db, game) {
  const { teamPathIndex } = require('./shared/glBoardPathCore');
  const gameId = num(game.id);
  const markers = await loadPathMarkers(db, num(game.chapter_id));
  const campIndex = markers.length ? markers.length - 1 : 0;
  const teams = await db.queryAll(
    `SELECT t.id, t.name, t.type, t.color, t.mascot_id, t.position_marker_id, t.position_x_pct,
            t.position_y_pct, t.last_dice_round_number,
            (SELECT COUNT(*) FROM gl_team_members tm WHERE tm.team_id = t.id AND tm.game_id = t.game_id) AS members
       FROM gl_teams t WHERE t.game_id = ? ORDER BY t.id ASC`,
    [gameId],
  );
  return {
    campIndex,
    teams: teams.map((t) => {
      const pathIndex = teamPathIndex(t, markers);
      return {
        id: num(t.id),
        name: t.name,
        type: t.type,
        color: t.color || null,
        mascotId: t.mascot_id || null,
        pathIndex,
        auCamp: markers.length > 0 && pathIndex >= campIndex,
        membres: num(t.members),
        lastDiceRoundNumber: num(t.last_dice_round_number),
      };
    }),
  };
}

/** Bourses par élève (identifiant, équipe, pseudo) — **nominatif**, réservé à `bourses_eleves`. */
async function loadPlayersBourses(db, gameId, { withPseudo = false } = {}) {
  const rows = await db.queryAll(
    `SELECT p.id, tm.team_id, p.power_points${withPseudo ? ', p.pseudo' : ''}
       FROM gl_team_members tm INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ? ORDER BY tm.team_id ASC, p.id ASC`,
    [gameId],
  );
  return rows.map((r) => ({
    id: num(r.id),
    teamId: num(r.team_id),
    power: num(r.power_points),
    ...(withPseudo ? { pseudo: r.pseudo || null } : {}),
  }));
}

/** Pages du carnet d'une partie, par zone (clé de zone, état, équipes, dates). */
async function loadPagesByZone(db, gameId) {
  let rows = [];
  try {
    rows = await db.queryAll(
      `SELECT z.zone_key, z.plateau, z.feuillet_code, z.rang_case, p.etat, p.trouvee_par_team_id,
              p.trouvee_at, p.tenue_par_team_id, p.tenue_at, p.reparee_at
         FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id
        WHERE p.game_id = ? ORDER BY z.plateau ASC, z.ordre ASC, z.zone_key ASC`,
      [gameId],
    );
  } catch (_) {
    rows = [];
  }
  return rows.map((r) => ({
    zoneKey: String(r.zone_key),
    plateau: r.plateau != null ? num(r.plateau) : null,
    feuilletCode: r.feuillet_code || null,
    rangCase: r.rang_case != null ? num(r.rang_case) : null,
    etat: String(r.etat),
    trouveeParTeamId: r.trouvee_par_team_id != null ? num(r.trouvee_par_team_id) : null,
    trouveeAt: toIso(r.trouvee_at),
    tenueParTeamId: r.tenue_par_team_id != null ? num(r.tenue_par_team_id) : null,
    tenueAt: toIso(r.tenue_at),
    repareeAt: toIso(r.reparee_at),
  }));
}

async function loadRounds(db, gameId) {
  return db.queryAll(
    `SELECT round_number, phase, started_at, ended_at, phase_changed_at, equipe_active_id, vent_team_id
       FROM gl_game_rounds WHERE game_id = ? ORDER BY round_number ASC`,
    [gameId],
  );
}

/** Phases chronométrées (`gl_game_round_phases`) ; `[]` sur une base sans la migration 346. */
async function loadRoundPhases(db, gameId) {
  try {
    return await require('./glRoundPhases').loadRoundPhases(db, gameId);
  } catch (_) {
    return [];
  }
}

/** Évènements d'une partie réduits à ce que lit `summarizeRythme` (aucun payload). */
async function loadGestes(db, gameId) {
  return db.queryAll(
    `SELECT team_id, actor_type, event_type, created_at FROM gl_game_events
      WHERE game_id = ? ORDER BY id ASC`,
    [gameId],
  );
}

/** Tour où le Seuil a été clos (`seuil_clos`), ou `null`. */
async function loadSeuilRound(db, gameId) {
  const row = await db.queryOne(
    `SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'seuil_clos' ORDER BY id DESC LIMIT 1`,
    [gameId],
  );
  if (!row) return null;
  try {
    const p = JSON.parse(row.payload_json || '{}');
    return p.roundNumber != null ? num(p.roundNumber) : null;
  } catch (_) {
    return null;
  }
}

async function countSafe(db, sql, params) {
  try {
    const row = await db.queryOne(sql, params);
    return num(row?.n);
  } catch (_) {
    return null;
  }
}

/** Compteurs d'une partie : fouilles, pages par état, sorts lancés, dons, évènements par type. */
async function loadCounters(db, gameId) {
  const fouilles = await countSafe(
    db,
    'SELECT COUNT(*) AS n FROM gl_game_chasse_empreintes WHERE game_id = ?',
    [gameId],
  );
  const fouillesReparation = await countSafe(
    db,
    'SELECT COUNT(*) AS n FROM gl_game_chasse_empreintes WHERE game_id = ? AND reparation = 1',
    [gameId],
  );
  const sortsLances = await countSafe(
    db,
    'SELECT COUNT(*) AS n FROM gl_spell_cast_drafts WHERE game_id = ? AND cast_at IS NOT NULL',
    [gameId],
  );
  const dons = await countSafe(db, 'SELECT COUNT(*) AS n FROM gl_market_dons WHERE game_id = ?', [
    gameId,
  ]);
  const retraitsOuverts = await countSafe(
    db,
    'SELECT COUNT(*) AS n FROM gl_game_retraits WHERE game_id = ? AND sortie_at IS NULL',
    [gameId],
  );
  let eventRows = [];
  try {
    eventRows = await db.queryAll(
      'SELECT event_type, COUNT(*) AS n FROM gl_game_events WHERE game_id = ? GROUP BY event_type',
      [gameId],
    );
  } catch (_) {
    eventRows = [];
  }
  return {
    fouilles,
    fouillesReparation,
    pages: countPages(await loadPagesByZone(db, gameId)),
    sortsLances,
    dons,
    retraitsOuverts,
    evenements: countEventsByType(eventRows),
  };
}

/**
 * Résumé compact d'un tour (avant / après un geste du prof) : statut, tour, phase, équipe
 * active, voile, pions.
 */
async function loadTourSummary(db, gameId) {
  const game = await loadGameOverview(db, gameId);
  if (!game) return null;
  const roundNumber = num(game.current_round_number);
  const round = roundNumber
    ? await db.queryOne(
        'SELECT phase, equipe_active_id, vent_team_id, ended_at FROM gl_game_rounds WHERE game_id = ? AND round_number = ? LIMIT 1',
        [gameId, roundNumber],
      )
    : null;
  const state = await db.queryOne(
    'SELECT voile_position, carnet_complet_at FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1',
    [gameId],
  );
  const { teams, campIndex } = await loadTeamsWithPath(db, game);
  const retraits = await countSafe(
    db,
    'SELECT COUNT(*) AS n FROM gl_game_retraits WHERE game_id = ? AND sortie_at IS NULL',
    [gameId],
  );
  return {
    gameId: num(game.id),
    status: game.status,
    roundNumber,
    phase: round?.phase || null,
    equipeActiveId: round?.equipe_active_id != null ? num(round.equipe_active_id) : null,
    ventTeamId: round?.vent_team_id != null ? num(round.vent_team_id) : null,
    voilePosition: state ? num(state.voile_position) : null,
    carnetComplet: !!state?.carnet_complet_at,
    campIndex,
    retraitsOuverts: retraits,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      pathIndex: t.pathIndex,
      auCamp: t.auCamp,
    })),
  };
}

module.exports = {
  GAME_SELECT,
  aggregateBourses,
  countEventsByType,
  countPages,
  formatGame,
  loadCounters,
  loadGameOverview,
  loadGestes,
  loadRoundPhases,
  loadGamesList,
  loadPagesByZone,
  loadPathMarkers,
  loadPlayersBourses,
  loadRounds,
  loadSeuilRound,
  loadTeamsWithPath,
  loadTourSummary,
  minutesBetween,
  summarizePhases,
  summarizeRounds,
  summarizeRythme,
  toIso,
};
