import { createContext, useContext } from 'react';

/**
 * Séance pédagogique en cours, partagée avec l'arbre de l'application (étape B2 de la
 * piste B, audit du 25/09/2026) : la valeur est celle de `usePedagoSession`, appelé par le
 * shell `App` (qui porte les cibles de navigation des étapes).
 *
 * Les vues qui reçoivent encore la séance par props (`PedagoTabs` → `SessionsView`,
 * `MapTasksArea` → tâches liées) peuvent la lire ici à la place, sans nouvelle prop à
 * faire descendre du shell.
 */
const PedagoSessionContext = createContext(null);

/**
 * @param {{ value: ReturnType<typeof import('../hooks/usePedagoSession.js').usePedagoSession>,
 *   children: import('react').ReactNode }} props
 */
export function PedagoSessionProvider({ value, children }) {
  return <PedagoSessionContext.Provider value={value}>{children}</PedagoSessionContext.Provider>;
}

/**
 * Séance en cours (`activeSession`, `currentStep`, `completedSession`, `runsVersion`,
 * `imposedLevel`, `imposedNotionNiveau`) et actions (`startSession`, `launchSession`,
 * `exitSession`, `goStep`, `setCompletedSession`) ; tutoriel d'une étape `open_tutorial`
 * (`sessionTutorial`, `closeSessionTutorial`, `markSessionTutorialRead`), lu par le bandeau
 * de séance ; demande de réseau d'une étape `open_foodweb` (`foodWebRequest` : espèce mise en
 * avant, `plantIds` et `preset` éventuels, lue par `FoodWebView`, chantier collège flux C3 et
 * chantier du 22/11/2026) ; `null` hors
 * du fournisseur.
 */
export function usePedagoSessionContext() {
  return useContext(PedagoSessionContext);
}
