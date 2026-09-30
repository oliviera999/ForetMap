'use strict';

/**
 * Familles de médias privées stockées sous `uploads/` : le montage statique `/uploads` ne les
 * sert PAS en accès direct (audit B2, `docs/AUDIT_BUGS_2026-07.md` ; constat RG4,
 * `docs/AUDIT_SECURITE_RGPD_2026-09-30.md`). Les fichiers restent sur le disque, au même
 * chemin (aucune migration) : seul l'accès par lien direct change.
 *
 * Deux régimes :
 *
 * 1. **Servies par une route API** (`ROUTE_ONLY_UPLOAD_PREFIXES`) — accès direct refusé en
 *    **403** `PRIVATE_UPLOAD`, lecture par la route qui contrôle les droits (le client charge
 *    l'image avec son jeton, `src/services/authedImageCache.js`) :
 *    - `observations/`  — photos des observations d'espèces (`observations/species/`,
 *                         `GET /api/species-observations/photos/:photoId/file`) ;
 *    - `task-logs/`     — photos des journaux de tâche (`GET /api/tasks/:id/logs/:logId/image`) ;
 *    - `user-journal/`  — illustrations du carnet unifié (`GET /api/user-journal/assets/:id/file`).
 *
 * 2. **Lisibles par URL signée** (`SIGNED_UPLOAD_PREFIXES`, `lib/uploadsSignedUrls.js`) —
 *    photos et productions d'élèves affichées en nombre (listes, fils, avatars). L'API qui
 *    sérialise l'URL y ajoute `?exp=…&sig=…` après avoir appliqué le contrôle d'accès de la
 *    ressource ; sans signature valide et non expirée, la garde répond **404** (indiscernable
 *    d'un fichier absent) :
 *    - `students/`, `student/`  — avatars d'élèves (gestion des n3beurs / profil élève) ;
 *    - `gl_players/`            — avatars des joueurs Gnomes & Licornes ;
 *    - `forum-posts/`, `gl-forum-posts/` — images jointes aux messages de forum ;
 *    - `context-comments/`      — images jointes aux commentaires de contexte ;
 *    - `tasks/`                 — image de tâche (proposée aussi par des élèves) et sa vignette ;
 *    - `gl-player-journal/`     — illustrations du carnet d'un joueur G&L (noms prévisibles).
 *
 * Restent **publiques**, car ce sont des contenus pédagogiques publiés par l'équipe et
 * destinés à tous (visite, carte, fiches) — aucune production ni photo d'élève :
 * `zones/`, `markers/`, `plants/`, `media-library/`, `media-thumbs/`, `visit_media/`,
 * `tutorials/`, `gl_chapters_maps/`, `gl-mascot-packs/`, `visit_mascot_packs/`,
 * `visit_mascot_sprite_library/`. Les avatars des **personnels** (`teacher/`, `gl_admins/`)
 * restent également publics : comptes d'adultes, affichés aux élèves, et exposés par des
 * routes d'authentification hors du périmètre de ce correctif.
 *
 * Toute nouvelle famille qui contient des photos ou productions d'élèves doit être ajoutée à
 * l'une des deux listes — sinon elle est servie publiquement.
 */

const ROUTE_ONLY_UPLOAD_PREFIXES = Object.freeze(['observations', 'task-logs', 'user-journal']);

const SIGNED_UPLOAD_PREFIXES = Object.freeze([
  'students',
  'student',
  'gl_players',
  'forum-posts',
  'gl-forum-posts',
  'context-comments',
  'tasks',
  'gl-player-journal',
]);

/** Toutes les familles refusées en accès direct non signé. */
const PRIVATE_UPLOAD_PREFIXES = Object.freeze([
  ...ROUTE_ONLY_UPLOAD_PREFIXES,
  ...SIGNED_UPLOAD_PREFIXES,
]);

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

/** Famille lisible par URL signée (`students/`, `forum-posts/`…) ? */
function isSignedUploadFamilyPath(urlPath) {
  const segments = normalizeUploadPathSegments(urlPath);
  if (!segments || !segments.length) return false;
  return SIGNED_UPLOAD_PREFIXES.includes(segments[0]);
}

function notFound(res) {
  return res.status(404).json({ error: 'Fichier introuvable' });
}

/**
 * Middleware à monter sur `/uploads` AVANT `express.static` :
 *  - chemin avec remontée (`..`) → 404 ;
 *  - famille signée : URL signée valide → laisse passer (et marque `res.locals.signedUpload`
 *    pour un `Cache-Control` privé) ; sinon 404 ;
 *  - famille servie par route API → 403 `PRIVATE_UPLOAD` ;
 *  - tout le reste (familles de contenu) → laisse passer.
 */
function createPrivateUploadsGuard() {
  // `require` paresseux : `uploadsSignedUrls` dépend de ce module (liste des familles).
  const { verifySignedUploadRequest } = require('./uploadsSignedUrls');
  return function privateUploadsGuard(req, res, next) {
    const segments = normalizeUploadPathSegments(req.path);
    if (segments === null) return notFound(res);
    if (!isPrivateUploadPath(req.path)) return next();
    if (isSignedUploadFamilyPath(req.path)) {
      if (verifySignedUploadRequest(req.path, req.query)) {
        res.locals.signedUpload = true;
        return next();
      }
      return notFound(res);
    }
    return res.status(403).json({
      error: 'Média privé : passer par la route API dédiée',
      code: 'PRIVATE_UPLOAD',
    });
  };
}

module.exports = {
  ROUTE_ONLY_UPLOAD_PREFIXES,
  SIGNED_UPLOAD_PREFIXES,
  PRIVATE_UPLOAD_PREFIXES,
  normalizeUploadPathSegments,
  isPrivateUploadPath,
  isSignedUploadFamilyPath,
  createPrivateUploadsGuard,
};
