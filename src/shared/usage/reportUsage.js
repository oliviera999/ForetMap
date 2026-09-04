/**
 * Compteur d'usage anonyme — envoi côté client (lot 8 du plan de convergence,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.9).
 *
 * Aucun identifiant, aucun cookie, aucune adresse IP conservée : un **nom d'événement** et
 * une clé libre bornée, agrégés par jour côté serveur (`POST /api/usage`, `lib/usage.js`).
 * L'envoi passe par `sendBeacon` quand le navigateur le propose — il survit à la fermeture
 * d'un onglet — et n'interrompt jamais l'utilisateur en cas d'échec : un compteur ne doit
 * pas peser sur l'usage.
 *
 * @param {'foret'|'gl'|'plan'} product
 * @param {string} event nom en liste blanche du produit.
 * @param {string} [key] clé libre (identifiant de lieu, terme cherché…).
 * @param {(path: string) => string} [resolveUrl] résolution d'URL du produit.
 */
export function reportUsage(product, event, key = '', resolveUrl = (path) => path) {
  const payload = JSON.stringify({ product, event, key });
  const url = resolveUrl('/api/usage');
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch (_) {
    // Le compteur ne doit jamais gêner le produit.
  }
}
