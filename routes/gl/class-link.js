'use strict';

/**
 * « Tenir à deux », lot 2 — lien de classe (QR permanent) et sessions d'équipe. Monté sous
 * `/api/gl` (server.js).
 *
 * Prof (`gl.game.manage`) :
 * - `GET  /classes/:classId/lien` → `{ url, code, className }` (créé au besoin) ;
 * - `POST /classes/:classId/lien/regenerer` → nouveau lien, sessions de la classe révoquées ;
 * - `GET  /games/:id/tenir/sessions` → sessions d'équipe ouvertes aujourd'hui, demandes en attente ;
 * - `POST /games/:id/tenir/sessions/accepter-tout` → « Tout accepter » (début de séance) ;
 * - `DELETE /games/:id/tenir/sessions/:sessionId` → « Déconnecter » une tablette.
 *
 * Tablette (public, limité en débit comme une connexion) :
 * - `POST /class-link/open { token | code }` → classe, partie en cours, équipes, phase ;
 * - `POST /class-link/session { token | code, teamId }` → **demande** de session d'équipe : le
 *   jeton rendu ne vaut qu'une fois la demande acceptée (ensemble unifié, M13) ;
 * - `GET  /class-link/demande` (jeton de la demande) → `en_attente`, `acceptee`, `refusee`,
 *   `expiree`.
 *
 * Appareil déjà dans l'équipe (tablette acceptée, compte d'un membre) ou prof :
 * - `POST /games/:id/tenir/sessions/:sessionId/accepter` | `/refuser`.
 */

const express = require('express');
const db = require('../../database');
const {
  requireGlPermission,
  requireGlAuthOrTeam,
  authenticateGl,
} = require('../../middleware/requireGlAuth');
const asyncHandler = require('../../lib/asyncHandler');
const { parseId } = require('../../lib/shared/httpHelpers');
const classLink = require('../../lib/glClassLink');
const {
  listTeamSessions,
  revokeTeamSessions,
  acceptTeamSessions,
  readTeamSessionRequest,
  listTeamSessionRequests,
} = require('../../lib/glGuestToken');
const equipeEtat = require('../../lib/glEquipeEtat');
const { CODE_SPECTATEUR, MESSAGE_SPECTATEUR } = require('../../lib/shared/glMainCore');
const { actorOf } = require('../../lib/glActeur');

const router = express.Router();

const ERRORS = Object.freeze({
  CLASS_NOT_FOUND: 'Classe introuvable',
  CLASS_LINK_INCONNU: 'Ce code de classe n’est pas reconnu. Vérifiez-le avec votre professeur.',
  CLASS_LINK_SANS_PARTIE: 'Aucune partie n’est en cours pour cette classe. Attendez le prof.',
  TEAM_NOT_FOUND: 'Équipe introuvable dans cette partie',
});

function sendLinkError(res, err) {
  const message = ERRORS[err?.message];
  if (message && err.status) {
    return res.status(err.status).json({ error: message, code: err.message });
  }
  throw err;
}

/**
 * Lien servi au prof : adresse relative (`gl.html?classe=<jeton>`, comme le lien de projection)
 * et code à saisir. Le client en fait l'adresse complète et le QR de la page imprimable.
 */
function publicLink(link) {
  return {
    classId: link.classId,
    className: link.className,
    code: link.code,
    url: link.url,
    ...(link.sessionsRevoquees != null ? { sessionsRevoquees: link.sessionsRevoquees } : {}),
  };
}

router.get(
  '/classes/:classId/lien',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const classId = parseId(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Identifiant de classe invalide' });
    try {
      const link = await classLink.ensureClassLink(db, {
        classId,
        createdBy: Number(req.glAuth.userId) || null,
      });
      return res.json(publicLink(link));
    } catch (err) {
      return sendLinkError(res, err);
    }
  }),
);

router.post(
  '/classes/:classId/lien/regenerer',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const classId = parseId(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Identifiant de classe invalide' });
    try {
      const link = await classLink.regenerateClassLink(db, {
        classId,
        createdBy: Number(req.glAuth.userId) || null,
      });
      return res.json(publicLink(link));
    } catch (err) {
      return sendLinkError(res, err);
    }
  }),
);

router.post(
  '/class-link/open',
  asyncHandler(async (req, res) => {
    try {
      return res.json(
        await classLink.openClassLink(db, { token: req.body?.token, code: req.body?.code }),
      );
    } catch (err) {
      return sendLinkError(res, err);
    }
  }),
);

router.post(
  '/class-link/session',
  asyncHandler(async (req, res) => {
    const teamId = parseId(req.body?.teamId);
    if (!teamId) return res.status(400).json({ error: 'teamId requis' });
    try {
      const session = await classLink.openTeamSession(db, {
        token: req.body?.token,
        code: req.body?.code,
        teamId,
      });
      // Les appareils de l'équipe et la console du prof voient arriver la demande.
      equipeEtat.signalerEquipe(session.gameId, session.teamId, 'appareil');
      return res.status(202).json(session);
    } catch (err) {
      return sendLinkError(res, err);
    }
  }),
);

