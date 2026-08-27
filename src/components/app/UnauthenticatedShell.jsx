import React, { lazy } from 'react';
import { PublicSettingsProvider } from '../../contexts/PublicSettingsContext.jsx';
import { AppStatusSticky } from '../../shared/components/AppStatusSticky.jsx';
import { TimedToast as Toast } from '../../shared/components/TimedToast.jsx';
import { TabSuspense } from '../TabSuspense.jsx';
import { AuthScreen } from '../auth-views';
import { AppFooter } from './AppFooter.jsx';

const VisitViewLazy = lazy(() => import('../visit-views').then((m) => ({ default: m.VisitView })));

/** Visite invitée : aucun tutoriel proposé (constante de module — évite un tableau recréé à chaque rendu). */
const GUEST_VISIT_TUTORIALS = [];

/**
 * Shell affiché tant qu'aucune session n'est établie : écran de connexion, ou visite
 * publique invitée (avec son onboarding mascotte). Extrait du retour anticipé d'App.jsx
 * — iso-rendu, les gestionnaires d'état restent côté App.
 *
 * @param {object} props
 * @param {object|null} props.publicSettings Réglages publics (contexte + textes).
 * @param {string|null} props.toast Message de toast courant.
 * @param {() => void} props.onToastDone Fin d'affichage du toast.
 * @param {boolean} props.showPublicVisit Visite invitée active (sinon écran de connexion).
 * @param {string} props.visitInitialMapId Carte initiale de la visite invitée.
 * @param {boolean} props.guestVisitNeedsMascotChoice Onboarding mascotte invité en attente.
 * @param {() => void} props.onGuestBackToAuth Retour à l'écran de connexion depuis la visite.
 * @param {() => void} props.onGuestMascotChoiceDone Choix de mascotte invité confirmé.
 * @param {(session: object) => void} props.onLogin Connexion réussie (élève ou prof).
 * @param {() => void} props.onVisitGuest Entrée en visite invitée.
 * @param {string|number|null} props.appVersion Version applicative.
 * @param {string} props.footerVersionPrefix Libellé « Version » du pied de page.
 * @param {boolean} props.isN3Affiliated Vocabulaire n3 (terminologie alternative).
 */
export function UnauthenticatedShell({
  publicSettings,
  toast,
  onToastDone,
  showPublicVisit,
  visitInitialMapId,
  guestVisitNeedsMascotChoice,
  onGuestBackToAuth,
  onGuestMascotChoiceDone,
  onLogin,
  onVisitGuest,
  appVersion,
  footerVersionPrefix,
  isN3Affiliated,
}) {
  return (
    <PublicSettingsProvider value={publicSettings}>
      <>
        <AppStatusSticky />
        {toast && <Toast msg={toast} onDone={onToastDone} />}
        {showPublicVisit ? (
          <div id="app">
            <div className="main main--guest-visit">
              <TabSuspense>
                <VisitViewLazy
                  student={null}
                  isTeacher={false}
                  initialMapId={visitInitialMapId}
                  onBackToAuth={onGuestBackToAuth}
                  availableTutorials={GUEST_VISIT_TUTORIALS}
                  requireGuestMascotChoice={guestVisitNeedsMascotChoice}
                  onGuestMascotChoiceDone={onGuestMascotChoiceDone}
                />
              </TabSuspense>
            </div>
            <AppFooter versionPrefix={footerVersionPrefix} appVersion={appVersion} />
          </div>
        ) : (
          <AuthScreen
            onLogin={onLogin}
            appVersion={appVersion}
            uiSettings={publicSettings}
            onVisitGuest={onVisitGuest}
            isN3Affiliated={isN3Affiliated}
          />
        )}
      </>
    </PublicSettingsProvider>
  );
}
