import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLQcmFeedbackBlock } from './GLQcmFeedbackBlock.jsx';
import { hasQcmAnswerFeedback } from '../utils/glQcmDisplay.js';
import { GLGlossaryInlineText } from './GLGlossaryMarkdown.jsx';

export function GLQcmPopover({
  open,
  marker,
  gameId,
  teamId = null,
  presentation,
  questionCode,
  loading,
  error: externalError,
  result,
  onClose,
  onOpenGlossaryTerm,
  glossaryLinkItems = [],
  onAnswered,
  onReshuffle,
  onSubmitResult,
  /** Variables CSS marque (hors `.gl-app` car portail `document.body`) */
  themeStyle = null,
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

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
      if (teamId != null) body.teamId = Number(teamId);
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

  if (!open || typeof document === 'undefined') return null;

  const displayError = externalError || error;
  const showAnswer = hasQcmAnswerFeedback(result);

  return createPortal(
    <div
      className="gl-qcm-popover-overlay"
      role="presentation"
      style={themeStyle || undefined}
      onClick={() => onClose?.()}
    >
      <div
        className="gl-qcm-popover"
        role="dialog"
        aria-label="Question"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="gl-qcm-popover__body">
          <header className="gl-qcm-popover__header">
            <h3>{marker?.label || 'Question'}</h3>
            {loading ? <p className="gl-hint">Chargement de la question…</p> : null}
            {displayError ? <p className="gl-error">{displayError}</p> : null}
          </header>
          {!loading && !result && presentation ? (
            <>
              <div className="gl-qcm-popover__scroll">
                {questionCode ? (
                  <p className="gl-hint">Question {questionCode}</p>
                ) : null}
                <GLGlossaryInlineText
                  className="gl-qcm-modal__question"
                  text={presentation.question}
                  glossaryItems={glossaryLinkItems}
                  onOpenGlossaryTerm={onOpenGlossaryTerm}
                  tag="p"
                />
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
                      <GLGlossaryInlineText
                        text={choice.text}
                        glossaryItems={glossaryLinkItems}
                        onOpenGlossaryTerm={onOpenGlossaryTerm}
                      />
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
              </div>
              <footer className="gl-qcm-popover__footer">
                <GLButton
                  type="button"
                  className="gl-qcm-popover__submit"
                  onClick={submitAnswer}
                  disabled={submitting || selectedChoiceId == null}
                  loading={submitting}
                >
                  {submitting ? 'Envoi…' : 'C\'est cette réponse !'}
                </GLButton>
                <div className="gl-inline-actions">
                  <GLButton type="button" variant="ghost" onClick={onReshuffle}>Re-mélanger</GLButton>
                  <GLButton type="button" variant="ghost" onClick={onClose}>Fermer</GLButton>
                </div>
              </footer>
            </>
          ) : null}
          {showAnswer ? (
            <>
              <div className="gl-qcm-popover__scroll">
                {questionCode ? (
                  <p className="gl-hint">Question {questionCode}</p>
                ) : null}
                <GLQcmFeedbackBlock
                  result={result}
                  scoreDelta={result?.scoreDelta}
                  glossaryLinkItems={glossaryLinkItems}
                  onOpenGlossaryTerm={onOpenGlossaryTerm}
                />
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
              </div>
              <footer className="gl-qcm-popover__footer">
                <div className="gl-inline-actions">
                  {!result.correct ? (
                    <GLButton type="button" onClick={onReshuffle}>Réessayer</GLButton>
                  ) : null}
                  <GLButton type="button" onClick={onClose}>Fermer</GLButton>
                </div>
              </footer>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
