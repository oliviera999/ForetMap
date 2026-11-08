'use strict';

/**
 * `gl_tour` — gestes du prof sur une partie « Tenir à deux » (domaine `gl`, **écriture**).
 *
 * Toutes les actions passent par le **pont G&L** (`lib/mcp/glBridge.js`) vers les routes du
 * moteur, en tant que staff G&L de la personne connectée : logique métier du tour, évènements
 * du journal, temps réel et journal d'audit sont ceux de l'application. Chaque action renvoie
 * l'état **avant / après** (statut, tour, phase, équipe active, voile, pions).
 *
 * | action            | route                                           |
 * | ----------------- | ----------------------------------------------- |
 * | `ouvrir`          | `POST /games/:id/tenir/tour/ouvrir`             |
 * | `phase`           | `POST /games/:id/tenir/tour/phase`              |
 * | `voile_dort`      | `POST …/tenir/tour/phase { phase: souffle, dort }` |
 * | `equipe_suivante` | `POST …/tenir/tour/equipe-suivante`             |
 * | `avance_libre`    | `POST …/tenir/lancer { mode: libre }`           |
 * | `absences`        | `POST …/tenir/tour/absences`                    |
 * | `retrait`         | `POST …/tenir/retrait`                          |
 * | `clore_partie`    | `POST /games/:id/end`                           |
 *
 * Portée `foretmap.write`, pont actif, confirmation selon `mcp.confirm_mode`. Les élèves ne sont
 * désignés que par identifiant (jamais un nom) ; le motif d'un retrait n'entre dans aucun
 * payload public (règle de la route).
 */

const { z } = require('zod');
const { defineDomainTool, req, seg } = require('./factory');
const { callGlApi, requireGlStaff } = require('../../glBridge');
const { gameIdParam, playerIdParam, teamIdParam, adapter } = require('./glCommon');
const { loadTourSummary } = require('../../../glDiagnostic');

const TOOL = 'gl_tour';

async function summary(gameId) {
  const { withReadOnly } = require('../../readDb');
  return withReadOnly((db) => loadTourSummary(adapter(db), gameId), { appPool: true });
}

/** Exécute un geste : résumé avant, route, résumé après. */
async function geste(ctx, gameId, method, path, body) {
  const staff = await requireGlStaff(ctx);
  const avant = await summary(gameId);
  const resultat = await callGlApi(ctx, method, path, body, { tool: TOOL, staff });
  const apres = await summary(gameId);
  return { ok: true, resultat, avant, apres };
}

const tour = (gameId, suffix) => `/api/gl/games/${seg(gameId)}/tenir/tour/${suffix}`;

const tool = defineDomainTool({
  name: TOOL,
  domain: 'gl',
  title: 'G&L : gestes du prof sur le tour (écriture)',
  intro:
    'Gestes du maître du jeu sur une partie « Tenir à deux », par les routes du moteur : ouvrir un tour, changer de phase (ouverture → jeu → souffle → clos), laisser dormir le voile, passer à l’équipe suivante, avance libre d’une équipe (motif obligatoire), absences du tour, retrait d’un élève (entrée / sortie), clore la partie. Chaque action renvoie l’état avant / après. Élèves désignés par identifiant seulement.',
  actions: {
    ouvrir: {
      summary: 'ouvrir le tour suivant (ordre inverse du plateau, vent de la caravane)',
      write: true,
      params: { game_id: req(gameIdParam) },
      run: (args, ctx) => geste(ctx, args.game_id, 'POST', tour(args.game_id, 'ouvrir'), {}),
    },
    phase: {
      summary:
        'changer de phase (jeu, souffle, clos) ; souffle : faces du dé gris saisies ou tirées',
      write: true,
      params: {
        game_id: req(gameIdParam),
        phase: req(z.enum(['ouverture', 'jeu', 'souffle', 'clos']).describe('Phase visée')),
        faces: z
          .array(z.number().int().min(1).max(6))
          .min(1)
          .max(2)
          .describe('Souffle : faces du dé gris saisies (sinon tirage serveur)'),
      },
      run: (args, ctx) =>
        geste(ctx, args.game_id, 'POST', tour(args.game_id, 'phase'), {
          phase: args.phase,
          ...(args.faces ? { faces: args.faces } : {}),
        }),
    },
    voile_dort: {
      summary: 'passer en phase souffle en laissant dormir le voile (aucun dé gris)',
      write: true,
      params: { game_id: req(gameIdParam) },
      run: (args, ctx) =>
        geste(ctx, args.game_id, 'POST', tour(args.game_id, 'phase'), {
          phase: 'souffle',
          dort: true,
        }),
    },
    equipe_suivante: {
      summary: 'surface tableau : passer la main à l’équipe suivante de l’ordre',
      write: true,
      params: { game_id: req(gameIdParam) },
      run: (args, ctx) =>
        geste(ctx, args.game_id, 'POST', tour(args.game_id, 'equipe-suivante'), {}),
    },
    avance_libre: {
      summary: 'avancer une équipe de 1 à 12 cases avec motif (effets de case appliqués)',
      write: true,
      params: {
        game_id: req(gameIdParam),
        team_id: req(teamIdParam),
        cases: req(z.number().int().min(1).max(12).describe('Nombre de cases (1 à 12)')),
        motif: req(z.string().min(3).max(200).describe('Motif journalisé (3 caractères au moins)')),
      },
      run: (args, ctx) =>
        geste(ctx, args.game_id, 'POST', `/api/gl/games/${seg(args.game_id)}/tenir/lancer`, {
          mode: 'libre',
          teamId: args.team_id,
          cases: args.cases,
          motif: args.motif,
        }),
    },
    absences: {
      summary: 'absents du tour courant (liste complète d’identifiants, vide = personne)',
      write: true,
      params: {
        game_id: req(gameIdParam),
        player_ids: req(z.array(playerIdParam).max(60).describe('Identifiants des absents')),
      },
      run: (args, ctx) =>
        geste(ctx, args.game_id, 'POST', tour(args.game_id, 'absences'), {
          playerIds: args.player_ids,
        }),
    },
    retrait: {
      summary: 'retrait d’un élève (entree=true) ou retour (entree=false), hors économie',
      write: true,
      params: {
        game_id: req(gameIdParam),
        player_id: req(playerIdParam),
        entree: z.boolean().describe('true = entrée en retrait (défaut), false = sortie'),
        motif: z.string().max(300).describe('Motif (vu du prof seulement)'),
      },
      run: (args, ctx) =>
        geste(ctx, args.game_id, 'POST', `/api/gl/games/${seg(args.game_id)}/tenir/retrait`, {
          playerId: args.player_id,
          entree: args.entree !== false,
          ...(args.motif ? { motif: args.motif } : {}),
        }),
    },
    clore_partie: {
      summary: 'clore la partie (statut ended) — Seuil : honneurs, titres, extinction des réserves',
      write: true,
      params: { game_id: req(gameIdParam) },
      run: (args, ctx) =>
        geste(ctx, args.game_id, 'POST', `/api/gl/games/${seg(args.game_id)}/end`, {}),
    },
  },
});

module.exports = { buildGlTourTool: () => tool };
