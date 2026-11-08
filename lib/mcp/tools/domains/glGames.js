'use strict';

/**
 * `gl_games` — parties Gnomes & Licornes (domaine `gl`, lecture seule).
 *
 * - `list` : classe, statut, profil tenir, plateau, surface, tour courant et sa phase, nombre
 *   d'équipes et de joueurs (filtres `class_id`, `status`, `tenir`) ;
 * - `get` : une partie et ses équipes (peuple, pion, au camp, nombre de membres).
 *
 * Lecture SQL en READ ONLY sous vérification du staff G&L (`glCommon.readGl`). Aucun nom
 * d'élève : les équipes sont nommées (leur nom n'est pas nominatif), les joueurs comptés.
 */

const { z } = require('zod');
const { defineDomainTool, req, pageOf, pageParams, paged } = require('./factory');
const { gameIdParam, loadGameOrThrow, readGl } = require('./glCommon');
const { formatGame, loadGamesList, loadTeamsWithPath } = require('../../../glDiagnostic');

const TOOL = 'gl_games';

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : parties (liste, détail)',
  intro:
    'Parties Gnomes & Licornes : liste filtrable (classe, statut, mode « Tenir à deux ») avec plateau, surface, tour courant et phase ; détail d’une partie avec ses équipes (peuple, pion, au camp, nombre de membres). Réservé au staff G&L (maître du jeu) de la personne connectée ; aucun nom d’élève.',
  actions: {
    list: {
      summary: 'parties (filtres : class_id, status, tenir)',
      params: {
        class_id: z.number().int().min(1).describe('Classe G&L (gl_classes.id)'),
        status: z.enum(['draft', 'live', 'paused', 'ended']).describe('Statut de la partie'),
        tenir: z
          .boolean()
          .describe('true = parties « Tenir à deux » seulement, false = classiques'),
        ...pageParams,
      },
      run: (args, ctx) =>
        readGl(ctx, async (db) => {
          const rows = await loadGamesList(db, {
            classId: args.class_id ?? null,
            status: args.status ?? null,
            tenir: args.tenir ?? null,
          });
          const p = pageOf(args, ctx);
          return paged(rows.slice(p.offset, p.offset + p.limit), p, { total: rows.length });
        }),
    },
    get: {
      summary: 'une partie : réglages de mode, équipes (peuple, pion, au camp), effectifs',
      params: { game_id: req(gameIdParam) },
      run: (args, ctx) =>
        readGl(ctx, async (db) => {
          const row = await loadGameOrThrow(db, args.game_id);
          const { teams, campIndex } = await loadTeamsWithPath(db, row);
          const members = await db.queryOne(
            'SELECT COUNT(DISTINCT player_id) AS n FROM gl_team_members WHERE game_id = ?',
            [args.game_id],
          );
          return formatGame(row, {
            campIndex,
            playersCount: Number(members?.n) || 0,
            teams,
          });
        }),
    },
  },
});

module.exports = { buildGlGamesTool: () => tool };
