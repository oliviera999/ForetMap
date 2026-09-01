/**
 * Distingue, parmi les échecs de connexion Socket.IO, ceux qu'un réessai ne peut pas résoudre.
 *
 * Le client est configuré en `reconnectionAttempts: Infinity` (délai 1 à 5 s) : c'est le bon
 * réglage face à une coupure réseau ou à un redémarrage serveur. Mais le serveur refuse aussi
 * la connexion quand le **jeton est absent, invalide ou expiré** (`next(new Error('unauthorized'))`
 * dans `lib/realtime.js`) — et là, retenter avec le même jeton donnera éternellement le même
 * refus. Le transport étant en long-polling, chaque tentative est une requête HTTP : une session
 * expirée laissée ouverte martelait `/socket.io` toutes les 1 à 5 s jusqu'au rechargement.
 *
 * `unavailable` (hydratation en échec, base momentanément injoignable) n'est **pas** un refus
 * d'authentification : la reconnexion doit continuer, le serveur va revenir.
 */

/** Raisons de refus renvoyées par le middleware d'authentification Socket.IO. */
const AUTH_REJECTION_MESSAGES = new Set(['unauthorized', 'forbidden']);

/**
 * @param {unknown} err erreur reçue sur `connect_error`
 * @returns {boolean} vrai si le refus vient de l'authentification (réessayer est inutile)
 */
export function isSocketAuthRejection(err) {
  const message = String(err?.message || err || '')
    .trim()
    .toLowerCase();
  return AUTH_REJECTION_MESSAGES.has(message);
}
