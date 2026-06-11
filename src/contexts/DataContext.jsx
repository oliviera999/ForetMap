import React, { createContext, useContext } from 'react';

/**
 * Contexte de données — 3ᵉ étage d'O5 : casse le prop-drilling des grands tableaux de données
 * dérivés de l'état d'`App.jsx` et passés à l'identique (même variable) dans tous les chemins.
 *
 * Porte uniquement les valeurs à RHS unique vérifié : `zones`, `markers`, `plants`, `tasks`,
 * `tutorials`, `taskProjects`, `activeMapId`. **Exclus volontairement** :
 *  - `maps` — deux variantes selon le consommateur (`visibleMaps` filtré par affiliation vs `maps`
 *    complet pour les éditeurs de profil) → reste en props.
 *
 * `VisitView` lit `zones`/`tutorials` depuis ce contexte (internes : `mapZones`/`catalogTutorials`)
 * via O5-lot5 ; `initialMapId` et `mapMarkers` restent en props car distincts selon le contexte.
 *
 * `useData()` renvoie un objet vide gelé hors `Provider` (le retour invité d'`App` reste hors
 * Provider) : les consommateurs déstructurent avec `= []` / `= 'foret'`, identiques aux défauts de
 * props, ce qui préserve le rendu invité.
 */
const DataContext = createContext(null);
const EMPTY_DATA = Object.freeze({});

export function DataProvider({ value, children }) {
  return (
    <DataContext.Provider value={value ?? null}>
      {children}
    </DataContext.Provider>
  );
}

/**
 * Lit les données partagées. Hors `Provider`, renvoie `{}` (gelé) afin que
 * `const { zones = [] } = useData()` retombe sur les défauts attendus.
 * @returns {{zones?: Array, markers?: Array, plants?: Array, tasks?: Array, tutorials?: Array, taskProjects?: Array, activeMapId?: string}}
 */
export function useData() {
  return useContext(DataContext) ?? EMPTY_DATA;
}

export { DataContext };
