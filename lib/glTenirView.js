'use strict';

/**
 * Vue « tenir » d'une partie pour `readGameState` / `GET /api/gl/games/:id/tenir` :
 * réglages résolus, profil, surface, état, tour courant, permissions de l'acteur, et
 * filtrage des bourses selon le spectateur (spec § 8 : un élève voit ses deux bourses et
 * celles de son équipe, jamais celles des autres équipes ; le prof voit tout ; une
 * projection ne reçoit aucune bourse).
 */

const {
  isTenirGame,
  resolveTenirSettings,
  resolveSurface,
  resolveDesMode,
  loadOrCreateTenirState,
  loadTenirState,
  defaultTenirState,
  listRetraitsOuverts,
  resolveTenirPermissions,
} = require('./glTenir');
const { listReserves, loadReserve } = require('./glBourses');
const { signalerBoursePleineSiBesoin } = require('./glTenirOlu');

/**
 * Spectateur d'une lecture d'état : `{ kind: 'mj'|'player'|'projection', playerId }`.
 * Dérivé de `req.glAuth` par `viewerFromAuth`.
 */
function viewerFromAuth(auth) {
  if (!auth) return { kind: 'projection', playerId: null };
  if (auth.userType === 'gl_guest')
    return { kind: 'projection', playerId: null, projection: auth.projection || null };
  if (auth.userType === 'gl_admin') return { kind: 'mj', playerId: null };
  if (auth.userType === 'gl_player')
    return { kind: 'player', playerId: Number(auth.userId) || null };
  return { kind: 'projection', playerId: null, projection: auth.projection || null };
}

/**
 * Retire des `roster` / `vitality.byPlayerId` les bourses que le spectateur ne doit pas voir.
 * Mutations sur des copies : l'état d'origine n'est pas touché.
 */
function filterBoursesForViewer(state, viewer, { tenirGame = false } = {}) {
  if (!state || !viewer) return state;
  if (viewer.kind === 'mj') return state;
  const roster = Array.isArray(state.roster) ? state.roster : [];
  let allowed = null;
  if (viewer.kind === 'player' && viewer.playerId != null) {
    const self = roster.find((r) => Number(r.playerId) === Number(viewer.playerId));
    const teamId = self?.teamId != null ? Number(self.teamId) : null;
    allowed = new Set(
      roster
        .filter((r) => teamId != null && Number(r.teamId) === teamId)
        .map((r) => Number(r.playerId)),
    );
    allowed.add(Number(viewer.playerId));
  }
  // Hors mode tenir, les soldes restaient publics : on ne change le comportement que des
  // parties « tenir » (projection : jamais de bourse, quel que soit le mode).
  if (viewer.kind === 'player' && !tenirGame) return state;
  const keep = (playerId) => allowed != null && allowed.has(Number(playerId));
  const nextRoster = roster.map((r) => {
    if (keep(r.playerId)) return r;
    const { healthPoints, powerPoints, ...rest } = r; // eslint-disable-line no-unused-vars
    return rest;
  });
  let vitality = state.vitality;
  if (vitality && vitality.byPlayerId) {
    const byPlayerId = {};
    for (const [pid, value] of Object.entries(vitality.byPlayerId)) {
      if (keep(pid)) byPlayerId[pid] = value;
    }
    vitality = { ...vitality, byPlayerId };
  }
  return { ...state, roster: nextRoster, vitality };
}

/**
 * Bloc `tenir` servi dans l'état de partie.
 * @param {object} db `{ queryOne, queryAll, execute }`
 * @param {object} input `{ game, settings, viewer, teamOfViewer }`
 */
