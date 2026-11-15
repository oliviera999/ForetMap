'use strict';

/**
 * Acteur unique d'une requête de partie G&L (« Tenir à deux », lot 2).
 *
 * `req.glAuth.actor`, posé par `middleware/requireGlAuth.js`, dit QUI agit :
 * - `{ kind: 'mj' }` : le prof (peut agir pour n'importe quelle équipe) ;
 * - `{ kind: 'player', playerId }` : un élève connecté avec son compte ;
 * - `{ kind: 'team', gameId, teamId }` : une tablette d'équipe (session ouverte par le lien de
 *   classe) — droits d'un membre de l'équipe, sans retrait, pour CETTE partie et CETTE équipe ;
 * - `{ kind: 'projection', gameId }` : lecture seule ; `{ kind: 'guest' }` : invité ordinaire.
 *
 * Les routes de partie passent par `resolveGameActor` (quelle équipe ? quel acteur de
 * journal ?) et, pour un geste qui touche une bourse individuelle, par `resolveActingPlayer`
 * (« au nom de » : la tablette demande « Qui agit ? »). Le serveur rejoue toujours les droits.
 */

const database = require('../database');
const { isPlayerEnRetrait, listPresentMembers } = require('./glTenir');

/** Acteur décrit par un `glAuth` hydraté. Une session d'équipe doit avoir été validée. */
function buildActor(glAuth) {
  if (!glAuth) return { kind: 'guest' };
  if (glAuth.userType === 'gl_admin') return { kind: 'mj' };
  if (glAuth.userType === 'gl_player') {
    return { kind: 'player', playerId: Number(glAuth.userId) };
  }
  if (glAuth.teamSession && glAuth.teamSessionValide === true) {
    return {
      kind: 'team',
      gameId: Number(glAuth.teamSession.gameId),
      teamId: Number(glAuth.teamSession.teamId),
    };
  }
  if (glAuth.projection && Number(glAuth.projection.gameId) > 0) {
    return { kind: 'projection', gameId: Number(glAuth.projection.gameId) };
  }
  return { kind: 'guest' };
}

function actorOf(req) {
  return req?.glAuth?.actor || buildActor(req?.glAuth);
}

function isTeamSession(req) {
  return actorOf(req).kind === 'team';
}

function refus(status, error, code = null) {
  return { ok: false, status, error, ...(code ? { code } : {}) };
}

/**
 * Qui agit, et pour quelle équipe ?
 *
 * @param {object} req requête authentifiée
 * @param {number} gameId partie visée
 * @param {object} [opts]
 * @param {number|string|null} [opts.teamIdFromBody] équipe demandée (obligatoire pour le prof
 *   si `teamRequired`)
 * @param {boolean} [opts.teamRequired] le prof doit nommer une équipe (défaut vrai)
 * @param {object} [opts.db] `{ queryOne, queryAll }`
 * @returns {Promise<{ ok: true, kind, actorKind, teamId, playerId, enRetrait, actorType,
 *   actorId } | { ok: false, status, error, code? }>} `actorKind` est le rôle lu par
 *   `resolveTenirPermissions` (`mj` ou `player` : une tablette d'équipe a les droits d'un
 *   membre) ; `actorType` / `actorId` vont au journal.
 */
