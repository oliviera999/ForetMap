/** Type JWT invité Mode Découverte (miroir serveur `GL_GUEST_USER_TYPE`). */
export const GL_GUEST_USER_TYPE = 'gl_guest';

/** Session Mode Découverte (token `gl_guest`, lecture seule). */
export function isGlGuest(auth) {
  return auth?.userType === GL_GUEST_USER_TYPE;
}
