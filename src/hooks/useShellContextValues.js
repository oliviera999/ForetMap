import { useMemo } from 'react';

/**
 * Valeurs mémoïsées des contextes `SessionContext` et `DataContext` du shell `App` —
 * extraites telles quelles d'`App.jsx` (lot 6). Aucun effet.
 *
 * @param {object} params
 * @param {boolean} params.isN3Affiliated Terminologie n3 (toujours `false` désormais).
 * @param {boolean} params.canParticipateContextComments Participation aux commentaires.
 * @param {object} params.dataSync Valeur de `useAppDataSync`.
 * @returns {{ sessionContextValue: object, dataContextValue: object }}
 */
export function useShellContextValues({ isN3Affiliated, canParticipateContextComments, dataSync }) {
  // O5 — valeurs de session globales exposées par contexte (cf. SessionContext).
  // NB : hasPermission/hasPermissionInRole restent en props (volontairement) — le chemin élève
  // les omet pour forcer `() => false` ; un prof en « vue élève » garde ses droits réels, donc les
  // exposer globalement ferait réapparaître des contrôles prof côté vue élève. Idem identités.
  const sessionContextValue = useMemo(
    () => ({
      isN3Affiliated,
      canParticipateContextComments,
    }),
    [isN3Affiliated, canParticipateContextComments],
  );

  // O5 — données partagées exposées par contexte (cf. DataContext). `maps` exclu (variante
  // visibleMaps/maps) et VisitView exclu (noms de props distincts) : ces deux-là restent en props.
  const {
    zones,
    markers,
    plants,
    tasks,
    tutorials,
    taskProjects,
    archivedTasks,
    archivedTaskProjects,
    activeMapId,
    loadArchivedTasks,
  } = dataSync;
  const dataContextValue = useMemo(
    () => ({
      zones,
      markers,
      plants,
      tasks,
      tutorials,
      taskProjects,
      archivedTasks,
      archivedTaskProjects,
      activeMapId,
      loadArchivedTasks,
    }),
    [
      zones,
      markers,
      plants,
      tasks,
      tutorials,
      taskProjects,
      archivedTasks,
      archivedTaskProjects,
      activeMapId,
      loadArchivedTasks,
    ],
  );

  return { sessionContextValue, dataContextValue };
}
