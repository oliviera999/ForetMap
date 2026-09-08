/**
 * Helpers purs de la page d'arrivée LTI (`/lti/arrivee#ticket=`).
 * Aucun effet de bord : le composant pose la session via `#oauth=` existant.
 */

export function parseTicketFromHash(hashRaw) {
  const raw = String(hashRaw || '').replace(/^#/, '');
  if (!raw) return '';
  return new URLSearchParams(raw).get('ticket') || '';
}

function decodeJwtPayloadJson(ticket) {
  const parts = String(ticket || '').split('.');
  if (parts.length < 2) return null;
  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary =
    typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Décode le payload JWT sans vérifier la signature (affichage des destinations seulement). */
export function destinationsFromTicket(ticket) {
  try {
    const json = decodeJwtPayloadJson(ticket);
    const list = json?.destination?.destinations;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function tabForLanding(landing) {
  if (landing === 'fm_tasks') return 'tasks';
  if (landing === 'fm_map') return 'map';
  return null;
}

export function redirectTo(url) {
  window.location.replace(url);
}
