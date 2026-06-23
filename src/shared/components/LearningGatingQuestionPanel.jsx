import React, { useCallback, useEffect, useState } from 'react';
import { getQcmFeedbackText, shouldShowQcmAnswerPhase } from '../qcm/qcmFeedback.js';

/**
 * Panneau d'une question QCM dans le flux gating (présentation + réponse + feedback).
 */
export function LearningGatingQuestionPanel({
  questionCode,
  questionDataset = null,
  questionIndex = 0,
  questionTotal = 1,
  presentQuestion,
  answerQuestion,
  onPassed,
  onAbandon,
  choiceClassName = 'learning-gating-quiz__choice',
  primaryBtnClassName = 'btn btn-primary btn-sm',
  ghostBtnClassName = 'btn btn-ghost btn-sm',
}) {
  const [loading, setLoading] = useState(true);
  const [presentation, setPresentation] = useState(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const loadPresentation = useCallback(async () => {
    setLoading(true);
    setError('');
    setPresentation(null);
    setSelectedChoiceId(null);
    setResult(null);
    try {
      const data = await presentQuestion(questionCode, questionDataset);
      setPresentation(data);
    } catch (err) {
      setError(err?.message || 'Chargement de la question impossible');
    } finally {
      setLoading(false);
    }
  }, [presentQuestion, questionCode, questionDataset]);

  useEffect(() => {
    loadPresentation();
  }, [loadPresentation]);

  const submitAnswer = useCallback(async () => {
    if (!presentation?.presentationToken || selectedChoiceId == null) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await answerQuestion(
        questionCode,
        questionDataset,
        presentation.presentationToken,
        selectedChoiceId,
      );
      setResult(data);
    } catch (err) {
      setError(err?.message || 'Envoi de la réponse impossible');
    } finally {
      setSubmitting(false);
    }
  }, [answerQuestion, presentation, questionCode, questionDataset, selectedChoiceId]);

  const showAnswer = shouldShowQcmAnswerPhase(result);
  const feedbackText = getQcmFeedbackText(result);

  return (
    <div className="learning-gating-quiz">
      <p className="tuto-read-ack-intro">
        Vérifie ta compréhension avant de valider — question {questionIndex + 1} sur {questionTotal}
        .
      </p>
      {loading ? <p className="tuto-read-ack-intro">Chargement de la question…</p> : null}
      {error ? <p className="tuto-read-ack-error">{error}</p> : null}
      {!loading && !showAnswer && presentation ? (
        <>
          {questionCode ? <p className="learning-gating-quiz__code">{questionCode}</p> : null}
          <p className="learning-gating-quiz__question">{presentation.question}</p>
          {presentation.photoUrl ? (
            <figure className="learning-gating-quiz__photo">
              <img src={presentation.photoUrl} alt="" />
            </figure>
          ) : null}
          <div className="learning-gating-quiz__choices">
            {(presentation.choices || []).map((choice) => (
              <label key={choice.id} className={choiceClassName}>
                <input
                  type="radio"
                  name={`gating-qcm-${questionCode}`}
                  checked={selectedChoiceId === choice.id}
                  onChange={() => setSelectedChoiceId(choice.id)}
                  disabled={submitting}
                />
                <span>{choice.text}</span>
              </label>
            ))}
          </div>
          <div className="tuto-read-ack-actions">
            <button
              type="button"
              className={ghostBtnClassName}
              disabled={submitting}
              onClick={onAbandon}
            >
              Abandonner
            </button>
            <button
              type="button"
              className={primaryBtnClassName}
              disabled={submitting || selectedChoiceId == null}
              onClick={submitAnswer}
            >
              {submitting ? 'Envoi…' : 'Valider ma réponse'}
            </button>
          </div>
        </>
      ) : null}
      {showAnswer ? (
        <>
          <p
            className={
              result?.correct
                ? 'learning-gating-quiz__feedback learning-gating-quiz__feedback--ok'
                : 'learning-gating-quiz__feedback learning-gating-quiz__feedback--ko'
            }
            role="status"
          >
            {feedbackText}
          </p>
          <div className="tuto-read-ack-actions">
            {result?.correct ? (
              <button type="button" className={primaryBtnClassName} onClick={onPassed}>
                Continuer
              </button>
            ) : (
              <>
                <button type="button" className={ghostBtnClassName} onClick={onAbandon}>
                  Abandonner
                </button>
                <button type="button" className={primaryBtnClassName} onClick={loadPresentation}>
                  Réessayer
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
