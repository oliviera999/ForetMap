import { NoticeBanner } from './NoticeBanner.jsx';
import { AppStatusSticky } from '../../shared/components/AppStatusSticky.jsx';
import { IOS_INSTALL_HINT_DISMISSED_KEY } from '../../constants/app-runtime';
import { safeLocalStorageSetItem } from '../../shared/platform/browserStorage.js';
import { offlineBannerText } from '../../utils/lastDataSync.js';
import {
  isNotificationActionable,
  notificationActionLabel,
} from '../../utils/notificationTargets.js';

/**
 * Bandeaux d'état du shell authentifié — déplacés tels quels d'`App.jsx` (lot 6), dans le
 * même ordre : invitation à installer sur iOS, hors ligne, serveur indisponible, nouvelle
 * version disponible, notification critique, session élève pas encore recollée, puis la
 * zone collante d'état (`AppStatusSticky`).
 *
 * @param {object} props
 * @param {object} props.pwa Valeur de `usePwaInstall`.
 * @param {object} props.offline Valeur de `useOfflineShell`.
 * @param {object} props.dataSync Valeur de `useAppDataSync` (serveur indisponible, synchro).
 * @param {object} props.texts Textes du shell (`resolveAppShellTexts`).
 * @param {boolean} props.hasAuthenticatedShell Session établie.
 * @param {object|null} props.latestCriticalNotification Dernière notification critique.
 * @param {(item: object) => void} props.openNotificationAction Action d'une notification.
 * @param {boolean} props.sessionValidationError Session élève pas encore validée.
 * @param {(value: boolean) => void} props.setSessionValidationError
 * @param {object|null} props.studentForUi Élève courant (ou aperçu « vue élève »).
 * @param {boolean} props.effectiveIsTeacher Chrome prof.
 * @param {(student: object) => void} props.validateStudentSession Revalidation de session.
 */
export function AppNoticeBanners({
  pwa,
  offline,
  dataSync,
  texts,
  hasAuthenticatedShell,
  latestCriticalNotification,
  openNotificationAction,
  sessionValidationError,
  setSessionValidationError,
  studentForUi,
  effectiveIsTeacher,
  validateStudentSession,
}) {
  const { showIosInstallHint, deferredInstallPrompt, isStandaloneMode, setShowIosInstallHint } =
    pwa;
  const { deviceOnline, networkMode, offlineOutbox, setOfflineCenterOpen, swUpdate } = offline;
  const { lastSyncAt, serverDown, retryServerNow, retryingServer } = dataSync;
  return (
    <>
      {showIosInstallHint && !deferredInstallPrompt && !isStandaloneMode && (
        <div className="fade-in install-ios-banner" role="status" aria-live="polite">
          <span>
            Pour installer ForetMap sur iPhone ou iPad : ouvre Safari, touche Partager, puis « Sur
            l’écran d’accueil ».
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              safeLocalStorageSetItem(IOS_INSTALL_HINT_DISMISSED_KEY, '1');
              setShowIosInstallHint(false);
            }}
          >
            Masquer
          </button>
        </div>
      )}
      {!deviceOnline && (
        <NoticeBanner tone="info">
          {offlineBannerText(
            lastSyncAt,
            Date.now(),
            networkMode === 'unreachable' ? 'unreachable' : 'offline',
          )}
          {hasAuthenticatedShell ? (
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginLeft: 10, verticalAlign: 'middle', minHeight: 44 }}
              onClick={() => setOfflineCenterOpen(true)}
            >
              {offlineOutbox.entries.length > 0
                ? `En attente (${offlineOutbox.entries.length})`
                : 'Détails'}
            </button>
          ) : null}
        </NoticeBanner>
      )}
      {deviceOnline && serverDown && (
        <NoticeBanner tone="warning">
          {texts.serverDownNotice}
          {/* Bouton rendu ici (plutôt que via `action`) pour pouvoir le désactiver
          pendant la tentative et garantir une cible tactile ≥ 44px. */}
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginLeft: 10, verticalAlign: 'middle', minHeight: 44 }}
            onClick={retryServerNow}
            disabled={retryingServer}
          >
            {texts.retryNow}
          </button>
        </NoticeBanner>
      )}
      {!serverDown && swUpdate && (
        <NoticeBanner tone="info">
          <strong>Une nouvelle version est disponible.</strong> Rechargez quand cela vous arrange —
          votre travail en cours n’est pas interrompu.
          {/* Bouton rendu ici (plutôt que via `action`) pour garantir une cible
          tactile ≥ 44px, comme le bandeau « serveur indisponible ». */}
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginLeft: 10, verticalAlign: 'middle', minHeight: 44 }}
            onClick={swUpdate.apply}
          >
            Recharger
          </button>
        </NoticeBanner>
      )}
      {!serverDown && latestCriticalNotification && (
        <div className="fade-in notif-critical-banner" role="alert">
          <strong>{latestCriticalNotification.title}</strong> {latestCriticalNotification.message}
          {isNotificationActionable(latestCriticalNotification) && (
            <button
              type="button"
              className="btn btn-sm notif-critical-banner__action"
              onClick={() => openNotificationAction(latestCriticalNotification)}
            >
              {notificationActionLabel(latestCriticalNotification) || 'Ouvrir'}
            </button>
          )}
        </div>
      )}
      {sessionValidationError && studentForUi && !effectiveIsTeacher && (
        <NoticeBanner
          tone="info"
          action={{
            label: 'Réessayer',
            onClick: () => {
              setSessionValidationError(false);
              validateStudentSession(studentForUi);
            },
          }}
        >
          <strong>Session pas encore recollée au serveur.</strong> Les infos peuvent être un peu
          vieilles — un clic pour rafraîchir.
        </NoticeBanner>
      )}
      <AppStatusSticky />
    </>
  );
}
