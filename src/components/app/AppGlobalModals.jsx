import { OfflineCenterDialog } from '../offline/OfflineCenterDialog.jsx';
import { TimedToast as Toast } from '../../shared/components/TimedToast.jsx';
import { oauthFeedbackDurationMs } from '../../utils/appShellHelpers';
import { AutoProfilePromotionModal } from '../AutoProfilePromotionModal.jsx';
import { PinModal } from '../auth-views';
import { RewardsCelebrationHost } from '../rewards/RewardsCelebrationHost.jsx';
import { AppUserDialog } from './AppUserDialog.jsx';
import { StudentProfileEditorLazy, StudentStatsLazy } from './appLazyViews.js';

/**
 * Modales et surcouches globales du shell authentifié — déplacées telles quelles
 * d'`App.jsx` (lot 6), dans le même ordre : centre hors ligne, toast, promotion de profil
 * automatique, modale PIN, statistiques et profil de l'utilisateur, célébration des badges.
 *
 * @param {object} props
 * @param {object} props.offline Valeur de `useOfflineShell`.
 * @param {object} props.dialogs Valeur de `useShellDialogs` (PIN, statistiques, profil).
 * @param {object} props.access Droits dérivés (`useAppAccess`) : cible des dialogues.
 * @param {() => void} props.onPinSuccess Connexion PIN réussie.
 * Les autres props sont les valeurs et gestionnaires du shell de même nom.
 */
export function AppGlobalModals({
  offline,
  dialogs,
  access,
  hasAuthenticatedShell,
  lastSyncAt,
  setToast,
  toast,
  onToastDone,
  profilePromotion,
  setProfilePromotion,
  roleTerms,
  onPinSuccess,
  publicSettings,
  isN3Affiliated,
  statsDialogTarget,
  onProfileUpdated,
  rewardsCelebrationEnabled,
}) {
  const {
    offlineCenterOpen,
    setOfflineCenterOpen,
    offlineOutbox,
    networkMode,
    prepareFieldTripNow,
  } = offline;
  const {
    showPin,
    setShowPin,
    showStats,
    showProfile,
    handleCloseStatsDialog: onCloseStats,
    handleCloseProfileDialog: onCloseProfile,
  } = dialogs;
  const { effectiveIsTeacher, studentForUi, canOpenUserDialogs, profileTargetUser } = access;
  return (
    <>
      {offlineCenterOpen && hasAuthenticatedShell ? (
        <OfflineCenterDialog
          onClose={() => setOfflineCenterOpen(false)}
          entries={offlineOutbox.entries}
          networkMode={networkMode}
          lastSyncAt={lastSyncAt}
          onFlushNow={offlineOutbox.flushNow}
          onPrepareFieldTrip={prepareFieldTripNow}
          onToast={setToast}
        />
      ) : null}
      {toast && (
        <Toast msg={toast} onDone={onToastDone} durationMs={oauthFeedbackDurationMs(toast)} />
      )}
      {profilePromotion && !effectiveIsTeacher && studentForUi && !studentForUi.preview_mode && (
        <AutoProfilePromotionModal
          data={profilePromotion}
          roleTerms={roleTerms}
          onClose={() => setProfilePromotion(null)}
        />
      )}
      {showPin && (
        <PinModal
          onSuccess={onPinSuccess}
          onClose={() => setShowPin(false)}
          uiSettings={publicSettings}
          isN3Affiliated={isN3Affiliated}
        />
      )}
      {showStats && canOpenUserDialogs && (
        <AppUserDialog
          open={showStats}
          onClose={onCloseStats}
          ariaLabel="Statistiques utilisateur"
          closeLabel="Fermer la fenêtre des statistiques"
        >
          <StudentStatsLazy student={statsDialogTarget} />
        </AppUserDialog>
      )}
      {showProfile && canOpenUserDialogs && profileTargetUser && (
        <AppUserDialog
          open={showProfile}
          onClose={onCloseProfile}
          ariaLabel="Profil utilisateur"
          closeLabel="Fermer la fenêtre du profil"
        >
          <StudentProfileEditorLazy
            student={profileTargetUser}
            onUpdated={onProfileUpdated}
            onClose={onCloseProfile}
          />
        </AppUserDialog>
      )}

      {/* Badges pas encore vus : fêtés à l'arrivée, avec OLU (module « Récompenses »). */}
      <RewardsCelebrationHost enabled={rewardsCelebrationEnabled} />
    </>
  );
}
