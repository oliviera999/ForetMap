/** Type JWT invité Mode Découverte (miroir serveur `GL_GUEST_USER_TYPE`). */
export const GL_GUEST_USER_TYPE = 'gl_guest';

/** Session Mode Découverte (token `gl_guest`, lecture seule). */
export function isGlGuest(auth) {
  return auth?.userType === GL_GUEST_USER_TYPE;
}

/** Session de PROJECTION (« Tenir à deux » § 8.6) : invité porteur d'un claim `projection`. */
export function isGlProjection(auth) {
  return isGlGuest(auth) && !!auth?.projection && Number(auth.projection.gameId) > 0;
}

/** Lit `?projection=<jeton>` dans l'URL courante (vidéoprojecteur) ; `null` sinon. */
export function readProjectionTokenFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
) {
  try {
    const params = new URLSearchParams(search || '');
    const token = String(params.get('projection') || '').trim();
    return token || null;
  } catch (_) {
    return null;
  }
}

/** Charge utile (non vérifiée) d'un JWT : suffit à construire la session cliente d'une projection. */
export function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

/** Session cliente d'une projection construite depuis le jeton (`{ token, auth }`), ou `null`. */
export function buildProjectionSession(token) {
  const claims = decodeJwtPayload(token);
  if (!claims || !claims.projection || claims.userType !== GL_GUEST_USER_TYPE) return null;
  return {
    token,
    auth: {
      product: 'gl',
      userType: GL_GUEST_USER_TYPE,
      userId: String(claims.userId || ''),
      roleSlug: 'gl_observateur',
      displayName: 'Projection',
      permissions: ['gl.read'],
      projection: { gameId: Number(claims.projection.gameId) || null },
    },
  };
}
