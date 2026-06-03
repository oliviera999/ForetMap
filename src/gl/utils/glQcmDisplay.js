/**
 * Texte de retour pédagogique renvoyé par POST .../qcm/answer ou .../games/:id/qcm/answer.
 * @param {{ feedback?: string, correct?: boolean, error?: string } | null | undefined} result
 * @returns {string}
 */
export function getQcmFeedbackText(result) {
  if (!result || typeof result.error === 'string') return '';
  return String(result.feedback ?? '').trim();
}

/**
 * @param {object | null | undefined} result
 * @returns {boolean}
 */
export function hasQcmAnswerFeedback(result) {
  return getQcmFeedbackText(result).length > 0;
}
