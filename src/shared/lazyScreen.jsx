import { lazy } from 'react';

/**
 * Écran chargé à la demande **qu'on peut recharger** après un échec.
 *
 * `React.lazy` mémorise définitivement une promesse rejetée : un écran dont le code n'a pas
 * pu être téléchargé (mode avion, réseau coupé) restait cassé jusqu'au rechargement de la
 * page. Ici, l'échec est marqué (`isScreenLoadError`) et l'écran garde de quoi repartir de
 * zéro (`resetFailedScreens`), ce que fait `ScreenLoadBoundary` au retour du réseau.
 */

const SCREEN_LOAD_ERROR = Symbol.for('foretmap.screenLoadError');

/** Écrans dont le dernier chargement a échoué, à relancer au prochain essai. */
const failedScreens = new Set();

/** Vrai si l'erreur vient du téléchargement du code d'un écran `lazyScreen`. */
export function isScreenLoadError(error) {
  return !!error && typeof error === 'object' && error[SCREEN_LOAD_ERROR] === true;
}

/**
 * @param {() => Promise<{ default: import('react').ComponentType<any> }>} loader
 * @returns {import('react').ComponentType<any>}
 */
export function lazyScreen(loader) {
  const entry = { Component: null, reset: null };
  const load = () =>
    loader().catch((cause) => {
      failedScreens.add(entry);
      const error = cause instanceof Error ? cause : new Error(String(cause));
      try {
        error[SCREEN_LOAD_ERROR] = true;
      } catch {
        /* erreur gelée : elle remontera sans marque, comme avant */
      }
      throw error;
    });
  entry.reset = () => {
    entry.Component = lazy(load);
  };
  entry.reset();

  function LazyScreen(props) {
    const Current = entry.Component;
    return <Current {...props} />;
  }
  return LazyScreen;
}

/** Réarme les écrans en échec : leur prochain rendu retente le téléchargement. */
export function resetFailedScreens() {
  for (const entry of failedScreens) entry.reset();
  failedScreens.clear();
}
