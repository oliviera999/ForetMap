/**
 * Fenêtre de réessai **partagée** par toutes les requêtes API du client.
 *
 * Pourquoi : la politique de réessai est décidée requête par requête (8 tentatives sur
 * ~25 s). Un cycle de rafraîchissement lance ~9 requêtes en parallèle ; pendant un
 * redémarrage serveur, chacune retente donc pour son compte — jusqu'à ~72 requêtes par
 * client, sans que l'échec de l'une ne renseigne les autres. Dans une salle de classe,
 * tous les postes sortent par **la même IP publique** : le plafond de `/api/*`
 * (1200 requêtes/min/IP) est alors atteint par les réessais eux-mêmes, et un `429` n'est
 * pas réessayé — l'utilisateur récolte une erreur franche au moment précis où le serveur
 * revenait. Le remède n'est pas de réessayer moins longtemps (le lot précédent a montré
 * qu'une fenêtre courte fait échouer chaque redémarrage), mais de **ne pas laisser chaque
 * requête redécouvrir seule que le serveur est indisponible**.
 *
 * Principe : quand une requête constate une indisponibilité, elle ouvre une pause
 * partagée ; les autres l'attendent au lieu d'émettre immédiatement leur propre tentative.
 * La première réponse correcte referme la pause pour tout le monde.
 *
 * Ce module ne connaît aucun produit (il est traversé par ForetMap comme par GL) : il ne
 * porte que de la temporisation réseau — jamais de jeton, de session ni de donnée métier,
 * donc rien qui franchisse l'isolement produit.
 */

/** Une requête n'attend jamais la pause partagée plus longtemps que ceci (action utilisateur). */
export const MAX_GATE_WAIT_MS = 5000;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{ now?: () => number, sleep?: (ms: number) => Promise<void>, maxWaitMs?: number }} [options]
 * @returns {{ pauseFor: (ms: number) => void, clear: () => void, wait: () => Promise<number>, remainingMs: () => number }}
 */
export function createApiRetryGate({
  now = () => Date.now(),
  sleep = defaultSleep,
  maxWaitMs = MAX_GATE_WAIT_MS,
} = {}) {
  /** Horodatage avant lequel aucune nouvelle tentative ne part ; 0 = pas de pause. */
  let openAt = 0;

  return {
    /** Ouvre (ou prolonge) la pause partagée. Ne la raccourcit jamais. */
    pauseFor(delayMs) {
      const ms = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
      const target = now() + ms;
      if (target > openAt) openAt = target;
    },
    /** Le serveur a répondu : les requêtes en attente repartent tout de suite. */
    clear() {
      openAt = 0;
    },
    /**
     * Attend la fin de la pause partagée, bornée par `maxWaitMs`.
     * @returns {Promise<number>} millisecondes réellement attendues.
     */
    async wait() {
      const remaining = openAt - now();
      if (remaining <= 0) return 0;
      const waitMs = Math.min(remaining, maxWaitMs);
      await sleep(waitMs);
      return waitMs;
    },
    /** Millisecondes restantes de pause (diagnostic et tests). */
    remainingMs() {
      return Math.max(0, openAt - now());
    },
  };
}

/** Instance partagée par `api()` (ForetMap) et `apiGL()` — une seule fenêtre par onglet. */
export const apiRetryGate = createApiRetryGate();
