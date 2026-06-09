import React, { createContext, useContext } from 'react';

/**
 * Contexte de session — 2ᵉ étage d'O5 (après `PublicSettingsContext`) pour casser le prop-drilling
 * des valeurs de session **globales** dérivées dans `App.jsx` : affiliation, droits et participation.
 *
 * Ne contient que des valeurs uniques (mêmes quel que soit le chemin de rendu prof/élève) :
 * `isN3Affiliated`, `hasPermission`, `hasPermissionInRole`, `canParticipateContextComments`.
 * Les valeurs dépendantes du chemin (`isTeacher`, `student`, identités) restent en props.
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
