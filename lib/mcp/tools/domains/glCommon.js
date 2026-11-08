'use strict';

/**
 * Briques communes des outils de domaine **Gnomes & Licornes** (`gl_*`, domaine `gl`).
 *
 * - `readGl(ctx, work)` : lecture SQL agrégée en transaction READ ONLY (pool principal, tables
 *   de partie hors liste blanche de contenu), **après** avoir vérifié que la personne connectée
 *   est staff G&L (`requireGlStaff`) — la permission applicative équivalente est celle du
 *   maître du jeu (`gl.game.manage`) ; le SQL ne contourne pas le RBAC du jeu ;
 * - `loadGameOrThrow` : la partie demandée, ou `MCP_NOT_FOUND` ;
 * - paramètres zod partagés (`gameIdParam`, `teamIdParam`, `playerIdParam`).
 *
 * Garde-fous (docs/GL_TENIR_A_DEUX_REGLES.md § 1) : aucun nom d'élève hors action nominative,
 * jamais de classement, soldes agrégés par équipe par défaut.
 */

const { z } = require('zod');
const { requireGlStaff } = require('../../glBridge');
const { McpToolError } = require('../../registry');
const { loadGameOverview } = require('../../../glDiagnostic');

const TRUSTED = Object.freeze({ astValidated: true });

const gameIdParam = z.number().int().min(1).describe('Identifiant de la partie (gl_games.id)');
const teamIdParam = z.number().int().min(1).describe('Identifiant de l’équipe (gl_teams.id)');
const playerIdParam = z
  .number()
  .int()
  .min(1)
  .describe('Identifiant du joueur (gl_players.id, jamais un nom)');

/** Exécuteur `{ queryAll, queryOne }` sur la connexion READ ONLY du connecteur. */
function adapter(db) {
  return {
    queryAll: (sql, params = []) => db.raw(sql, params, TRUSTED),
    queryOne: async (sql, params = []) => (await db.raw(sql, params, TRUSTED))[0] || null,
  };
}

/**
 * Lecture G&L : staff vérifié, puis `work(db, staff)` dans `withReadOnly` (pool principal).
 * @template T
 * @param {object} ctx
 * @param {(db: { queryAll: Function, queryOne: Function }, staff: object) => Promise<T>} work
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<T>}
 */
async function readGl(ctx, work, opts = {}) {
  const staff = await requireGlStaff(ctx);
  const { withReadOnly } = require('../../readDb');
  return withReadOnly((db) => work(adapter(db), staff), {
    appPool: true,
    timeoutMs: opts.timeoutMs || 15000,
  });
}

async function loadGameOrThrow(db, gameId) {
  const game = await loadGameOverview(db, gameId);
  if (!game) throw new McpToolError(`Partie introuvable : ${gameId}`, 'MCP_NOT_FOUND');
  return game;
}

/** Réglages de jeu courants (cache 30 s de `lib/glSettings.js`). */
function gameplaySettings() {
  const { getGameplaySettings } = require('../../../glSettings');
  return getGameplaySettings();
}

/** Clés qui trahiraient un classement : jamais dans une réponse G&L (garde-fou § 1.6). */
const RANKING_KEYS_RE = /^(?:rank|rang|classement|position|score|podium)$/i;

module.exports = {
  RANKING_KEYS_RE,
  TRUSTED,
  adapter,
  gameIdParam,
  gameplaySettings,
  loadGameOrThrow,
  playerIdParam,
  readGl,
  teamIdParam,
};
