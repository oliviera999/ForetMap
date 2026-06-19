const DEFAULT_FEEDBACK_CORRECT = 'Bonne réponse !';
const DEFAULT_FEEDBACK_INCORRECT = 'Ce n’est pas la bonne réponse.';

/**
 * Texte de retour pédagogique renvoyé par POST .../qcm/answer ou .../games/:id/qcm/answer.
 * @param {{ feedback?: string, correct?: boolean, error?: string } | null | undefined} result
 * @returns {string}
 */
export function getQcmFeedbackText(result) {
  if (!result || typeof result.error === 'string') return '';
  const text = String(result.feedback ?? '').trim();
  if (text) return text;
  if (typeof result.correct === 'boolean') {
    return result.correct ? DEFAULT_FEEDBACK_CORRECT : DEFAULT_FEEDBACK_INCORRECT;
  }
  return '';
}

/**
 * @param {object | null | undefined} result
 * @returns {boolean}
 */
export function hasQcmAnswerFeedback(result) {
  return getQcmFeedbackText(result).length > 0;
}

/**
 * Phase « réponse validée » : feedback texte ou au minimum le booléen `correct`.
 * @param {object | null | undefined} result
 * @returns {boolean}
 */
export function shouldShowQcmAnswerPhase(result) {
  if (!result || typeof result.error === 'string') return false;
  if (typeof result.correct === 'boolean') return true;
  return hasQcmAnswerFeedback(result);
}
