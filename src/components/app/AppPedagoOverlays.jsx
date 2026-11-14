import { Suspense } from 'react';
import { GlossaryPopover } from '../pedago/GlossaryPopover.jsx';
import { PedagoSessionBanner } from '../pedago/PedagoSessionBanner.jsx';
import { PedagoSessionDoneDialog } from '../pedago/PedagoSessionDoneDialog.jsx';
import { PlantCatalogPreviewModalLazy } from './appLazyViews.js';

/**
 * Surcouches pédagogiques du shell authentifié, en tête de `#app` — déplacées telles quelles
 * d'`App.jsx` (lot 6), dans le même ordre : fiche rapide du glossaire, bandeau de séance
 * en cours, dialogue de fin de séance, aperçu de fiche plante.
 *
 * @param {object} props
 * @param {string} props.tab Onglet courant.
 * @param {object} props.pedago Valeur de `useAppPedago`.
 * @param {boolean} props.pedagoSessionsAvailable Module « Séances » ouvert à ce compte.
 * @param {boolean} props.rewardsModuleEnabled Module « Récompenses » allumé.
 * @param {boolean} props.canAddToNotebook Le dialogue de fin propose le carnet.
 * @param {object[]} props.visibleMaps Cartes visibles du compte.
 * @param {(tab: string) => void} props.navigateTab Navigation utilisateur entre onglets.
 * @param {(options?: object) => void} props.forceLogout Déconnexion forcée (401).
 */
export function AppPedagoOverlays({
  tab,
  pedago,
  pedagoSessionsAvailable,
  rewardsModuleEnabled,
  canAddToNotebook,
  visibleMaps,
  navigateTab,
  forceLogout,
}) {
  const {
    glossaryPopoverCode,
    closeGlossaryPopover,
    openPedagoGlossaryTerm,
    plantCatalogPreview,
    setPlantCatalogPreview,
    openPlantCatalogPreviewById,
    openGlossaryPopover,
    openPedagoFoodWeb,
    openPedagoQuizQuestion,
    pedagoSession,
  } = pedago;
  const {
    activeSession: activePedagoSession,
    currentStep: pedagoSessionCurrentStep,
    completedSession: completedPedagoSession,
    setCompletedSession: setCompletedPedagoSession,
    exitSession: exitPedagoSession,
    goStep: goPedagoSessionStep,
  } = pedagoSession;

  return (
    <>
      {/* Fiche rapide du glossaire : hors des onglets et hors des modales, pour
      survivre à tout changement de vue et se poser au-dessus de l'aperçu
      de tutoriel (audit A1). */}
      {glossaryPopoverCode && (
        <GlossaryPopover
          open
          glossaryCode={glossaryPopoverCode}
          onClose={closeGlossaryPopover}
          onOpenFullGlossary={openPedagoGlossaryTerm}
          showFullGlossaryLink={tab !== 'glossary'}
        />
      )}
      {pedagoSessionsAvailable && activePedagoSession && pedagoSessionCurrentStep && (
        <PedagoSessionBanner
          sessionTitle={activePedagoSession.title}
          step={pedagoSessionCurrentStep}
          stepIndex={activePedagoSession.stepIndex}
          stepCount={activePedagoSession.steps.length}
          onPrev={() => goPedagoSessionStep(-1)}
          onNext={() => goPedagoSessionStep(1)}
          onExit={exitPedagoSession}
          onShowMessage={() => navigateTab('sessions')}
        />
      )}
      {completedPedagoSession && (
        <PedagoSessionDoneDialog
          session={completedPedagoSession}
          showRewards={rewardsModuleEnabled}
          canAddToNotebook={canAddToNotebook}
          onClose={() => setCompletedPedagoSession(null)}
          onOpenNotebook={() => {
            setCompletedPedagoSession(null);
            navigateTab('notebook');
          }}
        />
      )}
      {plantCatalogPreview && (
        <Suspense fallback={null}>
          <PlantCatalogPreviewModalLazy
            plant={plantCatalogPreview}
            maps={visibleMaps}
            onClose={() => setPlantCatalogPreview(null)}
            onForceLogout={forceLogout}
            onOpenPlant={openPlantCatalogPreviewById}
            onOpenGlossaryTerm={openGlossaryPopover}
            onNavigateToFoodWeb={openPedagoFoodWeb}
            onOpenQuizQuestion={openPedagoQuizQuestion}
          />
        </Suspense>
      )}
    </>
  );
}
