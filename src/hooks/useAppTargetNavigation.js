import { useCallback, useEffect, useState } from 'react';
import { useConsumableRequest } from './useConsumableRequest';
import { clearPendingDeepLink, consumeDeepLinkFromLocation } from '../utils/deepLinkTarget.js';

/**
 * Ouverture précise d'un élément depuis une notification ou un lien direct — extrait tel
 * quel d'`App.jsx` (lot 6). Chaque demande (lieu sur la carte, tâche, fil du forum) est
 * servie **une seule fois** par la vue cible (`useConsumableRequest`) ; si l'élément reste
 * introuvable, un toast le dit. Le lien direct (`?tache=`, `?lieu=`, `?fil=`) est appliqué
 * une fois la session ouverte et les données chargées.
 *
 * Ordre des effets conservé : les trois `useConsumableRequest`, puis le lien direct.
 *
 * @param {object} params Voir la déstructuration ci-dessous.
 */
export function useAppTargetNavigation({
  setToast,
  setPlantCatalogPreview,
  shouldUseDesktopSplit,
  canAccessStudentMapTasks,
  chooseMap,
  navigateTab,
  hasAuthenticatedShell,
  loading,
  markAsRead,
  trackActionClick,
  studentForUi,
  effectiveIsTeacher,
  validateStudentSession,
}) {
  // Demandes de navigation précises (notification, lien direct) : chacune est servie une
  // seule fois par la vue cible ; si l'élément reste introuvable, on le dit.
  const [mapPlaceRequest, issueMapPlaceRequest, consumeMapPlaceRequest] = useConsumableRequest({
    onExpire: () => setToast('Ce lieu n’est plus disponible (supprimé ou masqué).'),
  });
  const [tasksFocusRequest, issueTasksFocusRequest, consumeTasksFocusRequest] =
    useConsumableRequest({
      onExpire: (req) =>
        setToast(
          req?.taskId
            ? 'Cette tâche n’est plus disponible (supprimée, archivée ou hors de votre accès).'
            : 'Impossible d’ouvrir la liste des tâches demandée.',
        ),
    });
  const [forumThreadRequest, issueForumThreadRequest, consumeForumThreadRequest] =
    useConsumableRequest({ timeoutMs: 0 });

  /**
   * Ouvre l'élément visé par une notification ou un lien direct :
   * `{ type: 'task'|'place'|'thread'|'settings', id, mapId, kind, postId, filter, section }`.
   * @returns {boolean} `true` si la cible est reconnue.
   */
  const openTarget = useCallback(
    (target) => {
      const type = String(target?.type || '');
      const id = target?.id != null ? String(target.id) : '';
      const mapId = target?.mapId ? String(target.mapId) : '';
      setPlantCatalogPreview(null);
      const mapTasksTab = shouldUseDesktopSplit && canAccessStudentMapTasks ? 'maptasks' : null;
      if (type === 'task') {
        if (mapId) chooseMap(mapId);
        issueTasksFocusRequest({ taskId: id || null, filter: target?.filter || null });
        navigateTab(mapTasksTab || 'tasks');
        return true;
      }
      if (type === 'place') {
        if (!id) return false;
        if (mapId) chooseMap(mapId);
        issueMapPlaceRequest({
          kind: target?.kind === 'marker' ? 'marker' : 'zone',
          id,
          mapId: mapId || null,
        });
        navigateTab(mapTasksTab || 'map');
        return true;
      }
      if (type === 'thread') {
        if (!id) return false;
        issueForumThreadRequest({ id, postId: target?.postId || null });
        navigateTab('forum');
        return true;
      }
      if (type === 'settings') {
        const section = String(target?.section || id || '').trim();
        if (section) {
          try {
            sessionStorage.setItem('foretmap:settings:focus', section);
          } catch (_) {
            /* ignore */
          }
          window.dispatchEvent(new Event('foretmap:settings:focus'));
        }
        navigateTab('settings');
        return true;
      }
      return false;
    },
    [
      canAccessStudentMapTasks,
      chooseMap,
      issueForumThreadRequest,
      issueMapPlaceRequest,
      issueTasksFocusRequest,
      navigateTab,
      setPlantCatalogPreview,
      shouldUseDesktopSplit,
    ],
  );

  // Lien direct (`?tache=`, `?lieu=`, `?fil=`) : appliqué une fois la session ouverte et
  // les données chargées — la cible survit à l'écran de connexion (sessionStorage).
  const [pendingDeepLink, setPendingDeepLink] = useState(() => consumeDeepLinkFromLocation());
  useEffect(() => {
    if (!pendingDeepLink || !hasAuthenticatedShell || loading) return;
    const target = pendingDeepLink;
    setPendingDeepLink(null);
    clearPendingDeepLink();
    openTarget(target);
  }, [pendingDeepLink, hasAuthenticatedShell, loading, openTarget]);

  const openNotificationAction = useCallback(
    (item) => {
      if (!item?.id) return;
      markAsRead(item.id);
      trackActionClick();
      const action = item.action || {};
      if (action.type === 'retryStudentValidation' && studentForUi && !effectiveIsTeacher) {
        validateStudentSession(studentForUi);
        return;
      }
      if (item.target && openTarget(item.target)) return;
      if (action.target && openTarget(action.target)) return;
      if (action.tab) {
        navigateTab(action.tab);
        return;
      }
    },
    [
      effectiveIsTeacher,
      markAsRead,
      navigateTab,
      openTarget,
      studentForUi,
      trackActionClick,
      validateStudentSession,
    ],
  );

  return {
    mapPlaceRequest,
    consumeMapPlaceRequest,
    tasksFocusRequest,
    consumeTasksFocusRequest,
    forumThreadRequest,
    consumeForumThreadRequest,
    openNotificationAction,
  };
}
