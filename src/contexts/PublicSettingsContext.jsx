import React, { createContext, useContext } from 'react';

/**
 * Contexte des réglages publics (`publicSettings`) — fondation O5 pour casser le prop-drilling.
 *
 * `publicSettings` est aujourd'hui passé en prop ~20 fois depuis `App.jsx` et traverse ~8 fichiers
 * de vues. Ce contexte permet aux composants profonds de lire ces réglages quasi-constants via
 * `usePublicSettings()` au lieu de les recevoir par props. Migration des consommateurs INCRÉMENTALE :
 * le `Provider` est câblé dans `App.jsx` sans changer le comportement (les props existantes restent
 * valides tant qu'un composant ne bascule pas sur le hook).
 */
const PublicSettingsContext = createContext(null);

export function PublicSettingsProvider({ value, children }) {
  return (
    <PublicSettingsContext.Provider value={value ?? null}>
      {children}
    </PublicSettingsContext.Provider>
  );
}

/**
 * Lit les réglages publics depuis le contexte.
 * @param {object} [fallback] valeur de repli si aucun Provider n'englobe le composant.
 * @returns {object|null}
 */
export function usePublicSettings(fallback = null) {
  const value = useContext(PublicSettingsContext);
  return value == null ? fallback : value;
}

export { PublicSettingsContext };
