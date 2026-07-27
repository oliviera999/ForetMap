'use strict';

/**
 * Familles de médias privées stockées sous `uploads/` mais qui NE doivent PAS être servies
 * par le montage statique `/uploads` (cf. audit B2, docs/AUDIT_BUGS_2026-07.md).
 *
 * Contexte : `uploads/` est volontairement public pour les familles documentées dans
 * `docs/API.md` (`zones/`, `markers/`, `tasks/`, `forum-posts/`, `context-comments/`,
 * `students/`, `media-library/`…). Deux familles y cohabitaient alors qu'elles sont
 * soumises à autorisation applicative :
 *  - `observations/` — photos du carnet n3beur (`GET /api/observations/:id/image`) ;
 *  - `task-logs/`    — photos des journaux de tâche (`GET /api/tasks/:id/logs/:logId/image`).
 *
 * Les fichiers y restent stockés (aucune migration de disque) : seul l'accès direct est
 * refusé, ce qui force le passage par la route API qui, elle, contrôle les droits.
 */

const PRIVATE_UPLOAD_PREFIXES = Object.freeze(['observations', 'task-logs']);

/**
 * Normalise un chemin d'URL en segments comparables, de la même façon que le fera
 * `express.static` : décodage pourcent, séparateurs Windows, segments vides et `.` ignorés.
 * @returns {string[] | null} segments en minuscules, ou `null` si le chemin est suspect (`..`).
 */
function normalizeUploadPathSegments(urlPath) {
  let raw = urlPath == null ? '' : String(urlPath);
  try {
    raw = decodeURIComponent(raw);
  } catch (_) {
    // Séquence de pourcentage invalide : on compare la forme brute plutôt que d'échouer.
  }
  const segments = [];
  for (const part of raw.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') return null;
    segments.push(part.toLowerCase());
  }
  return segments;
}

/**
 * Vrai si le chemin (relatif au montage `/uploads`) vise une famille privée.
 * Un chemin contenant `..` est considéré comme privé (refus par défaut).
 */
function isPrivateUploadPath(urlPath) {
  const segments = normalizeUploadPathSegments(urlPath);
  if (segments === null) return true;
  if (!segments.length) return false;
  return PRIVATE_UPLOAD_PREFIXES.includes(segments[0]);
}

/**
 * Middleware à monter sur `/uploads` AVANT `express.static` : renvoie 403 pour les familles
 * privées, laisse passer tout le reste.
 */
function createPrivateUploadsGuard() {
  return function privateUploadsGuard(req, res, next) {
    if (!isPrivateUploadPath(req.path)) return next();
    return res.status(403).json({
      error: 'Média privé : passer par la route API dédiée',
      code: 'PRIVATE_UPLOAD',
    });
  };
}

module.exports = {
  PRIVATE_UPLOAD_PREFIXES,
  normalizeUploadPathSegments,
  isPrivateUploadPath,
  createPrivateUploadsGuard,
};
