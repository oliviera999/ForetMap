import { useCallback, useEffect, useState } from 'react';
import { getQcmFeedbackText, shouldShowQcmAnswerPhase } from '../qcm/qcmFeedback.js';
import { QcmQuestionPhoto } from '../qcm/QcmQuestionPhoto.jsx';
import {
  isCooldownLocked,
  isQuestionScopedLock,
  buildCooldownLockMessage,
  buildQuestionLockMessage,
} from '../utils/learningGatingChallengeClient.js';

/**
 * Panneau d'une question QCM dans le flux gating (présentation + réponse + feedback).
 */
export function LearningGatingQuestionPanel({
  questionCode,
  questionDataset = null,
  questionIndex = 0,
  questionTotal = 1,
  resourceType = null,
  resourceRef = null,
  itemTitle = '',
  presentQuestion,
  answerQuestion,
  onPassed,
  onAbandon,
  /** Erreur qui n'a bloqué que la question (portée « question seule ») : le parent recharge. */
  onQuestionLocked = null,
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
  const [notice, setNotice] = useState('');

  const loadPresentation = useCallback(async () => {
    setLoading(true);
    setError('');
    setPresentation(null);
    setSelectedChoiceId(null);
    setResult(null);
    try {
      // Le contexte ressource est demandé dès la présentation : le serveur le grave dans le
      // jeton, ce qui fait tenir le verrou même si le corps de la réponse est modifié.
      const resource =
        resourceType && resourceRef != null && resourceRef !== ''
          ? { resourceType, resourceRef }
          : null;
      const data = await presentQuestion(questionCode, questionDataset, resource);
      setPresentation(data);
    } catch (err) {
      setError(err?.message || 'Chargement de la question impossible');
    } finally {
      setLoading(false);
    }
  }, [presentQuestion, questionCode, questionDataset, resourceType, resourceRef]);

  useEffect(() => {
    loadPresentation();
  }, [loadPresentation]);

  const submitAnswer = useCallback(async () => {
    if (!presentation?.presentationToken || selectedChoiceId == null) return;
    setSubmitting(true);
    setError('');
    try {
      const resource =
        resourceType && resourceRef != null && resourceRef !== ''
          ? { resourceType, resourceRef }
          : null;
      const data = await answerQuestion(
        questionCode,
        questionDataset,
        presentation.presentationToken,
        selectedChoiceId,
        resource,
      );
      setResult(data);
    } catch (err) {
      // 409 : la présentation a expiré (15 min) ou a déjà servi — on recharge la question
      // avec de nouveaux choix plutôt que d'afficher « Présentation déjà utilisée » (D3).
      if (err?.status === 409) {
        setNotice('Cette question avait expiré : elle est rechargée avec de nouveaux choix.');
        await loadPresentation();
        return;
      }
      // 403 avec verrou : la question (ou la fiche) s'est bloquée entre-temps.
      if (err?.status === 403 && err?.body?.cooldown) {
        setResult({ correct: false, cooldown: err.body.cooldown, feedback: err.body.error || '' });
        return;
      }
      setError(err?.message || 'Envoi de la réponse impossible');
    } finally {
      setSubmitting(false);
    }
  }, [
    loadPresentation,
    answerQuestion,
    presentation,
    questionCode,
    questionDataset,
    resourceType,
    resourceRef,
    selectedChoiceId,
  ]);

  const showAnswer = shouldShowQcmAnswerPhase(result);
  const feedbackText = getQcmFeedbackText(result);
  const cooldownLocked = !result?.correct && isCooldownLocked(result?.cooldown);
  // Portée « question seule » : seule cette question est bloquée, la fiche reste ouverte si
  // d'autres questions peuvent être posées — c'est le parent qui le sait (il recharge).
  const questionOnlyLocked =
    cooldownLocked &&
    isQuestionScopedLock(result.cooldown) &&
    typeof onQuestionLocked === 'function';

  return (
    <div className="learning-gating-quiz">
      <p className="tuto-read-ack-intro">
        Vérifie ta compréhension avant de valider — question {questionIndex + 1} sur {questionTotal}
        .
      </p>
      {loading ? <p className="tuto-read-ack-intro">Chargement de la question…</p> : null}
      {notice ? (
        <p className="tuto-read-ack-intro learning-gating-quiz__notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? <p className="tuto-read-ack-error">{error}</p> : null}
      {!loading && !showAnswer && presentation ? (
        <>
          {questionCode ? (
            <p className="learning-gating-quiz__code">Question {questionCode}</p>
          ) : null}
          <p className="learning-gating-quiz__question">{presentation.question}</p>
          <QcmQuestionPhoto
            presentation={presentation}
            figureClassName="learning-gating-quiz__photo"
            captionClassName="learning-gating-quiz__photo-credit"
          />
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
          {cooldownLocked ? (
            <p className="learning-gating-quiz__cooldown" role="alert">
              {questionOnlyLocked
                ? buildQuestionLockMessage(result.cooldown)
                : buildCooldownLockMessage(result.cooldown, itemTitle)}
            </p>
          ) : null}
          <div className="tuto-read-ack-actions">
            {result?.correct ? (
              <button type="button" className={primaryBtnClassName} onClick={onPassed}>
                Continuer
              </button>
            ) : questionOnlyLocked ? (
              <button
                type="button"
                className={primaryBtnClassName}
                onClick={() => onQuestionLocked(result.cooldown)}
              >
                Continuer
              </button>
            ) : cooldownLocked ? (
              <button type="button" className={primaryBtnClassName} onClick={onAbandon}>
                Fermer
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
