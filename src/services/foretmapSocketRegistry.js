/**
 * Registre de la socket Socket.IO ForetMap courante (`useForetmapRealtime`), pour les écrans
 * qui ont besoin d'un abonnement ciblé (plateau de fresque) sans ouvrir une seconde connexion.
 * La socket change avec la session (jeton renouvelé) : les abonnés sont prévenus pour se
 * réabonner.
 */

let current = null;
const listeners = new Set();

export function setForetmapSocket(socket) {
  current = socket || null;
  for (const listener of [...listeners]) {
    try {
      listener(current);
    } catch {
      /* un abonné défaillant n'empêche pas les autres */
    }
  }
}

export function getForetmapSocket() {
  return current;
}

/** Prévenu à chaque changement de socket (dont `null` à la déconnexion). */
export function onForetmapSocket(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetForetmapSocketRegistryForTests() {
  current = null;
  listeners.clear();
}
