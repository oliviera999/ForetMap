/**
 * Étalement des refetchs déclenchés par le temps réel.
 *
 * Un événement `tasks:changed` / `garden:changed` part à tous les clients abonnés à la
 * carte — en séance, toute une classe. Avec un debounce fixe, les postes rechargeaient
 * dans la même fenêtre de quelques dizaines de millisecondes : une seule validation de
 * tâche produisait une rafale de plusieurs dizaines de requêtes simultanées, et une série
 * de validations autant de rafales. Un délai aléatoire ajouté au debounce étale ces
 * requêtes sans que personne ne perçoive la différence (moins d'une seconde).
 */

/** Amplitude de l'étalement aléatoire, en millisecondes. */
export const RT_REFRESH_JITTER_MS = 600;

/**
 * @param {number} baseMs Debounce nominal du domaine.
 * @param {() => number} [random] Injectable pour les tests.
 * @returns {number} Délai effectif : `baseMs` + étalement dans [0, RT_REFRESH_JITTER_MS[.
 */
export function jitteredRefreshDelay(baseMs, random = Math.random) {
  const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 0;
  const spread = Math.floor(random() * RT_REFRESH_JITTER_MS);
  return base + spread;
}
