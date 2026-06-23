/**
 * Helpers API pour le challenge gating à l'accusé (ForetMap et GL).
 */

export function createFmGatingHandlers(api) {
  return {
    fetchChallenge(resourceType, resourceRef) {
      const params = new URLSearchParams({
        resourceType: String(resourceType),
        resourceRef: String(resourceRef),
      });
      return api(`/api/learning/gating/challenge?${params.toString()}`);
    },
    presentQuestion(code) {
      return api(`/api/quiz/questions/${encodeURIComponent(code)}/present`);
    },
    answerQuestion(code, _dataset, presentationToken, choiceId) {
      return api(`/api/quiz/questions/${encodeURIComponent(code)}/answer`, 'POST', {
        presentationToken,
        choiceId,
      });
    },
  };
}

export function createGlGatingHandlers(apiGL) {
  function apiBase(dataset) {
    return dataset === 'qcm_lore' ? '/api/gl/lore/qcm' : '/api/gl/qcm';
  }
  return {
    fetchChallenge(resourceType, resourceRef) {
      const params = new URLSearchParams({
        resourceType: String(resourceType),
        resourceRef: String(resourceRef),
      });
      return apiGL(`/api/gl/learning/gating/challenge?${params.toString()}`);
    },
    presentQuestion(code, dataset = 'qcm') {
      return apiGL(`${apiBase(dataset)}/questions/${encodeURIComponent(code)}/present`);
    },
    answerQuestion(code, dataset = 'qcm', presentationToken, choiceId) {
      return apiGL(`${apiBase(dataset)}/questions/${encodeURIComponent(code)}/answer`, 'POST', {
        presentationToken,
        choiceId,
      });
    },
  };
}

/** Questions encore à réussir pour le challenge. */
export function pendingChallengeQuestions(challenge) {
  if (!challenge?.required) return [];
  const list = Array.isArray(challenge.questions) ? challenge.questions : [];
  return list.filter((q) => !q.already_correct);
}

/**
 * Texte d'introduction avant le quiz gating (une ou plusieurs questions).
 * @param {number} pendingCount
 * @param {string} [itemTitle]
 */
export function buildGatingQuizIntroMessage(pendingCount, itemTitle = '') {
  const n = Math.max(0, Number(pendingCount) || 0);
  if (n <= 0) return '';
  const label = itemTitle ? `« ${itemTitle} »` : 'ce contenu';
  const questionWord = n === 1 ? 'une question' : `${n} questions`;
  const verb = n === 1 ? 'sera posée' : 'seront posées';
  return (
    `Pour valider que tu as bien compris ${label}, ${questionWord} ${verb} ` +
    `avant de pouvoir confirmer. Tu pourras réessayer en cas d'erreur et abandonner à tout moment.`
  );
}
