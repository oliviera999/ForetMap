'use strict';

const crypto = require('crypto');
const { signJwtToken, verifyJwtToken } = require('./auth/jwtPipeline');
const { JWT_SECRET } = require('../middleware/requireTeacher');

const PRESENTATION_TTL = '15m';
const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Le jeton de présentation est **signé, pas chiffré** : son contenu est lisible par
 * quiconque le reçoit (un `atob()` dans la console du navigateur suffit). Il ne peut donc
 * pas porter `correctChoiceId` — l'élève lirait la bonne réponse avant de répondre.
 *
 * Ce qu'il porte à la place : un `nonce` tiré au hasard et l'**empreinte HMAC-SHA256** de
 * la bonne réponse, calculée avec `JWT_SECRET`. À la réponse, le serveur recalcule
 * l'empreinte pour le choix soumis : elle ne coïncide que si c'est le bon. Sans le secret,
 * l'empreinte n'est ni inversible ni reproductible ; le `nonce` empêche en plus de
 * rapprocher deux présentations de la même question.
 */
function answerFingerprint({ jwtKind, questionCode, nonce, choiceId }) {
  return crypto
    .createHmac('sha256', String(JWT_SECRET))
    .update(`${jwtKind}|${questionCode}|${nonce}|${Number(choiceId)}`)
    .digest('hex');
}

/** Comparaison à temps constant de deux empreintes hexadécimales de même longueur. */
function fingerprintsMatch(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function fisherYates(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildCanonicalChoices(questionRow) {
  return CHOICE_LETTERS.map((letter) => ({
    letter,
    text: String(questionRow[`choix_${letter.toLowerCase()}`] || '').trim(),
  })).filter((choice) => choice.text.length > 0);
}

function presentQuestion(questionRow, glossaryTerms = [], options = {}) {
  const jwtKind = String(options?.jwtKind || 'gl_qcm_present').trim() || 'gl_qcm_present';
  if (!questionRow?.question_code) throw new Error('question_code requis');
  const canonical = buildCanonicalChoices(questionRow);
  if (canonical.length < 2) throw new Error('Choix insuffisants pour la question');

  const correctLetter = String(questionRow.reponse_correcte || '')
    .trim()
    .toUpperCase();
  if (!CHOICE_LETTERS.includes(correctLetter)) {
    throw new Error('reponse_correcte invalide');
  }
  if (!canonical.some((choice) => choice.letter === correctLetter)) {
    throw new Error('Réponse correcte absente des choix');
  }

  const shuffled = fisherYates(canonical);
  const correctChoiceId = shuffled.findIndex((choice) => choice.letter === correctLetter);
  if (correctChoiceId < 0) throw new Error('Impossible de localiser la bonne réponse');

  if (!JWT_SECRET) throw new Error('JWT_SECRET requis pour présenter un QCM');

  const questionCode = String(questionRow.question_code);
  const nonce = crypto.randomBytes(12).toString('hex');
  const presentationToken = signJwtToken(
    {
      kind: jwtKind,
      questionCode,
      nonce,
      // Identifiant de cette présentation : consommé à la première réponse en partie,
      // ce qui interdit de rejouer le même jeton pour marquer plusieurs fois
      // (cf. lib/qcmPresentationUse.js).
      jti: crypto.randomUUID(),
      // Jamais `correctChoiceId` en clair : cf. `answerFingerprint`.
      answerHash: answerFingerprint({ jwtKind, questionCode, nonce, choiceId: correctChoiceId }),
      // Les lettres restent nécessaires côté serveur pour retrouver le feedback du choix
      // sélectionné ; elles ne disent pas laquelle est la bonne.
      choiceLetters: shuffled.map((choice) => choice.letter),
    },
    JWT_SECRET,
    { expiresIn: PRESENTATION_TTL },
  );

  return {
    presentationToken,
    questionCode: questionRow.question_code,
    question: questionRow.question,
    choices: shuffled.map((choice, id) => ({ id, text: choice.text })),
    glossaryTerms: Array.isArray(glossaryTerms) ? glossaryTerms : [],
    photoUrl: questionRow.photo_url || null,
    photoCredit: questionRow.photo_credit || null,
    photoLicence: questionRow.photo_licence || null,
    photoLegende: questionRow.photo_legende || null,
    wikipediaUrl: questionRow.wikipedia_url || null,
  };
}

function verifyPresentationAnswer(presentationToken, questionCode, choiceId, options = {}) {
  const jwtKind = String(options?.jwtKind || 'gl_qcm_present').trim() || 'gl_qcm_present';
  if (!JWT_SECRET) throw new Error('JWT_SECRET requis');
  const code = String(questionCode || '').trim();
  if (!code) throw new Error('question_code requis');

  let claims;
  try {
    claims = verifyJwtToken(String(presentationToken || ''), JWT_SECRET);
  } catch (_) {
    throw new Error('Token de présentation invalide ou expiré');
  }

  if (claims?.kind !== jwtKind) throw new Error('Token de présentation invalide');
  if (String(claims.questionCode) !== code) throw new Error('Question incompatible avec le token');
  const jti = String(claims.jti || '').trim();
  if (!jti) throw new Error('Token de présentation invalide (jti manquant)');
  if (!claims.answerHash || !claims.nonce) {
    // Jeton émis par une version antérieure (bonne réponse en clair) : refusé plutôt
    // qu'accepté par compatibilité. La question doit être rechargée.
    throw new Error('Token de présentation invalide');
  }

  const selectedId = Number(choiceId);
  if (!Number.isInteger(selectedId) || selectedId < 0) {
    throw new Error('choiceId invalide');
  }

  const correct = fingerprintsMatch(
    claims.answerHash,
    answerFingerprint({ jwtKind, questionCode: code, nonce: claims.nonce, choiceId: selectedId }),
  );
  const choiceLetters = Array.isArray(claims.choiceLetters) ? claims.choiceLetters : [];
  const selectedLetterRaw = choiceLetters[selectedId];
  const selectedLetter = CHOICE_LETTERS.includes(String(selectedLetterRaw || '').toUpperCase())
    ? String(selectedLetterRaw).toUpperCase()
    : null;

  return {
    correct,
    // La bonne réponse n'est connue du serveur que lorsqu'elle vient d'être trouvée :
    // sur une erreur, il n'y a rien à révéler (et les routes ne l'exposaient déjà pas).
    correctChoiceId: correct ? selectedId : null,
    selectedChoiceId: selectedId,
    selectedLetter,
    jti,
  };
}

const DEFAULT_FEEDBACK_CORRECT = 'Bonne réponse !';
const DEFAULT_FEEDBACK_INCORRECT = 'Ce n’est pas la bonne réponse.';

function resolveQcmAnswerFeedback(questionRow, { correct, selectedLetter }) {
  if (!questionRow) {
    return correct ? DEFAULT_FEEDBACK_CORRECT : DEFAULT_FEEDBACK_INCORRECT;
  }
  if (correct) {
    const text = String(questionRow.feedback_correct || '').trim();
    return text || DEFAULT_FEEDBACK_CORRECT;
  }
  if (selectedLetter) {
    const key = `feedback_${selectedLetter.toLowerCase()}`;
    const text = String(questionRow[key] || '').trim();
    if (text) return text;
  }
  return DEFAULT_FEEDBACK_INCORRECT;
}

module.exports = {
  PRESENTATION_TTL,
  CHOICE_LETTERS,
  answerFingerprint,
  DEFAULT_FEEDBACK_CORRECT,
  DEFAULT_FEEDBACK_INCORRECT,
  fisherYates,
  buildCanonicalChoices,
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
};