async function resolveGameActor(req, gameId, opts = {}) {
  const { teamIdFromBody = null, teamRequired = true, db = database } = opts;
  const actor = actorOf(req);
  const asked =
    teamIdFromBody != null && Number(teamIdFromBody) > 0 ? Number(teamIdFromBody) : null;

  if (actor.kind === 'mj') {
    if (asked == null && teamRequired) return refus(400, 'teamId requis pour le MJ');
    return {
      ok: true,
      kind: 'mj',
      actorKind: 'mj',
      teamId: asked,
      playerId: null,
      enRetrait: false,
      actorType: 'mj',
      actorId: String(req.glAuth.userId),
    };
  }
  if (actor.kind === 'player') {
    const membership = await db.queryOne(
      'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
      [gameId, actor.playerId],
    );
    if (!membership?.team_id) return refus(403, 'Joueur non rattaché à une équipe');
    return {
      ok: true,
      kind: 'player',
      actorKind: 'player',
      teamId: Number(membership.team_id),
      playerId: actor.playerId,
      enRetrait: await isPlayerEnRetrait(db, gameId, actor.playerId),
      actorType: 'team',
      actorId: String(actor.playerId),
    };
  }
  if (actor.kind === 'team') {
    if (Number(actor.gameId) !== Number(gameId)) {
      return refus(403, 'Cette tablette joue une autre partie', 'TEAM_SESSION_AUTRE_PARTIE');
    }
    if (asked != null && asked !== Number(actor.teamId)) {
      return refus(403, 'Cette tablette joue pour une autre équipe', 'TEAM_SESSION_AUTRE_EQUIPE');
    }
    return {
      ok: true,
      kind: 'team',
      actorKind: 'player',
      teamId: Number(actor.teamId),
      playerId: null,
      // Le retrait reste individuel : une tablette d'équipe n'est jamais « en retrait ».
      enRetrait: false,
      actorType: 'team',
      // Préfixe : un identifiant d'équipe ne doit jamais se lire comme un identifiant d'élève.
      actorId: `equipe-${actor.teamId}`,
    };
  }
  return refus(403, 'Compte requis pour cette ressource');
}

/**
 * Une tablette d'équipe n'agit que lorsqu'un tour est ouvert (hors tour : lecture seule).
 * @returns {Promise<null | { ok: false, status, error, code }>} `null` si le geste est permis
 */
async function refusSiTeamSessionHorsTour(req, gameId, db = database) {
  if (actorOf(req).kind !== 'team') return null;
  const row = await db.queryOne(
    `SELECT r.phase FROM gl_games g
       LEFT JOIN gl_game_rounds r ON r.game_id = g.id AND r.round_number = g.current_round_number
      WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  const phase = row?.phase || null;
  if (phase && phase !== 'clos') return null;
  return refus(409, 'Le tour n’est pas ouvert : attendez le prof.', 'TEAM_SESSION_HORS_TOUR');
}

/**
 * « Au nom de » : quel élève agit pour un geste qui touche une bourse individuelle (Marché,
 * « pas moi » du pot) ?
 * - élève connecté : lui-même ;
 * - tablette d'équipe : `onBehalfOfPlayerId` obligatoire, membre **présent** de l'équipe, non
 *   en retrait (sans mot de passe : la tablette demande « Qui agit ? ») ;
 * - prof : `onBehalfOfPlayerId` s'il en donne un (membre de l'équipe).
 *
 * @returns {Promise<{ ok: true, playerId: number|null, onBehalf: boolean } |
 *   { ok: false, status, error, code? }>}
 */
async function resolveActingPlayer(
  req,
  { gameId, teamId, onBehalfOfPlayerId = null, db = database },
) {
  const actor = actorOf(req);
  const asked =
    onBehalfOfPlayerId != null && Number(onBehalfOfPlayerId) > 0
      ? Number(onBehalfOfPlayerId)
      : null;
  if (actor.kind === 'player') {
    if (asked != null && asked !== actor.playerId) {
      return refus(403, 'On n’agit que pour soi depuis son propre compte', 'QUI_AGIT_INVALIDE');
    }
    return { ok: true, playerId: actor.playerId, onBehalf: false };
  }
  if (actor.kind !== 'team' && actor.kind !== 'mj') {
    return refus(403, 'Compte requis pour cette ressource');
  }
  if (asked == null) {
    if (actor.kind === 'mj') return { ok: true, playerId: null, onBehalf: false };
    return refus(400, 'Dites qui agit.', 'QUI_AGIT_REQUIS');
  }
  const game = await db.queryOne('SELECT current_round_number FROM gl_games WHERE id = ? LIMIT 1', [
    gameId,
  ]);
  const presents = await listPresentMembers(
    db,
    gameId,
    teamId,
    Number(game?.current_round_number) || 0,
  );
  if (!presents.includes(asked)) {
    return refus(
      403,
      'Cet élève n’est pas présent dans l’équipe (absent ou en retrait).',
      'QUI_AGIT_INVALIDE',
    );
  }
  return { ok: true, playerId: asked, onBehalf: true };
}

module.exports = {
  buildActor,
  actorOf,
  isTeamSession,
  resolveGameActor,
  refusSiTeamSessionHorsTour,
  resolveActingPlayer,
};
