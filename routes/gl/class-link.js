'use strict';

/**
 * « Tenir à deux », lot 2 — lien de classe (QR permanent) et sessions d'équipe. Monté sous
 * `/api/gl` (server.js).
 *
 * Prof (`gl.game.manage`) :
 * - `GET  /classes/:classId/lien` → `{ url, code, className }` (créé au besoin) ;
 * - `POST /classes/:classId/lien/regenerer` → nouveau lien, sessions de la classe révoquées ;
 * - `GET  /games/:id/tenir/sessions` → sessions d'équipe ouvertes aujourd'hui ;
 * - `DELETE /games/:id/tenir/sessions/:sessionId` → « Déconnecter » une tablette.
 *
 * Tablette (public, limité en débit comme une connexion) :
 * - `POST /class-link/open { token | code }` → classe, partie en cours, équipes, phase ;
 * - `POST /class-link/session { token | code, teamId }` → jeton de session d'équipe (3 h).
 */

const express = require('express');
const db = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const asyncHandler = require('../../lib/asyncHandler');
const { parseId } = require('../../lib/shared/httpHelpers');
const classLink = require('../../lib/glClassLink');
const { listTeamSessions, revokeTeamSessions } = require('../../lib/glGuestToken');

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
      return res.status(201).json(
        await classLink.openTeamSession(db, {
          token: req.body?.token,
          code: req.body?.code,
          teamId,
        }),
      );
    } catch (err) {
      return sendLinkError(res, err);
    }
  }),
);

router.get(
  '/games/:id/tenir/sessions',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    return res.json({ sessions: await listTeamSessions(db, gameId) });
  }),
);

router.delete(
  '/games/:id/tenir/sessions/:sessionId',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const sessionId = parseId(req.params.sessionId);
    if (!gameId || !sessionId) return res.status(400).json({ error: 'Identifiant invalide' });
    const revoquees = await revokeTeamSessions(db, { id: sessionId, gameId });
    if (!revoquees) return res.status(404).json({ error: 'Session introuvable' });
    return res.json({ ok: true });
  }),
);

module.exports = router;
