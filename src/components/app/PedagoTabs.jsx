import React, { lazy } from 'react';

import { TabSuspense } from '../TabSuspense.jsx';

const VisitViewLazy = lazy(() => import('../visit-views').then((m) => ({ default: m.VisitView })));
const GlossaryViewLazy = lazy(() =>
  import('../pedago-views').then((m) => ({ default: m.GlossaryView })),
);
const QuizViewLazy = lazy(() => import('../pedago-views').then((m) => ({ default: m.QuizView })));
const QuizAdminViewLazy = lazy(() =>
  import('../pedago-views').then((m) => ({ default: m.QuizAdminView })),
);
const FoodWebViewLazy = lazy(() =>
  import('../pedago-views').then((m) => ({ default: m.FoodWebView })),
);
const AboutViewLazy = lazy(() => import('../about-views').then((m) => ({ default: m.AboutView })));

/**
 * Onglets pédagogiques partagés par les branches prof et élève d'App.jsx (D4) :
 * visite, glossaire, quiz, réseau trophique, à propos. Un seul onglet est rendu
 * à la fois — iso-rendu avec les anciens blocs dupliqués.
 *
 * Différences historiques entre branches, préservées (voir cartographie D4) :
 * - visite : `onOpenMascotPackStudioTab` n'existe que côté prof (undefined côté
 *   élève, comme la prop absente d'avant) ;
 * - quiz : composant différent selon la branche — QuizAdminViewLazy (avec
 *   `canManageQuiz`) côté prof, QuizViewLazy côté élève ;
 * - `profileVisitMascotId` : même expression sur le `student` de chaque branche
 *   (currentUser côté prof, studentForUi côté élève) → calculé en interne.
 */
export function PedagoTabs({
  isTeacher,
  tab,
  visitEnabled,
  student,
  tutorials,
  activeMapId,
  zones,
  markers,
  onForceLogout,
  onOpenMascotPackStudioTab,
  onOpenPlantCatalogPreview,
  onOpenGlossaryTerm,
  onOpenQuizQuestion,
  glossarySelectedCode,
  onGlossarySelectedCodeChange,
  canManageQuiz,
  quizInitialQuestionCode,
  maps,
  foodWebHighlightPlantId,
  canManageFoodWeb,
  appVersion,
}) {
  return (
    <>
      {visitEnabled && tab === 'visit' && (
        <TabSuspense>
          <VisitViewLazy
            student={student}
            isTeacher={isTeacher}
            availableTutorials={tutorials}
            initialMapId={activeMapId}
            onForceLogout={onForceLogout}
            onOpenMascotPackStudioTab={onOpenMascotPackStudioTab}
            profileVisitMascotId={student?.visit_mascot_catalog_id || null}
            mapZones={zones}
            mapMarkers={markers}
            catalogTutorials={tutorials}
            onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
          />
        </TabSuspense>
      )}
      {tab === 'glossary' && (
        <TabSuspense>
          <GlossaryViewLazy
            onOpenPlant={onOpenPlantCatalogPreview}
            onOpenQuizQuestion={onOpenQuizQuestion}
            selectedCode={glossarySelectedCode}
            onSelectedCodeChange={onGlossarySelectedCodeChange}
          />
        </TabSuspense>
      )}
      {tab === 'quiz' &&
        (isTeacher ? (
          <TabSuspense>
            <QuizAdminViewLazy
              canManageQuiz={canManageQuiz}
              onOpenPlant={onOpenPlantCatalogPreview}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
              initialQuestionCode={quizInitialQuestionCode}
            />
          </TabSuspense>
        ) : (
          <TabSuspense>
            <QuizViewLazy
              onOpenPlant={onOpenPlantCatalogPreview}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
              initialQuestionCode={quizInitialQuestionCode}
            />
          </TabSuspense>
        ))}
      {tab === 'foodweb' && (
        <TabSuspense>
          <FoodWebViewLazy
            maps={maps}
            onOpenPlant={onOpenPlantCatalogPreview}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
            highlightPlantId={foodWebHighlightPlantId}
            canManage={canManageFoodWeb}
          />
        </TabSuspense>
      )}
      {tab === 'about' && (
        <TabSuspense>
          <AboutViewLazy appVersion={appVersion} isTeacher={isTeacher} />
        </TabSuspense>
      )}
    </>
  );
}
