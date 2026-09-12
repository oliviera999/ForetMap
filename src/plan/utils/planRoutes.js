/**
 * Mode parcours du plan — réexporte le noyau partagé et les helpers d'URL propres au Plan.
 */
export {
  resolveRouteSteps,
  routeStepTitle,
  nextRouteIndex,
} from '../../shared/map-routes/mapRouteSteps.js';

/** Identifiant de parcours porté par l'URL (`?parcours=`), ou `''`. */
export function readRouteSlugFromLocation(search) {
  try {
    return String(new URLSearchParams(String(search || '')).get('parcours') || '').trim();
  } catch (_) {
    return '';
  }
}

/** URL de partage d'un parcours (QR code d'accueil) : remplace le seul paramètre `parcours`. */
export function buildRouteUrl(location, slug) {
  const params = new URLSearchParams(String(location?.search || ''));
  if (slug) params.set('parcours', slug);
  else params.delete('parcours');
  params.delete('lieu');
  const query = params.toString();
  return `${location?.pathname || '/'}${query ? `?${query}` : ''}`;
}