/**
 * L'appareil qui attend lit où en est sa demande, avec le jeton qu'elle lui a rendu (compté
 * par appareil dans le plafond de l'API, jamais par adresse).
 */
router.get(
  '/class-link/demande',
  asyncHandler(async (req, res) => {
    const auth = await authenticateGl(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    const demande = auth.glAuth.teamSession
      ? await readTeamSessionRequest(db, auth.glAuth.teamSession)
      : null;
    if (!demande) return res.status(404).json({ error: 'Demande introuvable' });
    return res.json(demande);
  }),
);

/**
 * Qui peut répondre à une demande d'appareil ? Le prof, une tablette déjà acceptée dans
 * l'équipe, ou le compte d'un membre de l'équipe.
 */
async function peutRepondre(req, gameId, teamId) {
  const actor = actorOf(req);
  if (actor.kind === 'mj') return 'mj';
  if (actor.kind === 'team') {
    return Number(actor.gameId) === gameId && Number(actor.teamId) === teamId ? 'equipe' : null;
  }
  if (actor.kind !== 'player') return null;
  const row = await db.queryOne(
    'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
    [gameId, actor.playerId],
  );
  if (row?.team_id == null || Number(row.team_id) !== teamId) return null;
  // Un élève absent du tour, ou en retrait, regarde : il ne fait pas entrer un appareil (sans
  // quoi il jouerait par la tablette qu'il vient d'accepter).
  const tour = await equipeEtat.lireTour(db, gameId);
  if (
    tour?.ouvert &&
    (await equipeEtat.estSpectateur(db, {
      gameId,
      playerId: actor.playerId,
      roundNumber: tour.roundNumber,
    }))
  ) {
    return 'spectateur';
  }
  return 'eleve';
}

for (const decision of ['accepter', 'refuser']) {
  router.post(
    `/games/:id/tenir/sessions/:sessionId/${decision}`,
    requireGlAuthOrTeam,
    asyncHandler(async (req, res) => {
      const gameId = parseId(req.params.id);
      const sessionId = parseId(req.params.sessionId);
      if (!gameId || !sessionId) return res.status(400).json({ error: 'Identifiant invalide' });
      const demande = (await listTeamSessionRequests(db, gameId)).find((d) => d.id === sessionId);
      if (!demande) {
        return res.status(404).json({
          error: 'Cette demande n’attend plus : elle a expiré ou quelqu’un y a déjà répondu.',
          code: 'DEMANDE_APPAREIL_INTROUVABLE',
        });
      }
      const par = await peutRepondre(req, gameId, demande.teamId);
      if (!par) return res.status(403).json({ error: 'Permission insuffisante' });
      if (par === 'spectateur') {
        return res.status(403).json({ error: MESSAGE_SPECTATEUR, code: CODE_SPECTATEUR });
      }
      const n =
        decision === 'accepter'
          ? await acceptTeamSessions(db, { gameId, id: sessionId, par })
          : await revokeTeamSessions(db, { id: sessionId, gameId });
      equipeEtat.signalerEquipe(gameId, demande.teamId, 'appareil');
      return res.json({ ok: n > 0, teamId: demande.teamId });
    }),
  );
}

router.post(
  '/games/:id/tenir/sessions/accepter-tout',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const acceptees = await acceptTeamSessions(db, { gameId, par: 'mj' });
    if (acceptees) equipeEtat.signalerEquipe(gameId, null, 'appareil');
    return res.json({ ok: true, acceptees });
  }),
);

router.get(
  '/games/:id/tenir/sessions',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    return res.json({
      sessions: await listTeamSessions(db, gameId),
      demandes: await listTeamSessionRequests(db, gameId),
    });
  }),
);

router.delete(
  '/games/:id/tenir/sessions/:sessionId',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const sessionId = parseId(req.params.sessionId);
    if (!gameId || !sessionId) return res.status(400).json({ error: 'Identifiant invalide' });
    const row = await db.queryOne(
      'SELECT jti_hash, team_id FROM gl_guest_tokens WHERE id = ? AND game_id = ? LIMIT 1',
      [sessionId, gameId],
    );
    const revoquees = await revokeTeamSessions(db, { id: sessionId, gameId });
    if (!revoquees) return res.status(404).json({ error: 'Session introuvable' });
    // Une tablette déconnectée ne garde pas la main de son équipe.
    if (row?.jti_hash) {
      await equipeEtat.rendreLesMainsDuPorteur(db, `s:${String(row.jti_hash).slice(0, 16)}`);
      equipeEtat.signalerEquipe(gameId, row.team_id, 'main');
    }
    return res.json({ ok: true });
  }),
);

module.exports = router;
