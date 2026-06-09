import React, { createContext, useContext } from 'react';

/**
 * Contexte de session — 2ᵉ étage d'O5 (après `PublicSettingsContext`) pour casser le prop-drilling
 * des valeurs de session **globales** dérivées dans `App.jsx` : affiliation, droits et participation.
 *
 * Ne contient que des valeurs **réellement globales** — passées à l'identique dans les deux chemins
 * de rendu (prof/élève) : `isN3Affiliated` et `canParticipateContextComments`.
 *
 * Restent volontairement en props (NE PAS migrer ici) : `isTeacher`, `student`, les identités, et
 * surtout `hasPermission`/`hasPermissionInRole` — le chemin élève les omet pour forcer `() => false`,
 * alors qu'un prof en « vue élève » conserve ses droits réels ; les exposer globalement réafficherait
 * des contrôles prof en vue élève.
 *
 * `useSession()` renvoie un objet vide gelé hors `Provider` : les consommateurs déstructurent
 * avec des valeurs par défaut identiques aux anciens défauts de props — ce qui préserve aussi
 * le rendu invité (visite publique), volontairement laissé **hors** `SessionProvider`.
 */
const SessionContext = createContext(null);
const EMPTY_SESSION = Object.freeze({});

export function SessionProvider({ value, children }) {
  return (
    <SessionContext.Provider value={value ?? null}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Lit la session courante. Hors `Provider`, renvoie un objet vide (gelé) afin que
 * `const { isN3Affiliated = false } = useSession()` retombe sur les défauts attendus.
 * @returns {{isN3Affiliated?: boolean, hasPermission?: Function, hasPermissionInRole?: Function, canParticipateContextComments?: boolean}}
 */
export function useSession() {
  return useContext(SessionContext) ?? EMPTY_SESSION;
}

export { SessionContext };
