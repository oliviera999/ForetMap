import { useEffect } from 'react';
import { PedagoSessionProvider } from '../../contexts/PedagoSessionContext.jsx';
import { PublicSettingsProvider } from '../../contexts/PublicSettingsContext.jsx';
import { BiodivPedagoProvider } from '../../contexts/BiodivPedagoContext.jsx';
import { SessionProvider } from '../../contexts/SessionContext.jsx';
import { DataProvider } from '../../contexts/DataContext.jsx';
import { TourProvider } from '../../contexts/TourContext.jsx';
import { AppDialogsProvider, useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';

/**
 * Pont vers les dialogues applicatifs pour App lui-même : App monte
 * `AppDialogsProvider` dans son propre rendu, le hook `useAppDialogs` doit donc
 * être lu par un enfant du provider et exposé à App via une ref (audit
 * homogénéité UI, D-1).
 */
function AppDialogsBridge({ dialogsRef }) {
  const dialogs = useAppDialogs();
  useEffect(() => {
    dialogsRef.current = dialogs;
  }, [dialogs, dialogsRef]);
  return null;
}

/**
 * Empilement des fournisseurs de contexte du shell authentifié — déplacé tel quel
 * d'`App.jsx` (lot 6), dans le même ordre :
 * séance pédagogique → réglages publics → niveau biodiversité → dialogues applicatifs
 * (+ pont vers App) → session → données → visites guidées.
 *
 * @param {object} props
 * @param {object} props.pedagoSession Valeur de `usePedagoSession` (contexte de séance).
 * @param {object|null} props.publicSettings Réglages publics.
 * @param {object} props.biodiv Props de `BiodivPedagoProvider` (hors `isGuestVisit`).
 * @param {{ current: object|null }} props.dialogsRef Ref recevant les dialogues applicatifs.
 * @param {object} props.sessionContextValue Valeur mémoïsée de `SessionContext`.
 * @param {object} props.dataContextValue Valeur mémoïsée de `DataContext`.
 * @param {object} props.tour Props de `TourProvider`.
 * @param {import('react').ReactNode} props.children Contenu du shell (`#app`).
 */
export function AppProviders({
  pedagoSession,
  publicSettings,
  biodiv,
  dialogsRef,
  sessionContextValue,
  dataContextValue,
  tour,
  children,
}) {
  return (
    <PedagoSessionProvider value={pedagoSession}>
      <PublicSettingsProvider value={publicSettings}>
        <BiodivPedagoProvider
          isGuestVisit={false}
          userPreference={biodiv.userPreference}
          mapLevel={biodiv.mapLevel}
          groupLevels={biodiv.groupLevels}
          classCurriculumNiveaux={biodiv.classCurriculumNiveaux}
          sessionLevel={biodiv.sessionLevel}
          sessionNotionNiveau={biodiv.sessionNotionNiveau}
          canTeacherPreview={biodiv.canTeacherPreview}
          fullViewByDefault={biodiv.fullViewByDefault}
        >
          <AppDialogsProvider>
            <AppDialogsBridge dialogsRef={dialogsRef} />
            <SessionProvider value={sessionContextValue}>
              <DataProvider value={dataContextValue}>
                <TourProvider
                  tab={tour.tab}
                  isTeacher={tour.isTeacher}
                  isClassTeacher={tour.isClassTeacher}
                  enabled={tour.enabled}
                  accountSeen={tour.accountSeen}
                  accountSeenReady={tour.accountSeenReady}
                  onTourSeen={tour.onTourSeen}
                >
                  {children}
                </TourProvider>
              </DataProvider>
            </SessionProvider>
          </AppDialogsProvider>
        </BiodivPedagoProvider>
      </PublicSettingsProvider>
    </PedagoSessionProvider>
  );
}
