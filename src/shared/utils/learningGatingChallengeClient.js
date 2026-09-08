/**
 * Helpers API pour le challenge gating à l'accusé (ForetMap et GL).
 */
import {
  clampCooldownHours,
  cooldownRemainingLabel,
  cooldownRetryHours,
  formatHoursLabel,
} from './cooldownDuration.js';

export function createFmGatingHandlers(api) {
  return {
    fetchChallenge(resourceType, resourceRef) {
      const params = new URLSearchParams({
        resourceType: String(resourceType),
        resourceRef: String(resourceRef),
      });
      return api(`/api/learning/gating/challenge?${params.toString()}`);
    },
    presentQuestion(code, _dataset = null, resource = null) {
      return api(
        `/api/quiz/questions/${encodeURIComponent(code)}/present${presentContextQuery(resource)}`,
      );
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

/**
 * Contexte ressource demandé à la PRÉSENTATION : le serveur le grave dans le jeton, et c'est ce
 * jeton — pas le corps de la réponse — qui fait valoir le verrou en sévérité normale ou stricte.
 */
function presentContextQuery(resource) {
  if (!resource || !resource.resourceType || resource.resourceRef == null) return '';
  const params = new URLSearchParams({
    resourceType: String(resource.resourceType),
    resourceRef: String(resource.resourceRef),
  });
  return `?${params.toString()}`;
}

/** Contexte ressource transmis avec la réponse (honoré seulement en sévérité souple). */
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
    presentQuestion(code, dataset = 'qcm', resource = null) {
      return apiGL(
        `${apiBase(dataset)}/questions/${encodeURIComponent(code)}/present${presentContextQuery(resource)}`,
      );
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
  // Temps restant calculé par le serveur (« 5 h », « 1 j 2 h », « 40 min ») ; repli sur
  // l'ancien champ en jours pour un serveur antérieur.
  const remaining = cooldownRemainingLabel(cooldown) || 'quelques minutes';
  const label = itemTitle ? `« ${itemTitle} »` : 'cette ressource';
  if (isQuestionScopedLock(cooldown)) {
    // Portée « question seule » : la fiche n'est bloquée que parce que plus aucune question
    // n'est posable ; le délai est celui de la question qui se libère en premier.
    return (
      `Une question ratée est encore bloquée, et il n'en reste aucune autre à passer. ` +
      `Tu pourras réessayer de valider ${label} dans ${remaining}.`
    );
  }
  return (
    `Une erreur a été commise sur le contrôle de compréhension. ` +
    `Tu pourras réessayer de valider ${label} dans ${remaining}.`
  );
}

/** Le verrou ne porte-t-il que sur une question (portée « question seule ») ? */
export function isQuestionScopedLock(cooldown) {
  return !!cooldown && String(cooldown.scope || '') === 'question';
}

/**
 * Message affiché juste après une erreur qui n'a bloqué QUE la question ratée : l'élève peut
 * continuer avec les autres questions de la fiche.
 * @param {object} cooldown bloc renvoyé par `…/answer`
 */
export function buildQuestionLockMessage(cooldown) {
  const remaining = cooldownRemainingLabel(cooldown) || 'quelques minutes';
  return (
    `Cette question est bloquée pendant ${remaining}. ` +
    `Tu peux continuer avec les autres questions de la fiche.`
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
  // Une question verrouillée (portée « question seule ») n'est pas posable maintenant.
  const notCorrect = list.filter((q) => !q.already_correct && !q.locked);
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
 * (6 h par défaut), la PREMIÈRE mauvaise réponse verrouille la ressource — promettre
 * « tu pourras réessayer » serait faux (audit F6, 2026-08). Sans délai (0), le réessai
 * immédiat est bien possible.
 * @param {number} pendingCount
 * @param {string} [itemTitle]
 * @param {number|object} [retry] délai en HEURES, ou le challenge / bloc `cooldown` renvoyé par
 *   le serveur (`retry_cooldown_hours`, `retry_hours`, ancien `retry_days`)
 */
export function buildGatingQuizIntroMessage(pendingCount, itemTitle = '', retry = 0) {
  const n = Math.max(0, Number(pendingCount) || 0);
  if (n <= 0) return '';
  const label = itemTitle ? `« ${itemTitle} »` : 'ce contenu';
  const questionWord = n === 1 ? 'une question' : `${n} questions`;
  const verb = n === 1 ? 'sera posée' : 'seront posées';
  const hours =
    retry && typeof retry === 'object' ? cooldownRetryHours(retry) : clampCooldownHours(retry, 0);
  const consequence =
    hours > 0
      ? `Attention : une erreur bloquera la validation pendant ${formatHoursLabel(hours)}. ` +
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

  const gatingTotal = Math.max(
    0,
    Number(challenge.gating_questions_count ?? challenge.questions?.length) || 0,
  );
  const mode = String(challenge.mode || 'any').toLowerCase();
  const requiredN = Math.max(1, Number(challenge.required_correct) || 1);

  if (mode === 'threshold' && gatingTotal > 0) {
    rules.push(
      `Il te faut ${Math.min(requiredN, gatingTotal)} bonne(s) réponse(s) sur ${gatingTotal} question(s) liée(s).`,
    );
  } else if (mode === 'all' && gatingTotal > 0) {
    rules.push(`Il te faut réussir toutes les questions liées (${gatingTotal}).`);
  } else if (mode === 'any' && gatingTotal > 1) {
    rules.push(`Une bonne réponse suffit (sur ${gatingTotal} questions liées).`);
  }

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
  const hours = cooldownRetryHours(challenge);
  const lockLabel = formatHoursLabel(hours);
  if (hours <= 0) {
    rules.push('En cas d’erreur, tu peux réessayer tout de suite.');
  } else if (tolerance <= 0) {
    rules.push(`Une seule erreur et la validation sera bloquée ${lockLabel}.`);
  } else {
    // Le compteur de la série en cours est renvoyé par le serveur même hors verrou (A6) :
    // un élève qui a déjà consommé une faute ne relit plus la tolérance neuve.
    const already = Math.max(0, Number(challenge.cooldown?.wrong_attempts) || 0);
    const left = Math.max(0, tolerance - already);
    if (left === 0) {
      rules.push(`Plus aucune erreur permise : la prochaine bloquera la validation ${lockLabel}.`);
    } else {
      rules.push(
        left === 1
          ? `Il te reste 1 erreur possible ; au-delà, la validation sera bloquée ${lockLabel}.`
          : `Tu as droit à ${left} erreurs ; au-delà, la validation sera bloquée ${lockLabel}.`,
      );
    }
  }
  if (String(challenge.cooldown_scope || '').toLowerCase() === 'question' && hours > 0) {
    rules.push(
      'Une erreur ne bloque que la question ratée : tu peux continuer avec les autres questions.',
    );
  }
  const lockedNow = Array.isArray(challenge.cooldown?.locked_questions)
    ? challenge.cooldown.locked_questions.length
    : 0;
  if (lockedNow > 0 && !challenge.cooldown?.locked) {
    rules.push(
      lockedNow === 1
        ? 'Une question ratée est encore bloquée ; elle te sera reposée plus tard.'
        : `${lockedNow} questions ratées sont encore bloquées ; elles te seront reposées plus tard.`,
    );
  }
  const lockMode = String(challenge.lock_mode || '').toLowerCase();
  if (lockMode === 'strict') {
    rules.push(
      'Ces questions ne se jouent qu’ici : elles ne sont pas proposées dans le Quiz libre.',
    );
  }

  rules.push(
    'Abandonner maintenant ne coûte rien : rien n’est compté tant que tu n’as pas répondu.',
  );
  return rules;
}
