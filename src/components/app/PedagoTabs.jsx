import { lazy } from 'react';

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
const NestedGroupsViewLazy = lazy(() =>
  import('../pedago-views').then((m) => ({ default: m.NestedGroupsView })),
);
const IdKeysViewLazy = lazy(() =>
  import('../pedago-views').then((m) => ({ default: m.IdKeysView })),
);
const IndividualsViewLazy = lazy(() =>
  import('../pedago-views').then((m) => ({ default: m.IndividualsView })),
);
const SessionsViewLazy = lazy(() =>
  import('../pedago-views').then((m) => ({ default: m.SessionsView })),
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
  onPersistVisitMascotId = null,
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
  quizInitialNotionId = null,
  quizInitialNotionNiveau = null,
  idKeysInitialKey = null,
  maps,
  foodWebHighlightPlantId,
  canManageFoodWeb,
  canManageIdKeys = false,
  canManageIndividuals = false,
  canMeasureIndividuals = false,
  appVersion,
  onOpenSettingsLearning = null,
  canReadSiteIssues = false,
  sessionsProps = null,
  pedagoEntry = null,
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
            onPersistVisitMascotId={onPersistVisitMascotId}
            mapZones={zones}
            mapMarkers={markers}
            catalogTutorials={tutorials}
            onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
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
              onOpenSettingsLearning={onOpenSettingsLearning}
              initialQuestionCode={quizInitialQuestionCode}
              initialNotionId={quizInitialNotionId}
              initialNotionNiveau={quizInitialNotionNiveau}
            />
          </TabSuspense>
        ) : (
          <TabSuspense>
            <QuizViewLazy
              onOpenPlant={onOpenPlantCatalogPreview}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
              initialQuestionCode={quizInitialQuestionCode}
              initialNotionId={quizInitialNotionId}
              initialNotionNiveau={quizInitialNotionNiveau}
            />
          </TabSuspense>
        ))}
      {tab === 'foodweb' && (
        <TabSuspense>
          <FoodWebViewLazy
            maps={maps}
            initialMapId={activeMapId}
            onOpenPlant={onOpenPlantCatalogPreview}
            onOpenGlossaryTerm={onOpenGlossaryTerm}
            highlightPlantId={foodWebHighlightPlantId}
            canManage={canManageFoodWeb}
          />
        </TabSuspense>
      )}
      {tab === 'nested-groups' && (
        <TabSuspense>
          <NestedGroupsViewLazy
            maps={maps}
            initialMapId={activeMapId}
            canManage={canManageFoodWeb}
            onOpenPlant={onOpenPlantCatalogPreview}
            activityRequest={pedagoEntry?.nestedGroups || null}
          />
        </TabSuspense>
      )}
      {tab === 'id-keys' && (
        <TabSuspense>
          <IdKeysViewLazy
            canManage={canManageIdKeys}
            onOpenPlant={onOpenPlantCatalogPreview}
            initialKey={idKeysInitialKey}
          />
        </TabSuspense>
      )}
      {tab === 'individuals' && (
        <TabSuspense>
          <IndividualsViewLazy
            maps={maps}
            initialMapId={activeMapId}
            canManage={canManageIndividuals}
            canMeasure={canMeasureIndividuals}
            onOpenPlant={onOpenPlantCatalogPreview}
            initialIndividualId={pedagoEntry?.individualId ?? null}
          />
        </TabSuspense>
      )}
      {tab === 'sessions' && sessionsProps && (
        <TabSuspense>
          <SessionsViewLazy {...sessionsProps} />
        </TabSuspense>
      )}
      {tab === 'about' && (
        <TabSuspense>
          <AboutViewLazy
            appVersion={appVersion}
            isTeacher={isTeacher}
            canReadSiteIssues={canReadSiteIssues}
          />
        </TabSuspense>
      )}
    </>
  );
}
