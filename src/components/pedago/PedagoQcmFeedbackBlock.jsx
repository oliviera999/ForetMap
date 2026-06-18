import React from 'react';

const DEFAULT_OK = 'Bonne réponse !';
const DEFAULT_KO = 'Ce n’est pas la bonne réponse.';

function getFeedbackText(result) {
  if (!result || typeof result.error === 'string') return '';
  const text = String(result.feedback ?? '').trim();
  if (text) return text;
  if (typeof result.correct === 'boolean') {
    return result.correct ? DEFAULT_OK : DEFAULT_KO;
  }
  return '';
}

/** Retour pédagogique après validation d'une réponse QCM (style ForetMap, sans dépendance GL). */
export function PedagoQcmFeedbackBlock({ result, className = '' }) {
  const text = getFeedbackText(result);
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

export function shouldShowPedagoQcmAnswerPhase(result) {
  if (!result || typeof result.error === 'string') return false;
  return typeof result.correct === 'boolean' || getFeedbackText(result).length > 0;
}
