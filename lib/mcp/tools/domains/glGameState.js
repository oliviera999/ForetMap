'use strict';

/**
 * `gl_game_state` — état d'une partie « Tenir à deux » (domaine `gl`).
 *
 * - `get` : réglages résolus (profil, surcharges, surface, mode de dés), état du voile, tour
 *   courant (phase, ordre, équipe active, vent, souffle, absences **comptées**), pages du carnet
 *   par zone et par état, **bourses agrégées par équipe** (somme, min, max, nombre au plafond)
 *   et réserve de la caravane (E4) par équipe. Jamais une bourse par élève ;
 * - `bourses_eleves` (**nominatif**) : bourses par élève (identifiant, pseudo, équipe), pour le
 *   prof qui veut le détail — exige le bypass RGPD, chaque appel est journalisé.
 *
 * Lecture SQL READ ONLY sous vérification du staff G&L ; les fonctions de lecture sont celles
 * du moteur (`lib/glTour.js`, `lib/glTenir.js`, `lib/glBourses.js`) ou de `lib/glDiagnostic.js`.
 */

const { defineDomainTool, req } = require('./factory');
const { gameIdParam, gameplaySettings, loadGameOrThrow, readGl } = require('./glCommon');
const {
  aggregateBourses,
  countPages,
  formatGame,
  loadPagesByZone,
  loadPlayersBourses,
  loadTeamsWithPath,
} = require('../../../glDiagnostic');

const TOOL = 'gl_game_state';

/** Réglages « tenir » résolus d'une partie (clés plates), surface et mode de dés effectifs. */
function resolveSettingsBlock(settings, game) {
  const {
    isTenirGame,
    resolveTenirSettings,
    resolveSurface,
    resolveDesMode,
  } = require('../../../glTenir');
  const tenir = isTenirGame(settings, game);
  if (!tenir) return { tenir: false, profil: game.tenir_profil || null, resolved: null };
  const resolved = resolveTenirSettings(settings, game);
  resolved.surface = resolveSurface(game, settings);
  resolved.des_mode_effectif = resolveDesMode(resolved);
  return { tenir: true, profil: resolved.profil, resolved };
}

async function loadVoile(db, gameId) {
  const { loadTenirState } = require('../../../glTenir');
  const state = await loadTenirState(db, gameId);
  if (!state) return null;
  return {
    voilePosition: state.voilePosition,
    voileLastRollRound: state.voileLastRollRound,
    carnetCompletAt: state.carnetCompletAt,
    premiereArriveeTeamId: state.premiereArriveeTeamId,
    chapardeurRound: state.chapardeurRound,
    // Le nid porte l'identifiant d'un élève : seule sa présence est utile ici.
    nid: state.nid ? { present: true } : null,
    oiseau: state.kraa ? { present: true } : null,
  };
}

async function loadRound(db, game) {
  const roundNumber = Number(game.current_round_number) || 0;
  if (!roundNumber) return null;
  const tour = require('../../../glTour');
  const view = await tour.loadRoundView(db, Number(game.id), roundNumber);
  return {
    number: view.number,
    phase: view.phase,
    ordre: view.ordre,
    equipeActiveId: view.equipeActiveId,
    ventTeamId: view.ventTeamId,
    souffle: view.souffle,
    passeur: view.passeur ? { present: true } : null,
    oluErreur: view.oluErreur ? { id: view.oluErreur.id } : null,
    oluCorrigeTeamId: view.oluCorrigeTeamId,
    absences: Array.isArray(view.absences) ? view.absences.length : 0,
    operateurs: Object.keys(view.operateurs || {}).length,
    effets: (view.effets || []).map((e) => ({ kind: e.kind, teamId: e.teamId })),
    fenetresFouille: view.fenetresFouille,
    desEnAttente: Array.isArray(view.desEnAttente) ? view.desEnAttente.length : 0,
    startedAt: view.startedAt,
    endedAt: view.endedAt,
    phaseChangedAt: view.phaseChangedAt,
  };
}

async function loadReservesSafe(db, gameId) {
  try {
    const { listReserves } = require('../../../glBourses');
    return await listReserves(db, gameId);
  } catch (_) {
    return [];
  }
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : état d’une partie « Tenir à deux »',
  intro:
    'État d’une partie Gnomes & Licornes en mode « Tenir à deux » : réglages résolus, voile, tour courant (phase, ordre, équipe active), pages du carnet par zone, bourses agrégées par équipe (somme, min, max, nombre au plafond) et réserve de la caravane. Les bourses par élève ne sortent que par l’action nominative bourses_eleves. Réservé au staff G&L.',
  actions: {
    get: {
      summary:
        'réglages résolus, voile, tour courant, pages par zone, bourses agrégées par équipe, réserves',
      params: { game_id: req(gameIdParam) },
      run: async (args, ctx) => {
        const settings = await gameplaySettings();
        return readGl(ctx, async (db) => {
          const game = await loadGameOrThrow(db, args.game_id);
          const { resolveVitalityCaps } = require('../../../glVitality');
          const caps = resolveVitalityCaps(settings);
          const block = resolveSettingsBlock(settings, game);
          const { teams, campIndex } = await loadTeamsWithPath(db, game);
          const players = await loadPlayersBourses(db, args.game_id);
          const pages = await loadPagesByZone(db, args.game_id);
          return {
            game: formatGame(game, { campIndex }),
            tenir: block.tenir,
            profil: block.profil,
            settings: block.resolved,
            caps,
            voile: await loadVoile(db, args.game_id),
            round: await loadRound(db, game),
            teams,
            pages: { counts: countPages(pages), items: pages },
            bourses: aggregateBourses(players, teams, caps),
            reserves: await loadReservesSafe(db, args.game_id),
            note: 'Bourses agrégées par équipe ; le détail par élève est l’action nominative bourses_eleves.',
          };
        });
      },
    },
    bourses_eleves: {
      summary: 'bourses par élève (identifiant, pseudo, équipe) — nominatif',
      nominative: true,
      params: { game_id: req(gameIdParam) },
      run: (args, ctx) =>
        readGl(ctx, async (db) => {
          await loadGameOrThrow(db, args.game_id);
          const players = await loadPlayersBourses(db, args.game_id, { withPseudo: true });
          // Ordre d'équipe puis d'identifiant : jamais un ordre par solde (garde-fou § 1.6).
          return {
            game_id: args.game_id,
            count: players.length,
            items: players.map((p) => ({
              player_id: p.id,
              pseudo: p.pseudo,
              team_id: p.teamId,
              coeurs: p.health,
              gemmes: p.power,
            })),
          };
        }),
    },
  },
});

module.exports = { buildGlGameStateTool: () => tool, resolveSettingsBlock };
