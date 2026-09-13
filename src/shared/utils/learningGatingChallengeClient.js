/**
 * Helpers API pour le challenge gating à l'accusé (ForetMap et GL).
 */
import {
  clampCooldownHours,
  cooldownRemainingLabel,
  cooldownRetryHours,
  formatHoursLabel,
} from './cooldownDuration.js';
import {
  oluControlPassedSentence,
  oluGatingIntroSentence,
  oluSeriesDoneOpener,
  oluSeriesProgressSentence,
} from './oluLearningVoice.js';

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
    const locked = Math.max(
      1,
      Array.isArray(cooldown?.locked_questions) ? cooldown.locked_questions.length : 1,
    );
    const ratees =
      locked === 1
        ? 'Une question ratée est encore bloquée'
        : `${locked} questions ratées sont encore bloquées`;
    return (
      `${ratees}, et il n'en reste aucune autre à passer. ` +
      `Tu pourras réessayer de valider ${label} dans ${remaining}.`
    );
  }
  // Avec une tolérance, il a fallu PLUSIEURS erreurs : annoncer « une erreur » laissait
  // croire que la tolérance réglée par le professeur n'avait pas joué.
  const wrong = Math.max(0, Number(cooldown?.wrong_attempts) || 0);
  const commises =
    wrong > 1
      ? `${wrong} erreurs ont été commises sur le contrôle de compréhension.`
      : 'Une erreur a été commise sur le contrôle de compréhension.';
  return `${commises} Tu pourras réessayer de valider ${label} dans ${remaining}.`;
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
export function buildQuestionLockMessage(cooldown, { hasOtherQuestions = true } = {}) {
  const remaining = cooldownRemainingLabel(cooldown) || 'quelques minutes';
  // Promettre « continue avec les autres » alors que la série n'en comptait qu'une était
  // faux : l'écran enchaînait aussitôt sur le verrou de la fiche entière.
  const suite = hasOtherQuestions
    ? 'Tu peux continuer avec les autres questions de la fiche.'
    : 'Voyons s’il reste une autre question à passer pour cette fiche.';
  return `Cette question est bloquée pendant ${remaining}. ${suite}`;
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
 * @param {string} [seed] graine du tirage de variante (référence de la ressource)
 */
export function buildGatingQuizIntroMessage(pendingCount, itemTitle = '', retry = 0, seed = '') {
  const n = Math.max(0, Number(pendingCount) || 0);
  if (n <= 0) return '';
  const label = itemTitle ? `« ${itemTitle} »` : 'ce contenu';
  const questionWord = n === 1 ? 'une question' : `${n} questions`;
  const verb = n === 1 ? 'sera posée' : 'seront posées';
  const source = retry && typeof retry === 'object' ? retry : null;
  const hours = source ? cooldownRetryHours(source) : clampCooldownHours(retry, 0);
  const { left } = readToleranceState(source);
  // Ce que coûte VRAIMENT la prochaine erreur : « une erreur bloque tout » était faux dès
  // qu'une tolérance était réglée, et faux aussi en portée « question seule », où seule la
  // question ratée se ferme.
  const target = isQuestionScopedPolicy(source) ? 'cette question' : 'la validation';
  let consequence;
  if (hours <= 0) {
    consequence = "Tu pourras réessayer tout de suite en cas d'erreur.";
  } else if (left > 0) {
    consequence =
      left === 1
        ? `Attention : il te reste 1 erreur possible ; la suivante bloquera ${target} pendant ${formatHoursLabel(hours)}.`
        : `Attention : il te reste ${left} erreurs possibles ; au-delà, ${target} sera bloquée pendant ${formatHoursLabel(hours)}.`;
  } else {
    consequence = `Attention : une erreur bloquera ${target} pendant ${formatHoursLabel(hours)}.`;
  }
  // L'annonce est d'OLU ; la conséquence ne l'est pas. Un avertissement se dit à plat
  // (charte §2.2bis-4) — c'est précisément parce qu'il ne plaisante jamais là-dessus qu'on
  // le croit quand il le dit.
  const announce = oluGatingIntroSentence(label, `${questionWord} ${verb}`, seed);
  return (
    `${announce} ${consequence} ` +
    `Tant que tu n'as pas répondu, tu peux abandonner sans rien risquer.`
  );
}

/** Portée du verrou annoncée par le challenge (ou par un bloc `cooldown`) : question seule ? */
function isQuestionScopedPolicy(source) {
  if (!source) return false;
  const scope = String(source.cooldown_scope || source.scope || '').toLowerCase();
  return scope === 'question';
}

/**
 * Tolérance d'erreurs telle qu'elle se présente MAINTENANT.
 *
 * Trois nombres qui doivent rester d'accord entre l'intro, les règles et le retour d'une
 * mauvaise réponse : la tolérance réglée, ce qui a déjà été consommé sur la série en cours,
 * et ce qu'il reste. Trois lectures séparées les faisaient diverger.
 *
 * @param {object|null} source challenge (`allowed_wrong_attempts` + `cooldown.wrong_attempts`)
 *   ou bloc `cooldown` d'une réponse (`allowed_wrong_attempts`, `wrong_attempts`, `attempts_left`)
 */
export function readToleranceState(source) {
  if (!source) return { tolerance: 0, used: 0, left: 0 };
  const tolerance = Math.max(0, Number(source.allowed_wrong_attempts) || 0);
  const used = Math.max(0, Number(source.wrong_attempts ?? source.cooldown?.wrong_attempts) || 0);
  const declared = Number(source.attempts_left);
  const left = Number.isFinite(declared) ? Math.max(0, declared) : Math.max(0, tolerance - used);
  return { tolerance, used, left };
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

  const hours = cooldownRetryHours(challenge);
  const lockLabel = formatHoursLabel(hours);
  const questionScoped = isQuestionScopedPolicy(challenge) && hours > 0;
  // En portée « question seule », c'est la QUESTION qui se ferme, pas la validation :
  // annoncer « la validation sera bloquée » contredisait la règle suivante.
  const target = questionScoped ? 'la question ratée' : 'la validation';
  const { tolerance, left } = readToleranceState(challenge);
  if (hours <= 0) {
    rules.push('En cas d’erreur, tu peux réessayer tout de suite.');
  } else if (tolerance <= 0) {
    rules.push(`Une seule erreur et ${target} sera bloquée ${lockLabel}.`);
  } else if (left === 0) {
    // Le compteur de la série en cours est renvoyé par le serveur même hors verrou (A6) :
    // un élève qui a déjà consommé ses fautes ne relit plus la tolérance neuve.
    rules.push(`Plus aucune erreur permise : la prochaine bloquera ${target} ${lockLabel}.`);
  } else {
    rules.push(
      left === 1
        ? `Il te reste 1 erreur possible ; au-delà, ${target} sera bloquée ${lockLabel}.`
        : `Tu as droit à ${left} erreurs ; au-delà, ${target} sera bloquée ${lockLabel}.`,
    );
  }
  if (questionScoped) {
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

/**
 * Retour d'une BONNE réponse : féliciter, et dire où l'on en est.
 *
 * Le panneau n'affichait que le feedback pédagogique de la question (« Bonne réponse ! »)
 * et un bouton « Continuer » : l'élève ne savait ni combien de questions restaient, ni si
 * la validation venait de s'ouvrir.
 *
 * @param {object} params
 * @param {number} params.questionIndex index (0-based) de la question qui vient d'être réussie
 * @param {number} params.questionTotal nombre de questions posées dans cette série
 * @param {number} [params.pendingTotal] bonnes réponses encore attendues AVANT cette série
 * @param {string} [params.itemTitle]
 * @param {string} [params.seed] graine du tirage de variante (code de la question)
 */
export function buildCorrectAnswerNotice({
  questionIndex = 0,
  questionTotal = 1,
  pendingTotal = 0,
  itemTitle = '',
  seed = '',
} = {}) {
  const label = itemTitle ? `« ${itemTitle} »` : 'ce contenu';
  const asked = Math.max(1, Number(questionTotal) || 1);
  const done = Math.min(asked, Math.max(1, (Number(questionIndex) || 0) + 1));
  const leftInSession = asked - done;
  // Cette ligne ne félicite plus : le retour de la question, juste au-dessus, l'a déjà fait
  // (« Bravo, bonne réponse ! » sous « Bonne réponse ! », c'était deux fois la même chose).
  // Elle situe — et la voix d'OLU ne porte que la mise en phrase, jamais les nombres.
  if (leftInSession > 0) {
    return oluSeriesProgressSentence({
      done,
      asked,
      left: leftInSession,
      label,
      seed,
    });
  }
  const remaining = Math.max(0, Math.max(asked, Number(pendingTotal) || 0) - done);
  if (remaining > 0) {
    // Graine décalée : l'écran « Série terminée » qui suit tire dans le même pool, et deux
    // fois la même ouverture à une seconde d'intervalle se remarquerait tout de suite.
    return (
      `${oluSeriesDoneOpener(`${seed}#reste`)} Il restera ${remaining} question${remaining > 1 ? 's' : ''} ` +
      `à réussir pour valider ${label}.`
    );
  }
  return oluControlPassedSentence(label, seed);
}

/**
 * Retour d'une MAUVAISE réponse qui n'a PAS posé de verrou : combien d'erreurs restent.
 *
 * Sans cette phrase, l'écran affichait « Ce n'est pas la bonne réponse. » et un bouton
 * « Réessayer » : rien ne disait que l'essai suivant était le dernier.
 *
 * @param {object|null} cooldown bloc renvoyé par `…/answer` (absent = aucun verrou possible)
 */
export function buildWrongAnswerNotice(cooldown) {
  if (!cooldown || cooldown.locked) return '';
  const hours = cooldownRetryHours(cooldown);
  if (hours <= 0) return '';
  const { tolerance, left } = readToleranceState(cooldown);
  if (tolerance <= 0) return '';
  const target = isQuestionScopedLock(cooldown) ? 'cette question' : 'la validation';
  if (left <= 0) {
    return `Attention : la prochaine erreur bloquera ${target} pendant ${formatHoursLabel(hours)}.`;
  }
  return left === 1
    ? `Il te reste 1 erreur possible : la suivante bloquera ${target} pendant ${formatHoursLabel(hours)}.`
    : `Il te reste ${left} erreurs possibles : au-delà, ${target} sera bloquée pendant ${formatHoursLabel(hours)}.`;
}

/**
 * Série de questions terminée, mais le contrôle n'est pas encore satisfait (plafond
 * « questions posées d'affilée »). Sans ce message, l'écran envoyait l'élève sur la
 * confirmation, que le serveur refusait ensuite par un 403.
 *
 * @param {number} remaining bonnes réponses encore attendues
 * @param {string} [itemTitle]
 * @param {string} [seed] graine du tirage de variante (référence de la ressource)
 */
export function buildSessionPausedMessage(remaining, itemTitle = '', seed = '') {
  const n = Math.max(1, Number(remaining) || 1);
  const label = itemTitle ? `« ${itemTitle} »` : 'ce contenu';
  return (
    `${oluSeriesDoneOpener(seed)} Il reste ` +
    `${n} question${n > 1 ? 's' : ''} à réussir pour valider ${label} — tes bonnes réponses ` +
    `sont gardées, tu peux enchaîner ou revenir plus tard.`
  );
}
