import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { hasQcmAnswerFeedback } from '../../utils/glQcmDisplay.js';

/**
 * **Quiz d'essai** de la vitrine pour les parents (`?demo=parents`).
 *
 * Réemploie la chaîne QCM hors partie (`/api/gl/qcm/draw` → `present` → `answer`), qui
 * accepte un invité et, pour lui, **n'écrit rien** : ni tentative, ni usage de présentation
 * (GL8, cf. `docs/API.md`). Le parent répond à une vraie question du jeu, voit le retour
 * pédagogique, et peut en tirer une autre — sans trace.
 *
 * Volontairement plus simple que `GLQcmModal` : pas de loupe, pas de glossaire interactif,
 * pas de modale. La vitrine montre la matière, pas les mécaniques d'aide.
 */
export function GLParentsDemoQuiz({ biomeSlugs = [] }) {
  const [presentation, setPresentation] = useState(null);
  const [questionCode, setQuestionCode] = useState(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const chapterSlugsKey = Array.isArray(biomeSlugs) ? biomeSlugs.filter(Boolean).join(',') : '';
  // Chapitre invité sans biome (installation neuve, chapitre de démo) : tout le catalogue.
  const [fallbackSlugsKey, setFallbackSlugsKey] = useState('');
  const [fallbackResolved, setFallbackResolved] = useState(false);
  useEffect(() => {
    if (chapterSlugsKey || fallbackResolved) return undefined;
    let cancelled = false;
    apiGL('/api/gl/biomes')
      .then((rows) => {
        if (cancelled) return;
        const slugs = (Array.isArray(rows) ? rows : []).map((b) => b?.slug).filter(Boolean);
        setFallbackSlugsKey(slugs.join(','));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFallbackResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterSlugsKey, fallbackResolved]);
  const slugsKey = chapterSlugsKey || fallbackSlugsKey;

  const drawQuestion = useCallback(async () => {
    if (!slugsKey) return;
    setLoading(true);
    setError('');
    setResult(null);
    setSelectedChoiceId(null);
    setPresentation(null);
    try {
      const params = new URLSearchParams({ biomeSlugs: slugsKey });
      const draw = await apiGL(`/api/gl/qcm/draw?${params.toString()}`);
      const code = draw?.question_code || null;
      if (!code) throw new Error('Aucune question disponible pour ce plateau');
      const present = await apiGL(`/api/gl/qcm/questions/${encodeURIComponent(code)}/present`);
      setQuestionCode(code);
      setPresentation(present);
    } catch (err) {
      setError(err?.message || 'Chargement de la question impossible');
    } finally {
      setLoading(false);
    }
  }, [slugsKey]);

  useEffect(() => {
    drawQuestion();
  }, [drawQuestion]);

  async function submitAnswer() {
    if (!questionCode || !presentation?.presentationToken || selectedChoiceId == null) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await apiGL(
        `/api/gl/qcm/questions/${encodeURIComponent(questionCode)}/answer`,
        'POST',
        { presentationToken: presentation.presentationToken, choiceId: selectedChoiceId },
      );
      setResult(data);
    } catch (err) {
      setError(err?.message || 'Envoi de la réponse impossible');
    } finally {
      setSubmitting(false);
    }
  }

  const answered = hasQcmAnswerFeedback(result);

  return (
    <div className="gl-parents-quiz" data-testid="gl-parents-quiz">
      {!slugsKey ? (
        <p className="gl-hint">
          {fallbackResolved
            ? 'Aucune question n’est disponible pour le moment.'
            : 'Le plateau de démonstration se charge, la question arrive.'}
        </p>
      ) : null}
      {loading ? <p className="gl-hint">Tirage d’une question…</p> : null}
      {error ? <p className="gl-error">{error}</p> : null}
      {presentation && !loading ? (
        <>
          <p className="gl-parents-quiz__question">{presentation.question}</p>
          <div className="gl-qcm-modal__choices">
            {(presentation.choices || []).map((choice) => (
              <label key={choice.id} className="gl-qcm-choice">
                <input
                  type="radio"
                  name="gl-parents-quiz-choice"
                  checked={selectedChoiceId === choice.id}
                  disabled={answered}
                  onChange={() => setSelectedChoiceId(choice.id)}
                />
                <span>{choice.text}</span>
              </label>
            ))}
          </div>
          {answered ? (
            <div
              className={`gl-parents-quiz__result${result.correct ? ' is-correct' : ' is-wrong'}`}
              role="status"
            >
              <strong>
                {result.correct ? 'Bonne réponse.' : 'Ce n’est pas la bonne réponse.'}
              </strong>
              {result.feedback ? <p>{result.feedback}</p> : null}
            </div>
          ) : null}
          <div className="gl-parents-quiz__actions">
            {!answered ? (
              <GLButton
                type="button"
                onClick={submitAnswer}
                disabled={submitting || selectedChoiceId == null}
                loading={submitting}
              >
                Valider ma réponse
              </GLButton>
            ) : null}
            <GLButton type="button" variant="ghost" onClick={drawQuestion} disabled={loading}>
              Une autre question
            </GLButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
