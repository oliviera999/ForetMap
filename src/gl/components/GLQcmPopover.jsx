import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';

export function GLQcmPopover({
  open,
  marker,
  anchorPct,
  gameId,
  presentation,
  questionCode,
  loading,
  error: externalError,
  result,
  onClose,
  onOpenGlossaryTerm,
  onAnswered,
  onReshuffle,
  onSubmitResult,
}) {
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedChoiceId(null);
      setError('');
    }
  }, [open, questionCode, presentation?.presentationToken]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function submitAnswer() {
    if (!questionCode || !presentation?.presentationToken || selectedChoiceId == null) return;
    setSubmitting(true);
    setError('');
    try {
      const body = {
        questionCode,
        presentationToken: presentation.presentationToken,
        choiceId: selectedChoiceId,
        markerId: marker?.id ?? null,
      };
      const data = gameId
        ? await apiGL(`/api/gl/games/${gameId}/qcm/answer`, 'POST', body)
        : await apiGL(`/api/gl/qcm/questions/${encodeURIComponent(questionCode)}/answer`, 'POST', {
          presentationToken: body.presentationToken,
          choiceId: body.choiceId,
        });
      onSubmitResult?.(data);
      if (gameId && data?.correct) onAnswered?.(data);
    } catch (err) {
      setError(err.message || 'Envoi de la réponse impossible');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !anchorPct) return null;

  const displayError = externalError || error;

  return (
    <>
      <div
        className="gl-qcm-popover__anchor"
        style={{ left: `${anchorPct.xp}%`, top: `${anchorPct.yp}%` }}
        aria-hidden
      />
      <div
        className="gl-qcm-popover"
        role="dialog"
        aria-label="Question"
        style={{ left: `${anchorPct.xp}%`, top: `${anchorPct.yp}%` }}
      >
        <div className="gl-qcm-popover__body">
          <h3>{marker?.label || 'Question'}</h3>
          {loading ? <p className="gl-hint">Chargement de la question…</p> : null}
          {displayError ? <p className="gl-error">{displayError}</p> : null}
          {!loading && !result && presentation ? (
            <>
              {questionCode ? (
                <p className="gl-hint">Question {questionCode}</p>
              ) : null}
              <p className="gl-qcm-modal__question">{presentation.question}</p>
              {presentation.photoUrl ? (
                <img src={presentation.photoUrl} alt="" className="gl-qcm-modal__photo" />
              ) : null}
              <div className="gl-qcm-modal__choices">
                {presentation.choices.map((choice) => (
                  <label key={choice.id} className="gl-qcm-choice">
                    <input
                      type="radio"
                      name="qcm-popover-choice"
                      checked={selectedChoiceId === choice.id}
                      onChange={() => setSelectedChoiceId(choice.id)}
                    />
                    <span>{choice.text}</span>
                  </label>
                ))}
              </div>
              {Array.isArray(presentation.glossaryTerms) && presentation.glossaryTerms.length > 0 ? (
                <div className="gl-qcm-modal__glossary">
                  <strong>Glossaire :</strong>
                  <div className="gl-glossary-chips">
                    {presentation.glossaryTerms.map((term) => (
                      <button
                        key={term.glossary_code}
                        type="button"
                        className="gl-glossary-chip"
                        onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                      >
                        {term.terme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="gl-inline-actions">
                <GLButton type="button" onClick={onReshuffle}>Re-mélanger</GLButton>
                <GLButton
                  type="button"
                  onClick={submitAnswer}
                  disabled={submitting || selectedChoiceId == null}
                >
                  {submitting ? 'Envoi…' : 'Valider'}
                </GLButton>
                <GLButton type="button" variant="ghost" onClick={onClose}>Fermer</GLButton>
              </div>
            </>
          ) : null}
          {result ? (
            <>
              <p className={result.correct ? 'gl-qcm-feedback gl-qcm-feedback--ok' : 'gl-qcm-feedback gl-qcm-feedback--ko'}>
                {result.feedback}
                {Number(result.scoreDelta) > 0 ? ` (+${result.scoreDelta} point)` : ''}
              </p>
              {Array.isArray(result.glossaryTerms) && result.glossaryTerms.length > 0 ? (
                <div className="gl-qcm-modal__glossary">
                  <strong>Termes liés :</strong>
                  <div className="gl-glossary-chips">
                    {result.glossaryTerms.map((term) => (
                      <button
                        key={term.glossary_code}
                        type="button"
                        className="gl-glossary-chip"
                        onClick={() => onOpenGlossaryTerm?.(term.glossary_code)}
                      >
                        {term.terme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="gl-inline-actions">
                {!result.correct ? (
                  <GLButton type="button" onClick={onReshuffle}>Réessayer</GLButton>
                ) : null}
                <GLButton type="button" onClick={onClose}>Fermer</GLButton>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
