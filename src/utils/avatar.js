import { buildUploadedAvatarUrl, normalizeAvatarPath } from '../shared/profile/avatarUrl.js';
import { withAppBase } from '../shared/appBase.js';

/**
 * Silhouette neutre **embarquée** (aucune requête) : affichée quand l'avatar par défaut du
 * serveur n'est pas disponible (session ouverte avant sa mise en place, URL expirée, hors
 * ligne). Ne dépend d'aucun nom.
 */
const NEUTRAL_AVATAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="32" fill="#dfe8dc"/>' +
  '<circle cx="32" cy="25" r="11" fill="#7c9a7e"/>' +
  '<path d="M12 54c3-11 11-16 20-16s17 5 20 16a32 32 0 0 1-40 0z" fill="#7c9a7e"/>' +
  '</svg>';
const NEUTRAL_AVATAR_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NEUTRAL_AVATAR_SVG)}`;

/**
 * Seule forme acceptée pour l'avatar par défaut : la route **de l'application**
 * (`GET /api/users/:id/default-avatar?exp=…&sig=…`, URL signée fournie par l'API). Toute
 * autre valeur — URL absolue, autre chemin — est ignorée : aucun avatar ne part chez un tiers.
 */
const DEFAULT_AVATAR_PATH_RE = /^\/api\/users\/[^/?#]+\/default-avatar\?[^#]*$/;

/**
 * Avatar par défaut d'un compte : dessiné par le serveur (`default_avatar_url`), sinon la
 * silhouette neutre. La graine (pseudo, prénom-nom) n'est jamais mise dans une URL.
 * @param {object|null|undefined} student
 * @returns {string}
 */
function getDefaultAvatarUrl(student) {
  const raw = student?.default_avatar_url ?? student?.defaultAvatarUrl ?? null;
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (url && DEFAULT_AVATAR_PATH_RE.test(url)) return withAppBase(url);
  return NEUTRAL_AVATAR_URL;
}

function resolveAvatarPath(student) {
  if (!student) return null;
  const raw = student.avatar_path ?? student.avatarPath ?? null;
  return normalizeAvatarPath(raw);
}

/** Photo déposée si elle existe, sinon avatar par défaut. */
function getStudentAvatarUrl(student) {
  const uploadedRel = buildUploadedAvatarUrl(resolveAvatarPath(student));
  const uploadedUrl = uploadedRel ? withAppBase(uploadedRel) : null;
  if (uploadedUrl) return uploadedUrl;
  return getDefaultAvatarUrl(student);
}

export { NEUTRAL_AVATAR_URL, getDefaultAvatarUrl, getStudentAvatarUrl, resolveAvatarPath };
