'use strict';

/**
 * Instantané du QCM partagé ForêtMap / Gnomes & Licornes (exploitation, lot 7) :
 * `lib/qcmChoices.js` (présentation, jeton, vérification, retour) et `lib/qcmPresentationUse.js`.
 *
 * Ces modules servent les deux produits : une modification faite pour ForêtMap ne doit pas
 * changer, sans qu'on le voie, ce que reçoit G&L. On fige donc la **forme** de la charge
 * (corps renvoyé au client) et du **jeton** (revendications signées), pour le contexte G&L par
 * défaut (`gl_qcm_present`, contexte de partie) et pour une présentation ForêtMap liée à une
 * ressource. Aucune route G&L n'est appelée : seules les fonctions partagées le sont.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const qcm = require('../lib/qcmChoices');
const presentationUse = require('../lib/qcmPresentationUse');

const QUESTION = Object.freeze({
  question_code: 'QF-SNAP-1',
  question: 'Quel animal décompose la litière ?',
  choix_a: 'Le ver de terre',
  choix_b: 'Le merle',
  choix_c: 'Le hérisson',
  choix_d: '',
  choix_e: null,
  reponse_correcte: 'A',
  feedback_correct: 'Oui : il digère la litière.',
  feedback_b: 'Le merle mange les vers.',
  photo_url: '/uploads/q.jpg',
  photo_credit: 'Crédit',
  photo_licence: 'CC BY',
  photo_legende: 'Légende',
  wikipedia_url: 'https://fr.wikipedia.org/wiki/Lombric',
});

function claimsOf(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

const BODY_KEYS = [
  'choices',
  'glossaryTerms',
  'photoCredit',
  'photoLegende',
  'photoLicence',
  'photoUrl',
  'presentationToken',
  'question',
  'questionCode',
  'resource',
  'wikipediaUrl',
];

test('exports partagés inchangés', () => {
  assert.deepEqual(Object.keys(qcm).sort(), [
    'CHOICE_LETTERS',
    'DEFAULT_FEEDBACK_CORRECT',
    'DEFAULT_FEEDBACK_INCORRECT',
    'PRESENTATION_TTL',
    'answerFingerprint',
    'buildCanonicalChoices',
    'fisherYates',
    'normalizeGameClaim',
    'normalizeResourceClaim',
    'presentQuestion',
    'presentationError',
    'readPresentationLayout',
    'resolveQcmAnswerFeedback',
    'verifyPresentationAnswer',
  ]);
  assert.deepEqual(Object.keys(presentationUse).sort(), [
    'consumeFreePresentationJti',
    'consumeGuestPresentationJti',
    'consumePresentationJti',
    'isGlGuestAuth',
  ]);
  assert.equal(qcm.PRESENTATION_TTL, '15m');
  assert.deepEqual(qcm.CHOICE_LETTERS, ['A', 'B', 'C', 'D', 'E']);
});

test('G&L (défaut gl_qcm_present, contexte de partie) : corps et jeton figés', () => {
  const p = qcm.presentQuestion(QUESTION, [{ term: 'litière' }], {
    game: { gameId: 7, teamId: 3, markerId: 12 },
  });
  assert.deepEqual(Object.keys(p).sort(), BODY_KEYS);
  assert.equal(p.questionCode, 'QF-SNAP-1');
  assert.equal(p.resource, null);
  assert.deepEqual(p.glossaryTerms, [{ term: 'litière' }]);
  // Choix vides retirés, ordre mélangé : trois choix { id, text }, ids 0..2.
  assert.deepEqual(
    p.choices.map((c) => Object.keys(c).sort()),
    [
      ['id', 'text'],
      ['id', 'text'],
      ['id', 'text'],
    ],
  );
  assert.deepEqual(
    p.choices.map((c) => c.id),
    [0, 1, 2],
  );
  assert.deepEqual(p.choices.map((c) => c.text).sort(), [
    'Le hérisson',
    'Le merle',
    'Le ver de terre',
  ]);

  const claims = claimsOf(p.presentationToken);
  assert.deepEqual(Object.keys(claims).sort(), [
    'answerHash',
    'choiceLetters',
    'exp',
    'game',
    'iat',
    'jti',
    'kind',
    'nonce',
    'questionCode',
  ]);
  assert.equal(claims.kind, 'gl_qcm_present');
  assert.deepEqual([...claims.choiceLetters].sort(), ['A', 'B', 'C']);
  assert.equal(claims.correctChoiceId, undefined, 'jamais la bonne réponse en clair');
  assert.equal(claims.exp - claims.iat, 15 * 60);

  // Vérification : bonne réponse trouvée, retour de la fiche.
  const goodId = claims.choiceLetters.indexOf('A');
  const ok = qcm.verifyPresentationAnswer(p.presentationToken, 'QF-SNAP-1', goodId);
  assert.deepEqual(Object.keys(ok).sort(), [
    'correct',
    'correctChoiceId',
    'game',
    'jti',
    'resource',
    'selectedChoiceId',
    'selectedLetter',
  ]);
  assert.equal(ok.correct, true);
  assert.equal(ok.selectedLetter, 'A');
  assert.equal(ok.jti, claims.jti);
  const badId = claims.choiceLetters.indexOf('B');
  const ko = qcm.verifyPresentationAnswer(p.presentationToken, 'QF-SNAP-1', badId);
  assert.equal(ko.correct, false);
  assert.equal(ko.correctChoiceId, null);
  assert.equal(
    qcm.resolveQcmAnswerFeedback(QUESTION, { correct: false, selectedLetter: 'B' }),
    'Le merle mange les vers.',
  );
  assert.equal(
    qcm.resolveQcmAnswerFeedback(QUESTION, { correct: false, selectedLetter: 'C' }),
    qcm.DEFAULT_FEEDBACK_INCORRECT,
  );
  assert.deepEqual(qcm.readPresentationLayout(p.presentationToken), {
    questionCode: 'QF-SNAP-1',
    choiceLetters: claims.choiceLetters,
  });
});

test('ForêtMap (ressource) : jeton d’un autre type refusé par la vérification G&L', () => {
  const p = qcm.presentQuestion(QUESTION, [], {
    jwtKind: 'fm_qcm_present',
    resource: { type: 'tutorial', ref: '42' },
  });
  assert.deepEqual(Object.keys(p).sort(), BODY_KEYS);
  const claims = claimsOf(p.presentationToken);
  assert.equal(claims.kind, 'fm_qcm_present');
  assert.equal(claims.game, undefined);
  assert.throws(
    () => qcm.verifyPresentationAnswer(p.presentationToken, 'QF-SNAP-1', 0),
    /Token de présentation invalide/,
  );
  const ok = qcm.verifyPresentationAnswer(p.presentationToken, 'QF-SNAP-1', 0, {
    jwtKind: 'fm_qcm_present',
  });
  assert.equal(typeof ok.correct, 'boolean');
});

test('invité G&L : un jeton de présentation ne se consomme qu’une fois', () => {
  const jti = `snap-${Date.now()}`;
  assert.equal(presentationUse.consumeGuestPresentationJti(jti), 'consumed');
  assert.equal(presentationUse.consumeGuestPresentationJti(jti), 'already_used');
  assert.equal(presentationUse.isGlGuestAuth({ userType: 'gl_guest' }), true);
});
