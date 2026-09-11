import { oluAnswerFeedback } from '../utils/oluLearningVoice.js';

/**
 * Texte de retour pédagogique renvoyé par POST .../qcm/answer ou .../games/:id/qcm/answer.
 *
 * Le feedback écrit par le professeur **gagne toujours** : la voix d'OLU ne sert que de
 * défaut, là où la question n'en propose aucun (c'était « Bonne réponse ! » / « Ce n'est pas
 * la bonne réponse. », deux phrases de formulaire au milieu d'une interface qui, partout
 * ailleurs, a quelqu'un qui parle — cf. `docs/MASCOT_NARRATEUR_OLU.md` §7.4).
 *
 * @param {{ feedback?: string, correct?: boolean, error?: string } | null | undefined} result
 * @param {{ seed?: string }} [options] graine du tirage de variante — le code de la question,
 *   en général. Stable par construction : le texte ne doit pas changer d'un re-rendu à l'autre.
 * @returns {string}
 */
export function getQcmFeedbackText(result, options = {}) {
  if (!result || typeof result.error === 'string') return '';
  const text = String(result.feedback ?? '').trim();
  if (text) return text;
  if (typeof result.correct === 'boolean') {
    return oluAnswerFeedback(result.correct, options?.seed ?? '');
  }
  return '';
}

/**
 * @param {object | null | undefined} result
 * @returns {boolean}
 */
export function hasQcmAnswerFeedback(result, options = {}) {
  return getQcmFeedbackText(result, options).length > 0;
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
