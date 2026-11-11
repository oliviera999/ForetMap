import { useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useAppDataSync } from './useAppDataSync';
import { readLastViewedMapId, rememberLastViewedMapId } from '../utils/lastViewedMap.js';
import { visibleMapsForScope } from '../utils/appMapScope';

/**
 * Données partagées du shell `App` et choix du plan — extrait tel quel d'`App.jsx` (lot 6) :
 * contexte mémoïsé lu par `fetchAll`, cycle de données (`useAppDataSync`), plans visibles,
 * changement de plan demandé par l'utilisateur, plan initial de la visite invitée.
 *
 * Seul `useAppDataSync` porte des effets : il reste le premier hook à effets après la
 * session, comme avant le découpage. Le reste est mémoïsé et sans effet.
 *
 * @param {object} params
 * @param {object} params.access Droits dérivés (`useAppAccess`).
 * @param {boolean} params.showPublicVisit Visite invitée active.
 * @param {object|null} params.publicSettings Réglages publics (plans par défaut).
 * @param {boolean} params.publicSettingsReady Réglages publics chargés.
 * @param {boolean} params.hasAuthenticatedShell Session établie.
 * @param {{ current: object|null }} params.studentRef Session élève courante (ref).
 * @param {(options?: object) => void} params.forceLogout Déconnexion forcée (401).
 * @param {(d: object, opts?: object) => void} params.mergeAuthMeResponse Réponse `/me`.
 * @returns {object} Valeur de `useAppDataSync`, plus `visibleMaps`, `chooseMap`, `updateZone`,
 *   `visitInitialMapId`.
 */
export function useShellMapData({
  access,
  showPublicVisit,
  publicSettings,
  publicSettingsReady,
  hasAuthenticatedShell,
  studentRef,
  forceLogout,
  mergeAuthMeResponse,
}) {
  const { effectiveIsTeacher, canManageTutorials } = access;

  // Contexte lu par `fetchAll` (mémoïsé : il pilote aussi le debounce du rechargement auto).
  const dataSyncContext = useMemo(
    () => ({
      effectiveIsTeacher,
      showPublicVisit,
      canManageTutorials,
      defaultMapStudent: publicSettings?.map?.default_map_student,
      defaultMapTeacher: publicSettings?.map?.default_map_teacher,
      defaultMapVisit: publicSettings?.map?.default_map_visit,
    }),
    [
      effectiveIsTeacher,
      showPublicVisit,
      canManageTutorials,
      publicSettings?.map?.default_map_student,
      publicSettings?.map?.default_map_teacher,
      publicSettings?.map?.default_map_visit,
    ],
  );

  // D4 — données partagées et cycle de rechargement (fetchAll, polling différentiel,
  // refetch ciblé, bandeau « serveur indisponible »).
  const dataSync = useAppDataSync({
    context: dataSyncContext,
    contextReady: publicSettingsReady,
    hasAuthenticatedShell,
    studentRef,
    forceLogout,
    mergeAuthMeResponse,
  });
  const { maps, activeMapId, setActiveMapId, fetchAll } = dataSync;

  /**
   * Changement de plan **demandé par l'utilisateur** (sélecteur de la carte) : seul cas
   * où le plan est mémorisé sur l'appareil, pour être rouvert à la reconnexion. Les
   * plans posés par la résolution automatique passent directement par `setActiveMapId`
   * et ne laissent aucune trace (cf. `src/utils/lastViewedMap.js`).
   */
  const chooseMap = useCallback(
    (nextMapId) => {
      const next = String(nextMapId || '').trim();
      if (!next) return;
      rememberLastViewedMapId(next);
      setActiveMapId((prev) => (prev === next ? prev : next));
    },
    [setActiveMapId],
  );

  /**
   * Plan ouvert par la Visite invitée : le dernier plan consulté sur cet appareil
   * d'abord (visite ou carte), puis le réglage « plan par défaut (visite publique) ».
   *
   * La mémoire est relue à chaque entrée dans la visite (`showPublicVisit`) : sinon un
   * visiteur qui repasse par l'écran de connexion se verrait rouvrir le plan d'avant son
   * propre choix. Hors visite, la valeur n'est pas consommée.
   */
  const visitInitialMapId = useMemo(
    () =>
      (showPublicVisit ? readLastViewedMapId() : '') ||
      publicSettings?.map?.default_map_visit ||
      activeMapId,
    [publicSettings?.map?.default_map_visit, activeMapId, showPublicVisit],
  );

  // `GET /api/maps` est déjà borné par le serveur au périmètre du compte (groupes) : il ne
  // reste qu'à préférer les cartes actives.
  const visibleMaps = useMemo(() => visibleMapsForScope(maps), [maps]);

  // Zone modifiée depuis la carte : enregistrement puis rechargement des données.
  const updateZone = useCallback(
    async (id, data) => {
      await api(`/api/zones/${id}`, 'PUT', data);
      await fetchAll();
    },
    [fetchAll],
  );

  return { ...dataSync, chooseMap, visitInitialMapId, visibleMaps, updateZone };
}
