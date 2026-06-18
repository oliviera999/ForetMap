import React from 'react';
import { hasQcmAnswerFeedback } from '../../gl/utils/glQcmDisplay.js';

/**
 * Modale d'aperçu QCM partagée (GL + ForetMap pédagogie).
 */
export function QcmPreviewModal({
  previewCode,
  presentLoading,
  answerLoading,
  presentation,
  feedback,
  selectedChoiceId,
  onReload,
  onSelectChoice,
  onSubmitAnswer,
  onClose,
  onCloseFromFeedback,
  FeedbackBlock,
  Button,
  classNames = {},
}) {
  const {
    root = 'gl-qcm-modal gl-qcm-modal--inline',
    body = 'gl-qcm-modal__body',
    question = 'gl-qcm-modal__question',
    choices = 'gl-qcm-modal__choices',
    choice = 'gl-qcm-choice',
    actions = 'gl-inline-actions',
    hint = 'gl-hint',
    error = 'gl-error',
  } = classNames;

  if (!previewCode) return null;
  return (
    <div className={root} role="dialog" aria-label="Aperçu QCM">
      <div className={body}>
        <h4>Aperçu — {previewCode}</h4>
        {presentLoading ? <p className={hint}>Chargement…</p> : null}
        {hasQcmAnswerFeedback(feedback) ? (
          <>
            <FeedbackBlock result={feedback} />
            <div className={actions}>
              <Button type="button" onClick={onReload}>
                Nouvelle présentation
              </Button>
              <Button type="button" variant="ghost" onClick={onCloseFromFeedback}>
                Fermer
              </Button>
            </div>
          </>
        ) : (
          <>
            {presentation?.question ? <p className={question}>{presentation.question}</p> : null}
            {presentation?.choices?.length ? (
              <div className={choices}>
                {presentation.choices.map((c) => (
                  <label key={c.id} className={choice}>
                    <input
                      type="radio"
                      name="preview-choice"
                      checked={selectedChoiceId === c.id}
                      onChange={() => onSelectChoice(c.id)}
                    />
                    <span>{c.text}</span>
                  </label>
                ))}
              </div>
            ) : null}
            <div className={actions}>
              <Button type="button" onClick={onReload}>
                Re-mélanger
              </Button>
              <Button
                type="button"
                onClick={onSubmitAnswer}
                disabled={answerLoading || selectedChoiceId == null}
              >
                Valider
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Fermer
              </Button>
            </div>
            {feedback?.error ? <p className={error}>{feedback.error}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