async function buildTenirBlock(db, { game, settings, viewer, teamOfViewer = null }) {
  const enabled = isTenirGame(settings, game);
  if (!enabled) {
    return {
      enabled: false,
      profil: game?.tenir_profil || null,
      surface: null,
      settings: null,
      state: null,
      round: null,
      permissions: null,
    };
  }
  const resolved = resolveTenirSettings(settings, game);
  const surface = resolveSurface(game, settings);
  resolved.surface = surface;
  resolved.des_mode_effectif = resolveDesMode(resolved);
  // Un brouillon consulté ne crée pas son état (écrit au passage en cours ou au premier
  // geste) ; une partie en cours sans état (reprise, base migrée) le reçoit une seule fois.
  const state =
    String(game.status) === 'live'
      ? await loadOrCreateTenirState(db, Number(game.id))
      : (await loadTenirState(db, Number(game.id))) || defaultTenirState();
  let round = await loadRoundView(db, game);
  const retraits = await listRetraitsOuverts(db, Number(game.id));
  const viewerPlayerId = viewer?.playerId != null ? Number(viewer.playerId) : null;
  const enRetrait = viewerPlayerId != null && retraits.some((r) => r.playerId === viewerPlayerId);
  const actorKind =
    viewer?.kind === 'mj' ? 'mj' : viewer?.kind === 'player' ? 'player' : 'projection';
  const permissions = resolveTenirPermissions({
    surface,
    phase: round?.phase || null,
    actorKind,
    isMember: true,
    isActiveTeam:
      teamOfViewer != null && round?.equipeActiveId != null
        ? Number(round.equipeActiveId) === Number(teamOfViewer)
        : false,
    fouilleFenetreOuverte: round?.fouilleFenetreOuverte === true,
    enRetrait,
    settings: resolved,
  });
  // Le motif de retrait n'est vu que du prof ; l'élève concerné sait seulement qu'il est en retrait.
  const retraitsVisibles =
    actorKind === 'mj'
      ? retraits
      : actorKind === 'player' && enRetrait
        ? [{ playerId: viewerPlayerId, motif: null, entreeAt: null }]
        : [];
  // Plume du chapardeur : l'élève concerné et le prof seulement (spec § 13).
  const nid = state?.nid || null;
  const plume =
    !!nid &&
    (actorKind === 'mj' || (viewerPlayerId != null && Number(nid.playerId) === viewerPlayerId));
  const publicState = state
    ? {
        voilePosition: state.voilePosition,
        voileLastRollRound: state.voileLastRollRound,
        carnetCompletAt: state.carnetCompletAt,
        premiereArriveeTeamId: state.premiereArriveeTeamId,
        kraa: state.kraa,
        ...(actorKind === 'mj' ? { chapardeurRound: state.chapardeurRound, nid } : {}),
      }
    : null;
  if (round && actorKind !== 'mj' && round.operateurs) round = { ...round, operateurs: null };
  // E4 : réserves de la caravane — toutes pour le prof, celle de son équipe pour l'élève,
  // aucune en projection (privées comme les bourses).
  let reserves = [];
  if (actorKind === 'mj') reserves = await listReserves(db, Number(game.id));
  else if (actorKind === 'player' && teamOfViewer != null) {
    reserves = [await loadReserve(db, Number(game.id), Number(teamOfViewer))];
  }
  // E5 : Olu signale les bourses pleines à l'écran d'équipe, une fois par séance.
  if (
    actorKind === 'player' &&
    teamOfViewer != null &&
    round?.number > 0 &&
    round.phase &&
    round.phase !== 'clos'
  ) {
    try {
      const team = await db.queryOne('SELECT id, type FROM gl_teams WHERE id = ? LIMIT 1', [
        teamOfViewer,
      ]);
      const evt = team
        ? await signalerBoursePleineSiBesoin(db, {
            gameId: Number(game.id),
            teamId: Number(team.id),
            teamType: team.type,
            roundNumber: Number(round.number),
            resolved,
          })
        : null;
      if (evt) require('./realtime').emitGlGameEvent(Number(game.id), evt);
    } catch (err) {
      if (err?.errno !== 1146 && err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
  }
  return {
    enabled: true,
    profil: resolved.profil,
    surface,
    settings: resolved,
    state: publicState,
    round,
    permissions,
    retraits: retraitsVisibles,
    enRetrait,
    plume,
    reserves,
  };
}

/** Tour courant (phase, ordre, équipe active) ; tolère l'absence des colonnes de l'étape 2. */
async function loadRoundView(db, game) {
  const number = Number(game?.current_round_number) || 0;
  if (!number) return { number: 0, phase: null, ordre: [], equipeActiveId: null, ventTeamId: null };
  try {
    const { loadRoundView: loadTourView } = require('./glTour');
    return await loadTourView(db, Number(game.id), number);
  } catch (err) {
    if (err?.code === 'MODULE_NOT_FOUND') {
      return { number, phase: null, ordre: [], equipeActiveId: null, ventTeamId: null };
    }
    throw err;
  }
}

module.exports = {
  viewerFromAuth,
  filterBoursesForViewer,
  buildTenirBlock,
  loadRoundView,
};
