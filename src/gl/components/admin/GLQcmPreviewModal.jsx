import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import { GLQcmFeedbackBlock } from '../GLQcmFeedbackBlock.jsx';
import { hasQcmAnswerFeedback } from '../../utils/glQcmDisplay.js';

/**
 * Modale d'aperçu d'une question QCM (présentation + validation) du panneau
 * catalogue GL. Feuille de présentation pure : l'état (code prévisualisé,
 * présentation, choix sélectionné, feedback, chargements) reste détenu par le
 * parent ; les actions remontent via callbacks.
 *
 * @param {Object} props
 * @param {string|null} props.previewCode - code de la question prévisualisée (null = masquée).
 * @param {boolean} props.presentLoading - chargement de la présentation.
 * @param {boolean} props.answerLoading - validation de la réponse en cours.
 * @param {Object|null} props.presentation - présentation courante (question + choix).
 * @param {Object|null} props.feedback - retour de validation ({ error } ou résultat).
 * @param {number|string|null} props.selectedChoiceId - choix sélectionné.
 * @param {Function} props.onReload - relance une présentation (re-mélange).
 * @param {Function} props.onSelectChoice - sélectionne un choix (id).
 * @param {Function} props.onSubmitAnswer - valide la réponse sélectionnée.
 * @param {Function} props.onClose - ferme depuis la phase question.
 * @param {Function} props.onCloseFromFeedback - ferme depuis la phase feedback (réinitialise aussi le feedback).
 */
export function GLQcmPreviewModal({
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
}) {
  if (!previewCode) return null;
  return (
    <div className="gl-qcm-modal gl-qcm-modal--inline" role="dialog" aria-label="Aperçu QCM">
      <div className="gl-qcm-modal__body">
        <h4>Aperçu — {previewCode}</h4>
        {presentLoading ? <p className="gl-hint">Chargement…</p> : null}
        {hasQcmAnswerFeedback(feedback) ? (
          <>
            <GLQcmFeedbackBlock result={feedback} />
            <div className="gl-inline-actions">
              <GLButton type="button" onClick={onReload}>
                Nouvelle présentation
              </GLButton>
              <GLButton type="button" variant="ghost" onClick={onCloseFromFeedback}>
                Fermer
              </GLButton>
            </div>
          </>
        ) : (
          <>
            {presentation?.question ? (
              <p className="gl-qcm-modal__question">{presentation.question}</p>
            ) : null}
            {presentation?.choices?.length ? (
              <div className="gl-qcm-modal__choices">
                {presentation.choices.map((choice) => (
                  <label key={choice.id} className="gl-qcm-choice">
                    <input
                      type="radio"
                      name="preview-choice"
                      checked={selectedChoiceId === choice.id}
                      onChange={() => onSelectChoice(choice.id)}
                    />
                    <span>{choice.text}</span>
                  </label>
                ))}
              </div>
            ) : null}
            <div className="gl-inline-actions">
              <GLButton type="button" onClick={onReload}>
                Re-mélanger
              </GLButton>
              <GLButton
                type="button"
                onClick={onSubmitAnswer}
                disabled={answerLoading || selectedChoiceId == null}
              >
                Valider
              </GLButton>
              <GLButton type="button" variant="ghost" onClick={onClose}>
                Fermer
              </GLButton>
            </div>
            {feedback?.error ? <p className="gl-error">{feedback.error}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
