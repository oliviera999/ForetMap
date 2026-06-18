import React from 'react';
import { FMQuizCatalogPanel } from './admin/FMQuizCatalogPanel.jsx';
import { QuizView } from './QuizView.jsx';

/**
 * Vue prof Quiz : catalogue admin (si élevé) + test élève.
 */
export function QuizAdminView({
  canManageQuiz = false,
  onOpenPlant,
  onOpenGlossaryTerm,
  initialQuestionCode = null,
}) {
  return (
    <div className="pedago-view pedago-quiz-admin">
      {canManageQuiz ? (
        <section className="pedago-quiz-admin__catalog">
          <FMQuizCatalogPanel />
        </section>
      ) : (
        <p className="section-sub card" style={{ padding: '12px 14px' }}>
          Élevez vos droits (PIN) pour importer ou exporter le catalogue Quiz.
        </p>
      )}
      <section className="pedago-quiz-admin__play">
        <h2 className="section-title">Tester comme un élève</h2>
        <QuizView
          onOpenPlant={onOpenPlant}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          initialQuestionCode={initialQuestionCode}
        />
      </section>
    </div>
  );
}
