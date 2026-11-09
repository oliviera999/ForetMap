'use strict';

/**
 * `gl_game_journal` — journal d'une partie G&L (domaine `gl`, lecture seule).
 *
 * Les évènements (`gl_game_events`) sont **libellés comme dans l'app** : même présentation que
 * `GET /api/gl/journal/games/:id` (`lib/glJournalPresent.js`, libellés tenir de
 * `lib/glJournalPresentTenir.js` quand la partie joue « Tenir à deux »). Les charges utiles
 * privées (`private: true` : retrait, chapardeur, nid, badge, bilan Team Spirit…) sont réduites
 * à leurs clés publiques par le filtre du moteur (`redactGameEventsForViewer`) **sauf** si le
 * bypass RGPD est actif pour la personne (vue `mj`). Pagination, filtres par type et par tour.
 */

const { z } = require('zod');
const { defineDomainTool, req, pageOf, pageParams, paged } = require('./factory');
const { gameIdParam, gameplaySettings, loadGameOrThrow, readGl } = require('./glCommon');
const { toIso } = require('../../../glDiagnostic');

const TOOL = 'gl_game_journal';
/** Lignes relues au plus avant filtrage en mémoire (type, tour). */
const SCAN_MAX = 5000;

function roundOf(payload) {
  const n = Number(payload?.roundNumber ?? payload?.round ?? payload?.round_number);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : journal d’une partie (libellés de l’app)',
  intro:
    'Journal d’une partie Gnomes & Licornes, évènements libellés comme dans l’application (titres et corps du journal, libellés « Tenir à deux » compris), du plus récent au plus ancien ; filtres par type d’évènement et par tour. Les charges utiles privées (retrait, chapardeur, nid, badge, bilan) sont expurgées sauf bypass RGPD actif. Réservé au staff G&L.',
  actions: {
    list: {
      summary: 'évènements libellés (filtres : type, round), plus récents d’abord',
      params: {
        game_id: req(gameIdParam),
        type: z
          .string()
          .max(64)
          .regex(/^[a-z0-9_*]+$/i, 'type invalide')
          .describe('Type d’évènement (ex. page_tenue, dice_roll, voile_avance ; préfixe avec *)'),
        round: z.number().int().min(1).describe('Tour (roundNumber de la charge utile)'),
        team_id: z.number().int().min(1).describe('Équipe (gl_teams.id)'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const settings = await gameplaySettings();
        return readGl(ctx, async (db) => {
          const game = await loadGameOrThrow(db, args.game_id);
          const { isTenirGame } = require('../../../glTenir');
          const { normalizeEventRow, redactGameEventsForViewer } = require('../../../glGameEvents');
          const { presentJournalEvent, buildTeamsById } = require('../../../glJournalPresent');
          const tenir = isTenirGame(settings, game);
          const where = ['game_id = ?'];
          const params = [args.game_id];
          if (args.team_id) {
            where.push('(team_id = ? OR team_id IS NULL)');
            params.push(args.team_id);
          }
          if (args.type) {
            if (args.type.endsWith('*')) {
              where.push('event_type LIKE ?');
              params.push(`${args.type.slice(0, -1).replace(/[%_]/g, '')}%`);
            } else {
              where.push('event_type = ?');
              params.push(args.type);
            }
          }
          const rows = await db.queryAll(
            `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
               FROM gl_game_events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${SCAN_MAX}`,
            params,
          );
          const teamRows = await db.queryAll(
            'SELECT id, name, color FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
            [args.game_id],
          );
          const teamsById = buildTeamsById(
            teamRows.map((t) => ({ id: Number(t.id), name: String(t.name || ''), color: t.color })),
          );
          const viewer = ctx.privacyBypass ? { kind: 'mj' } : { kind: 'player' };
          let events = redactGameEventsForViewer(rows.map(normalizeEventRow), viewer);
          if (args.round) events = events.filter((e) => roundOf(e.payload) === args.round);
          const p = pageOf(args, ctx, 50);
          const slice = events.slice(p.offset, p.offset + p.limit).map((evt) => {
            const pres = presentJournalEvent(evt, {
              teamsById,
              forPlayer: !ctx.privacyBypass,
              tenir,
            });
            return {
              id: Number(evt.id),
              createdAt: toIso(evt.createdAt ?? evt.created_at),
              eventType: evt.eventType,
              teamId: evt.teamId != null ? Number(evt.teamId) : null,
              teamName: pres.teamLabel || null,
              actorType: evt.actorType || null,
              roundNumber: roundOf(evt.payload),
              title: pres.title,
              body: pres.body,
              redacted: evt.payload?.redacted === true,
              payload: evt.payload,
            };
          });
          return paged(slice, p, {
            game_id: args.game_id,
            tenir,
            total: events.length,
            scanned: rows.length,
            truncated: rows.length >= SCAN_MAX,
            view: viewer.kind,
          });
        });
      },
    },
  },
});

module.exports = { buildGlGameJournalTool: () => tool };
