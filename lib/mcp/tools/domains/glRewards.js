'use strict';

/**
 * `gl_rewards` — badges individuels « Tenir à deux » (domaine `gl`).
 *
 * Le moteur (`lib/glRewards.js`, routes `/api/gl/rewards/*`, migration 342) est livré par un
 * autre lot : l'outil appelle ses routes par le pont G&L et, si elles manquent sur ce serveur
 * (404), répond `MCP_NOT_AVAILABLE` (« badges G&L non livrés sur ce serveur »).
 *
 * - `vitrine` : `GET /api/gl/rewards/games/:id` — familles × paliers par membre et « à un pas
 *   du palier suivant », **tri par nom, jamais de classement** ; sans bypass RGPD les pseudos
 *   sont retirés (identifiants seulement) ; `class_id` fusionne les vitrines des parties de la
 *   classe ;
 * - `award` (écriture) : `POST /api/gl/rewards/games/:id/award { playerId, type, note }` — badge
 *   décerné avec un mot obligatoire ; aucun badge ne donne de ressource (règle § 1.5).
 */

const { z } = require('zod');
const { defineDomainTool, req, seg } = require('./factory');
const { callGlApiOrUnavailable, requireGlStaff } = require('../../glBridge');
const { McpToolError } = require('../../registry');
const { RANKING_KEYS_RE, readGl } = require('./glCommon');

const TOOL = 'gl_rewards';
const UNAVAILABLE = 'Badges G&L non livrés sur ce serveur (routes /api/gl/rewards absentes)';
const CLASS_GAMES_MAX = 20;

/** Retire toute clé de classement (défense : la route n'en produit pas, le contrat l'exige). */
function stripRanking(value) {
  if (Array.isArray(value)) return value.map(stripRanking);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (RANKING_KEYS_RE.test(k)) continue;
      out[k] = stripRanking(v);
    }
    return out;
  }
  return value;
}

function normalizeShowcase(res, { nominative }) {
  const players = Array.isArray(res?.players)
    ? res.players
    : Array.isArray(res?.students)
      ? res.students
      : [];
  const near = Array.isArray(res?.near) ? res.near : [];
  const byName = (a, b) =>
    String(a.name || a.id).localeCompare(String(b.name || b.id), 'fr', { sensitivity: 'base' });
  const items = [...players].sort(byName).map((p) => ({
    player_id: String(p.id),
    ...(nominative ? { name: p.name } : {}),
    families: p.families || {},
    total: Number(p.total) || 0,
  }));
  const nearItems = [...near].sort(byName).map((n) => {
    const { name, studentId, ...rest } = n;
    return {
      player_id: String(studentId ?? n.playerId ?? ''),
      ...(nominative ? { name } : {}),
      ...rest,
    };
  });
  return stripRanking({
    game: res?.game || null,
    players: items,
    near: nearItems,
    families: res?.families || [],
    tiers: res?.tiers || [],
    manualTypes: res?.manualTypes || [],
  });
}

async function showcaseOf(ctx, gameId, staff) {
  return callGlApiOrUnavailable(ctx, 'GET', `/api/gl/rewards/games/${seg(gameId)}`, undefined, {
    tool: TOOL,
    staff,
    unavailableMessage: UNAVAILABLE,
  });
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : badges (vitrine sans classement, badge décerné)',
  intro:
    'Badges individuels « Tenir à deux » : vitrine d’une partie ou d’une classe (familles × paliers par membre, « à un pas du palier suivant »), triée par nom, jamais de classement ; pseudos seulement si le bypass RGPD est actif, sinon identifiants. Attribution d’un badge décerné avec un mot obligatoire (aucun badge ne donne de ressource). Si le moteur des badges n’est pas livré sur ce serveur : MCP_NOT_AVAILABLE. Réservé au staff G&L.',
  actions: {
    vitrine: {
      summary: 'vitrine d’une partie (game_id) ou d’une classe (class_id), sans classement',
      params: {
        game_id: z.number().int().min(1).describe('Partie (gl_games.id)'),
        class_id: z.number().int().min(1).describe('Classe : vitrines des parties fusionnées'),
      },
      run: async (args, ctx) => {
        if (!args.game_id && !args.class_id) {
          throw new McpToolError('game_id ou class_id requis', 'MCP_INVALID_ARGS');
        }
        const nominative = !!ctx.privacyBypass;
        if (args.game_id) {
          const staff = await requireGlStaff(ctx);
          const res = await showcaseOf(ctx, args.game_id, staff);
          return { ...normalizeShowcase(res, { nominative }), nominative };
        }
        const gameIds = await readGl(ctx, (db) =>
          db
            .queryAll(
              `SELECT id FROM gl_games WHERE class_id = ? ORDER BY updated_at DESC, id DESC LIMIT ${CLASS_GAMES_MAX}`,
              [args.class_id],
            )
            .then((rows) => rows.map((r) => Number(r.id))),
        );
        if (!gameIds.length) throw new McpToolError('Classe sans partie', 'MCP_NOT_FOUND');
        const staff = await requireGlStaff(ctx);
        const merged = new Map();
        const near = [];
        let meta = null;
        for (const gameId of gameIds) {
          const s = normalizeShowcase(await showcaseOf(ctx, gameId, staff), { nominative });
          if (!meta) meta = { families: s.families, tiers: s.tiers, manualTypes: s.manualTypes };
          for (const p of s.players) if (!merged.has(p.player_id)) merged.set(p.player_id, p);
          for (const n of s.near) {
            if (!near.some((x) => x.player_id === n.player_id && x.key === n.key)) near.push(n);
          }
        }
        const byName = (a, b) =>
          String(a.name || a.player_id).localeCompare(String(b.name || b.player_id), 'fr', {
            sensitivity: 'base',
          });
        return {
          class_id: args.class_id,
          games: gameIds,
          players: [...merged.values()].sort(byName),
          near: near.sort(byName),
          ...(meta || { families: [], tiers: [], manualTypes: [] }),
          nominative,
        };
      },
    },
    award: {
      summary: 'décerner un badge à un élève (type du catalogue manuel, mot obligatoire)',
      write: true,
      params: {
        game_id: req(z.number().int().min(1).describe('Partie (gl_games.id)')),
        player_id: req(z.number().int().min(1).describe('Joueur (gl_players.id)')),
        type: req(z.string().min(1).max(64).describe('Type de badge décerné (catalogue manuel)')),
        note: req(z.string().min(1).max(280).describe('Mot pour l’élève (obligatoire)')),
      },
      run: async (args, ctx) => {
        const res = await callGlApiOrUnavailable(
          ctx,
          'POST',
          `/api/gl/rewards/games/${seg(args.game_id)}/award`,
          { playerId: args.player_id, type: args.type, note: args.note },
          { tool: TOOL, unavailableMessage: UNAVAILABLE },
        );
        return stripRanking({ ok: true, game_id: args.game_id, player_id: args.player_id, ...res });
      },
    },
  },
});

module.exports = { buildGlRewardsTool: () => tool, normalizeShowcase, stripRanking };
