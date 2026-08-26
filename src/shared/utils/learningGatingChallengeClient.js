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

/**
 * Questions encore à poser pour satisfaire le challenge.
 *
 * On ne pose PAS toutes les questions non réussies : le serveur dit, via `pending_count`,
 * combien de bonnes réponses il attend encore selon le mode effectif — 1 en mode « any »,
 * N en mode « threshold », toutes en mode « all » (audit F1, 2026-08). Repli sur « toutes
 * les non réussies » si un serveur plus ancien n'envoie pas `pending_count`.
 */
export function pendingChallengeQuestions(challenge) {
  if (!challenge?.required) return [];
  const list = Array.isArray(challenge.questions) ? challenge.questions : [];
  const notCorrect = list.filter((q) => !q.already_correct);
  // `ask_count` = ce que le serveur accepte de poser MAINTENANT (plafond par
  // session appliqué) ; `pending_count` = ce qu'il reste au total. Un serveur
  // antérieur n'envoie pas `ask_count` : on retombe alors sur `pending_count`.
  const askCount = Number(challenge.ask_count);
  const pendingCount = Number(challenge.pending_count);
  const limit = Number.isFinite(askCount) && askCount >= 0 ? askCount : pendingCount;
  if (!Number.isFinite(limit) || limit < 0) return notCorrect;
  return notCorrect.slice(0, Math.min(limit, notCorrect.length));
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

/**
 * Règles du contrôle, énoncées AVANT que l'élève ne commence.
 *
 * L'intro précédente disait le nombre de questions et le délai encouru. Elle
 * ignorait deux choses désormais réglables et qui changent tout pour l'élève :
 * les essais ratés tolérés avant que le verrou ne tombe, et le fait que la
 * session puisse ne poser qu'une partie des questions restantes.
 *
 * @param {object} challenge réponse de /api/learning/gating/challenge
 * @returns {string[]} une ligne par règle, dans l'ordre où elles s'appliquent
 */
export function buildGatingRules(challenge) {
  if (!challenge?.required) return [];
  const rules = [];

  const ask = Math.max(0, Number(challenge.ask_count ?? challenge.pending_count) || 0);
  const pending = Math.max(ask, Number(challenge.pending_count) || ask);
  if (ask > 0) {
    rules.push(
      ask === 1 ? 'Une question va t’être posée.' : `${ask} questions vont t’être posées.`,
    );
  }
  if (pending > ask) {
    rules.push(
      `Il en restera ${pending - ask} à réussir plus tard : tes bonnes réponses sont gardées ` +
        'd’une fois sur l’autre.',
    );
  }

  const tolerance = Math.max(0, Number(challenge.allowed_wrong_attempts) || 0);
  const days = Math.max(0, Number(challenge.cooldown?.retry_days) || 0);
  if (days <= 0) {
    rules.push('En cas d’erreur, tu peux réessayer tout de suite.');
  } else if (tolerance <= 0) {
    rules.push(
      `Une seule erreur et la validation sera bloquée ${days === 1 ? '1 jour' : `${days} jours`}.`,
    );
  } else {
    const already = Math.max(0, Number(challenge.cooldown?.wrong_attempts) || 0);
    const left = Math.max(0, tolerance - already);
    rules.push(
      left === 1
        ? `Il te reste 1 erreur possible ; au-delà, la validation sera bloquée ${days === 1 ? '1 jour' : `${days} jours`}.`
        : `Tu as droit à ${left} erreurs ; au-delà, la validation sera bloquée ${days === 1 ? '1 jour' : `${days} jours`}.`,
    );
  }

  rules.push(
    'Abandonner maintenant ne coûte rien : rien n’est compté tant que tu n’as pas répondu.',
  );
  return rules;
}
