/**
 * Code d'accès porté par un lien de plan (`?code=…`, QR code interne).
 *
 * Le code sert **une fois** : il est échangé contre un laissez-passer par `POST /access` (le
 * code voyage dans le corps de la requête), puis il quitte l'adresse par
 * `history.replaceState`. Resté dans l'adresse, il finirait dans l'historique, dans un lien
 * recopié ou partagé, et — porté par les lectures `/content?code=` — dans le cache du service
 * worker et les journaux de requêtes.
 */

/** Paramètre d'adresse porteur du code. */
export const LINK_CODE_PARAM = 'code';

/**
 * Code porté par une chaîne de requête (`location.search`), ou `''`.
 * @param {string} search
 */
export function readLinkCodeFromSearch(search) {
  try {
    return String(new URLSearchParams(search || '').get(LINK_CODE_PARAM) || '').trim();
  } catch {
    return '';
  }
}

/**
 * Adresse relative (chemin, requête, ancre) privée du seul paramètre `code` : le reste du lien
 * (`?lieu=`, `?parcours=`, `?map_id=`) est conservé.
 * @param {{ pathname: string, search: string, hash?: string }} location
 */
export function urlWithoutLinkCode(location) {
  const params = new URLSearchParams(location?.search || '');
  params.delete(LINK_CODE_PARAM);
  const query = params.toString();
  return `${location?.pathname || '/'}${query ? `?${query}` : ''}${location?.hash || ''}`;
}

/** Retire `?code=` de l'adresse courante, sans nouvelle entrée d'historique. */
export function stripLinkCodeFromAddress() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  if (!readLinkCodeFromSearch(window.location.search)) return;
  window.history.replaceState(window.history.state, '', urlWithoutLinkCode(window.location));
}
