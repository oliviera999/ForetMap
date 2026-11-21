import { useEffect, useSyncExternalStore } from 'react';

/**
 * « Mode séance » de la console du prof (écrans de séance, K7) : tant que l'écran « Jouer le
 * tour » est ouvert, la barre du haut de l'application se réduit à une ligne (nom de la partie,
 * tour, bouton « Menu »). L'écran du tour vit dans un morceau chargé à la demande, loin de la
 * barre : il se **déclare** ici, et la barre **lit** — ni contexte à faire descendre, ni prop à
 * faire remonter.
 *
 * Rien n'est gardé d'une page à l'autre : l'état vit le temps de l'écran du tour.
 */
let etat = null;
let dernierId = 0;
const ecouteurs = new Set();

function publier(suivant) {
  etat = suivant;
  ecouteurs.forEach((prevenir) => prevenir());
}

function abonner(prevenir) {
  ecouteurs.add(prevenir);
  return () => ecouteurs.delete(prevenir);
}

function lire() {
  return etat;
}

/**
 * Déclare le mode séance ; rend la fonction qui le referme. Une fermeture tardive (écran déjà
 * remplacé par un autre) ne referme pas la déclaration suivante.
 * @param {{ partie?: string, tour?: string }} info
 * @returns {() => void}
 */
export function declarerModeSeance(info) {
  dernierId += 1;
  const id = dernierId;
  publier({ id, partie: String(info?.partie || ''), tour: String(info?.tour || '') });
  return () => {
    if (etat?.id === id) publier(null);
  };
}

/** À poser dans l'écran du tour : le mode séance dure tant que le composant est monté. */
export function useDeclarerModeSeance({ actif = true, partie = '', tour = '' } = {}) {
  useEffect(() => {
    if (!actif) return undefined;
    return declarerModeSeance({ partie, tour });
  }, [actif, partie, tour]);
}

/** `{ partie, tour }` tant qu'un écran du tour est ouvert, `null` sinon. */
export function useGlModeSeance() {
  return useSyncExternalStore(abonner, lire, lire);
}
