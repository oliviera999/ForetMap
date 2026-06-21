import React, { useRef, useState } from 'react';
import { FMQuizCatalogPanel } from './admin/FMQuizCatalogPanel.jsx';
import { FMQuizQuestionEditorPanel } from './admin/FMQuizQuestionEditorPanel.jsx';
import { QuizView } from './QuizView.jsx';

/**
 * Vue prof Quiz : catalogue admin + édition + test élève.
 */
export function QuizAdminView({
  canManageQuiz = false,
  onOpenPlant,
  onOpenGlossaryTerm,
  initialQuestionCode = null,
}) {
  const editorRef = useRef(null);
  const [editorQuestionCode, setEditorQuestionCode] = useState(initialQuestionCode);

  function scrollToEditor(code) {
    if (code) setEditorQuestionCode(code);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="pedago-view pedago-quiz-admin">
      {canManageQuiz ? (
        <>
          <section className="pedago-quiz-admin__catalog">
            <FMQuizCatalogPanel onEditQuestion={scrollToEditor} />
          </section>
          <section ref={editorRef} className="pedago-quiz-admin__editor">
            <FMQuizQuestionEditorPanel
              initialQuestionCode={editorQuestionCode ?? initialQuestionCode}
              key={editorQuestionCode ?? initialQuestionCode ?? 'new'}
            />
          </section>
        </>
      ) : (
        <p className="section-sub card" style={{ padding: '12px 14px' }}>
          Connectez-vous en mode professeur avec les droits biodiversité pour gérer le catalogue
          Quiz.
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
