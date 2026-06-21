import React from 'react';
import {
  getQcmFeedbackText,
  shouldShowQcmAnswerPhase,
} from '../../shared/qcm/qcmFeedback.js';

/** Retour pédagogique après validation d'une réponse QCM (style ForetMap). */
export function PedagoQcmFeedbackBlock({ result, className = '' }) {
  const text = getQcmFeedbackText(result);
  if (!text) return null;
  const correct = Boolean(result?.correct);

  return (
    <div
      className={`pedago-qcm-feedback ${correct ? 'pedago-qcm-feedback--ok' : 'pedago-qcm-feedback--ko'} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <p className="pedago-qcm-feedback__text">{text}</p>
    </div>
  );
}

/** @deprecated Préférer `shouldShowQcmAnswerPhase` depuis `shared/qcm/qcmFeedback`. */
export const shouldShowPedagoQcmAnswerPhase = shouldShowQcmAnswerPhase;
