import { GL_GUEST_USER_TYPE, isGlGuest } from './glGuestMode.js';

/**
 * Session d'équipe (« Tenir à deux », lot 2) : une tablette de classe ouvre le lien de la
 * classe (`gl.html?classe=<jeton>` ou le code à huit caractères), touche la mascotte de son
 * équipe et joue avec les droits d'un membre. Elle ne garde rien après la fermeture de l'onglet
 * (`sessionStorage`, cf. `services/apiGL.js`).
 */

/** Session invitée porteuse d'un claim d'équipe. */
export function isGlTeamSession(auth) {
  return isGlGuest(auth) && !!auth?.teamSession && Number(auth.teamSession.teamId) > 0;
}

/** Lit `?classe=<jeton>` dans l'URL courante (QR de la classe) ; `null` sinon. */
export function readClassLinkTokenFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
) {
  try {
    const params = new URLSearchParams(search || '');
    const token = String(params.get('classe') || '').trim();
    return token || null;
  } catch (_) {
    return null;
  }
}

/** Retire `?classe=` de l'adresse (le jeton ne reste pas dans l'historique de la tablette). */
export function removeClassLinkTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('classe');
    window.history.replaceState(null, '', url.toString());
  } catch (_) {
    /* URL non modifiable : sans importance */
  }
}

/** Code de classe saisi → majuscules, sans espace ni tiret (le serveur revalide). */
export function normalizeClassCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .slice(0, 8);
}

/**
 * Session cliente d'une tablette d'équipe, depuis la réponse de
 * `POST /api/gl/class-link/session` (`{ token, gameId, teamId, teamName, className }`).
 */
export function buildTeamSession(data) {
  if (!data?.token || !(Number(data.teamId) > 0) || !(Number(data.gameId) > 0)) return null;
  return {
    token: data.token,
    auth: {
      product: 'gl',
      userType: GL_GUEST_USER_TYPE,
      userId: `equipe-${data.teamId}`,
      roleSlug: 'gl_observateur',
      displayName: data.teamName || 'Tablette d’équipe',
      permissions: ['gl.read', 'gl.action.request'],
      teamSession: { gameId: Number(data.gameId), teamId: Number(data.teamId) },
      teamId: Number(data.teamId),
      gameId: Number(data.gameId),
      teamName: data.teamName || '',
      className: data.className || '',
    },
  };
}

/** Adresse complète du lien de classe (page imprimable, QR), depuis l'adresse relative servie. */
export function absoluteClassLinkUrl(
  relative,
  href = typeof window !== 'undefined' ? window.location.href : '',
) {
  try {
    return new URL(String(relative || ''), href).toString();
  } catch (_) {
    return String(relative || '');
  }
}
