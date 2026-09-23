import { useRef, useState } from 'react';
import { FMQuizCatalogPanel } from './admin/FMQuizCatalogPanel.jsx';
import { FMQuizQuestionEditorPanel } from './admin/FMQuizQuestionEditorPanel.jsx';
import { FMLearningLinksPanel } from './admin/FMLearningLinksPanel.jsx';
import { FMLearningLocksPanel } from './admin/FMLearningLocksPanel.jsx';
import { FMQuizByNotionPanel } from './admin/FMQuizByNotionPanel.jsx';
import { QuizView } from './QuizView.jsx';

/**
 * Vue prof Quiz : catalogue admin + édition + test élève.
 */
export function QuizAdminView({
  canManageQuiz = false,
  onOpenPlant,
  onOpenGlossaryTerm,
  onOpenSettingsLearning = null,
  initialQuestionCode = null,
  initialNotionId = null,
  initialNotionNiveau = null,
}) {
  const editorRef = useRef(null);
  const playRef = useRef(null);
  const [editorQuestionCode, setEditorQuestionCode] = useState(initialQuestionCode);
  /**
   * Question tirée par le panneau « par notion », affichée dans la section de test.
   * Le compteur distingue deux tirages successifs : une notion qui ne porte qu'une
   * question renvoie le même code, et sans lui le second clic ne ferait rien.
   */
  const [notionDraw, setNotionDraw] = useState({ code: null, seq: 0 });

  function scrollToEditor(code) {
    if (code) setEditorQuestionCode(code);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showDrawnQuestion(code) {
    setNotionDraw((prev) => ({ code, seq: prev.seq + 1 }));
    playRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const playQuestionCode = notionDraw.code ?? initialQuestionCode;

  return (
    <div className="pedago-view pedago-quiz-admin">
      {canManageQuiz ? (
        <>
          <section className="pedago-quiz-admin__catalog">
            <FMQuizCatalogPanel onEditQuestion={scrollToEditor} />
          </section>
          <section className="pedago-quiz-admin__notions">
            <FMQuizByNotionPanel onQuestionDrawn={showDrawnQuestion} />
          </section>
          <section ref={editorRef} className="pedago-quiz-admin__editor">
            <FMQuizQuestionEditorPanel
              initialQuestionCode={editorQuestionCode ?? initialQuestionCode}
              key={editorQuestionCode ?? initialQuestionCode ?? 'new'}
            />
          </section>
          <section className="pedago-quiz-admin__links">
            <FMLearningLinksPanel onOpenSettingsLearning={onOpenSettingsLearning} />
          </section>
          <section className="pedago-quiz-admin__locks">
            <FMLearningLocksPanel />
          </section>
        </>
      ) : (
        <p className="section-sub card" style={{ padding: '12px 14px' }}>
          Connectez-vous en mode professeur avec les droits biodiversité pour gérer le catalogue
          Quiz.
        </p>
      )}
      <section ref={playRef} className="pedago-quiz-admin__play">
        <h2 className="section-title">Tester comme un élève</h2>
        <QuizView
          key={`${playQuestionCode ?? 'libre'}-${notionDraw.seq}-${initialNotionId ?? ''}-${initialNotionNiveau ?? ''}`}
          onOpenPlant={onOpenPlant}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
          initialQuestionCode={playQuestionCode}
          initialNotionId={initialNotionId}
          initialNotionNiveau={initialNotionNiveau}
        />
      </section>
    </div>
  );
}
