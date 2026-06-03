'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/requireTeacher');

const PRESENTATION_TTL = '15m';
const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'];

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

function presentQuestion(questionRow, glossaryTerms = []) {
  if (!questionRow?.question_code) throw new Error('question_code requis');
  const canonical = buildCanonicalChoices(questionRow);
  if (canonical.length < 2) throw new Error('Choix insuffisants pour la question');

  const correctLetter = String(questionRow.reponse_correcte || '').trim().toUpperCase();
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

  const presentationToken = jwt.sign(
    {
      kind: 'gl_qcm_present',
      questionCode: String(questionRow.question_code),
      correctChoiceId,
      choiceLetters: shuffled.map((choice) => choice.letter),
    },
    JWT_SECRET,
    { expiresIn: PRESENTATION_TTL }
  );

  return {
    presentationToken,
    questionCode: questionRow.question_code,
    question: questionRow.question,
    choices: shuffled.map((choice, id) => ({ id, text: choice.text })),
    glossaryTerms: Array.isArray(glossaryTerms) ? glossaryTerms : [],
    photoUrl: questionRow.photo_url || null,
    photoLegende: questionRow.photo_legende || null,
    wikipediaUrl: questionRow.wikipedia_url || null,
  };
}

function verifyPresentationAnswer(presentationToken, questionCode, choiceId) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET requis');
  const code = String(questionCode || '').trim();
  if (!code) throw new Error('question_code requis');

  let claims;
  try {
    claims = jwt.verify(String(presentationToken || ''), JWT_SECRET);
  } catch (_) {
    throw new Error('Token de présentation invalide ou expiré');
  }

  if (claims?.kind !== 'gl_qcm_present') throw new Error('Token de présentation invalide');
  if (String(claims.questionCode) !== code) throw new Error('Question incompatible avec le token');

  const selectedId = Number(choiceId);
  if (!Number.isInteger(selectedId) || selectedId < 0) {
    throw new Error('choiceId invalide');
  }

  const correctChoiceId = Number(claims.correctChoiceId);
  const choiceLetters = Array.isArray(claims.choiceLetters) ? claims.choiceLetters : [];
  const selectedLetterRaw = choiceLetters[selectedId];
  const selectedLetter = CHOICE_LETTERS.includes(String(selectedLetterRaw || '').toUpperCase())
    ? String(selectedLetterRaw).toUpperCase()
    : null;

  return {
    correct: selectedId === correctChoiceId,
    correctChoiceId,
    selectedChoiceId: selectedId,
    selectedLetter,
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
  DEFAULT_FEEDBACK_CORRECT,
  DEFAULT_FEEDBACK_INCORRECT,
  fisherYates,
  buildCanonicalChoices,
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
};
