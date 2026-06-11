'use strict';

/**
 * O10 — couche service « GL parties » : helpers purs extraits de `routes/gl/games.js`.
 * Aucune dépendance (DB/middleware) : `hasGlPermission` est injecté pour rester testable seul.
 */

const QCM_ANSWER_STAFF_PERMISSIONS = ['gl.event.emit', 'gl.game.manage', 'gl.mascot.position'];

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return Number(n.toFixed(2));
}

/** Un membre du staff (non joueur) peut-il valider un QCM pour une équipe ? `hasGlPermission` injecté. */
function staffCanAnswerQcmForTeam(auth, hasGlPermission) {
  if (!auth || auth.userType === 'gl_player') return false;
  return QCM_ANSWER_STAFF_PERMISSIONS.some((key) => hasGlPermission(auth, key));
}

/** Mappe une erreur métier roster → { status, error } (ou null si non géré → 500 central). */
function resolveRosterError(err) {
  if (err?.status === 404) {
    if (err.message === 'TEAM_NOT_FOUND') return { status: 404, error: 'Équipe introuvable' };
    if (err.message === 'PLAYER_NOT_FOUND') return { status: 404, error: 'Joueur introuvable' };
    if (err.message === 'GAME_NOT_FOUND') return { status: 404, error: 'Partie introuvable' };
    return { status: 404, error: 'Ressource introuvable' };
  }
  if (err?.status === 409 || err?.message === 'PLAYER_CLASS_MISMATCH') {
    return { status: 409, error: 'Le joueur n’appartient pas à la classe de cette partie' };
  }
  return null;
}

module.exports = {
  QCM_ANSWER_STAFF_PERMISSIONS,
  parseId,
  parsePct,
  staffCanAnswerQcmForTeam,
  resolveRosterError,
};
