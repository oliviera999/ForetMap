import React from 'react';
import { getQcmFeedbackText } from '../utils/glQcmDisplay.js';

/**
 * Bloc de retour pédagogique après validation d'une réponse QCM.
 */
export function GLQcmFeedbackBlock({ result, scoreDelta = 0, className = '' }) {
  const text = getQcmFeedbackText(result);
  if (!text) return null;

  const correct = Boolean(result?.correct);
  const scoreSuffix = Number(scoreDelta) > 0 ? ` (+${Number(scoreDelta)} point)` : '';

  return (
    <div
      className={`gl-qcm-feedback-block ${correct ? 'gl-qcm-feedback-block--ok' : 'gl-qcm-feedback-block--ko'} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <p className={`gl-qcm-feedback ${correct ? 'gl-qcm-feedback--ok' : 'gl-qcm-feedback--ko'}`}>
        {text}
        {scoreSuffix}
      </p>
    </div>
  );
}
