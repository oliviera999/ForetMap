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
    answerQuestion(code, _dataset, presentationToken, choiceId, resource = null) {
      return api(`/api/quiz/questions/${encodeURIComponent(code)}/answer`, 'POST', {
        presentationToken,
        choiceId,
        ...resourceContextBody(resource),
      });
    },
  };
}

/** Contexte ressource transmis avec la réponse pour activer le verrou de re-tentative (cooldown). */
function resourceContextBody(resource) {
  if (!resource || !resource.resourceType || resource.resourceRef == null) return {};
  return {
    resourceType: String(resource.resourceType),
    resourceRef: String(resource.resourceRef),
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
    answerQuestion(code, dataset = 'qcm', presentationToken, choiceId, resource = null) {
      return apiGL(`${apiBase(dataset)}/questions/${encodeURIComponent(code)}/answer`, 'POST', {
        presentationToken,
        choiceId,
        ...resourceContextBody(resource),
      });
    },
  };
}

/** La ressource est-elle verrouillée (cooldown après erreur) ? */
export function isCooldownLocked(cooldown) {
  return !!(cooldown && cooldown.locked);
}

/**
 * Message de verrou après une erreur au QCM de validation.
 * @param {object} cooldown bloc { locked, remaining_days, ... }
 * @param {string} [itemTitle]
 */
export function buildCooldownLockMessage(cooldown, itemTitle = '') {
  const days = Math.max(1, Number(cooldown?.remaining_days) || 1);
  const label = itemTitle ? `« ${itemTitle} »` : 'cette ressource';
  const dayWord = days === 1 ? '1 jour' : `${days} jours`;
  return (
    `Une erreur a été commise sur le contrôle de compréhension. ` +
    `Tu pourras réessayer de valider ${label} dans ${dayWord}.`
  );
}

/** Questions encore à réussir pour le challenge. */
export function pendingChallengeQuestions(challenge) {
  if (!challenge?.required) return [];
  const list = Array.isArray(challenge.questions) ? challenge.questions : [];
  return list.filter((q) => !q.already_correct);
}

/**
 * Texte d'introduction avant le quiz gating (une ou plusieurs questions).
 *
 * L'annonce de ce qui suit une erreur dépend du délai de nouvelle tentative : avec un délai
 * (3 jours par défaut), la PREMIÈRE mauvaise réponse verrouille la ressource — promettre
 * « tu pourras réessayer » serait faux (audit F6, 2026-08). Sans délai (0), le réessai
 * immédiat est bien possible.
 * @param {number} pendingCount
 * @param {string} [itemTitle]
 * @param {number} [retryDays] `cooldown.retry_days` renvoyé par le challenge (0 = pas de verrou)
 */
export function buildGatingQuizIntroMessage(pendingCount, itemTitle = '', retryDays = 0) {
  const n = Math.max(0, Number(pendingCount) || 0);
  if (n <= 0) return '';
  const label = itemTitle ? `« ${itemTitle} »` : 'ce contenu';
  const questionWord = n === 1 ? 'une question' : `${n} questions`;
  const verb = n === 1 ? 'sera posée' : 'seront posées';
  const days = Math.max(0, Math.floor(Number(retryDays) || 0));
  const consequence =
    days > 0
      ? `Attention : une erreur bloquera la validation pendant ${days === 1 ? '1 jour' : `${days} jours`}. ` +
        `Tu peux abandonner à tout moment sans rien risquer.`
      : `Tu pourras réessayer en cas d'erreur et abandonner à tout moment.`;
  return (
    `Pour valider que tu as bien compris ${label}, ${questionWord} ${verb} ` +
    `avant de pouvoir confirmer. ${consequence}`
  );
}
