'use strict';

/**
 * `lib/quizQuestionFingerprint.js` (fonction pure) : l'empreinte de version change avec
 * l'énoncé, un choix ou la bonne réponse, pas avec un feedback ; le HMAC du jeton ne concorde
 * qu'avec la même question et la même présentation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeQuestionFingerprint,
  isQuestionFingerprint,
  fingerprintClaim,
  resolvePresentedFingerprint,
} = require('../lib/quizQuestionFingerprint');

const BASE = Object.freeze({
  question: 'D’où une plante tire-t-elle l’essentiel de sa matière ?',
  choix_a: 'Du sol',
  choix_b: 'De l’air (CO₂)',
  choix_c: 'De l’eau',
  choix_d: 'Des engrais',
  choix_e: null,
  reponse_correcte: 'B',
  feedback_correct: 'Oui : la photosynthèse.',
  feedback_a: 'Le sol apporte surtout de l’eau et des sels minéraux.',
});

test('12 caractères hexadécimaux, stable', () => {
  const fp = computeQuestionFingerprint(BASE);
  assert.ok(isQuestionFingerprint(fp));
  assert.equal(fp.length, 12);
  assert.equal(computeQuestionFingerprint({ ...BASE }), fp);
});

test('change quand un choix, l’énoncé ou la bonne réponse change', () => {
  const fp = computeQuestionFingerprint(BASE);
  assert.notEqual(computeQuestionFingerprint({ ...BASE, choix_c: 'De la pluie' }), fp);
  assert.notEqual(computeQuestionFingerprint({ ...BASE, question: 'Autre énoncé ?' }), fp);
  assert.notEqual(computeQuestionFingerprint({ ...BASE, reponse_correcte: 'A' }), fp);
  assert.notEqual(computeQuestionFingerprint({ ...BASE, choix_e: 'Du soleil' }), fp);
});

test('ne change pas pour un feedback, des espaces autour ou la casse de la lettre', () => {
  const fp = computeQuestionFingerprint(BASE);
  assert.equal(computeQuestionFingerprint({ ...BASE, feedback_a: 'Autre retour.' }), fp);
  assert.equal(computeQuestionFingerprint({ ...BASE, feedback_correct: null }), fp);
  assert.equal(computeQuestionFingerprint({ ...BASE, choix_a: '  Du sol  ' }), fp);
  assert.equal(computeQuestionFingerprint({ ...BASE, reponse_correcte: 'b' }), fp);
  assert.equal(computeQuestionFingerprint({ ...BASE, choix_e: '' }), fp);
});

test('deux choix permutés donnent une autre version', () => {
  const swapped = { ...BASE, choix_a: BASE.choix_c, choix_c: BASE.choix_a };
  assert.notEqual(computeQuestionFingerprint(swapped), computeQuestionFingerprint(BASE));
});

test('isQuestionFingerprint refuse les formes invalides', () => {
  for (const bad of [null, '', 'ABCDEF012345', '0123456789a', '0123456789abc', 12]) {
    assert.equal(isQuestionFingerprint(bad), false, String(bad));
  }
});

test('le HMAC du jeton ne contient pas l’empreinte et dépend du secret et du jti', () => {
  const fp = computeQuestionFingerprint(BASE);
  const claim = fingerprintClaim({ secret: 's1', jti: 'j1', fingerprint: fp });
  assert.match(claim, /^[0-9a-f]{24}$/);
  assert.ok(!claim.includes(fp));
  assert.notEqual(fingerprintClaim({ secret: 's2', jti: 'j1', fingerprint: fp }), claim);
  assert.notEqual(fingerprintClaim({ secret: 's1', jti: 'j2', fingerprint: fp }), claim);
});

test('resolvePresentedFingerprint : concordance, question modifiée, revendication absente', () => {
  const fp = computeQuestionFingerprint(BASE);
  const claim = fingerprintClaim({ secret: 's', jti: 'j', fingerprint: fp });
  assert.equal(
    resolvePresentedFingerprint({ secret: 's', jti: 'j', claim, questionRow: BASE }),
    fp,
  );
  // Feedback modifié entre-temps : même version.
  assert.equal(
    resolvePresentedFingerprint({
      secret: 's',
      jti: 'j',
      claim,
      questionRow: { ...BASE, feedback_a: 'x' },
    }),
    fp,
  );
  // Choix modifié entre-temps : version inconnue.
  assert.equal(
    resolvePresentedFingerprint({
      secret: 's',
      jti: 'j',
      claim,
      questionRow: { ...BASE, choix_a: 'Du terreau' },
    }),
    null,
  );
  assert.equal(
    resolvePresentedFingerprint({ secret: 's', jti: 'autre', claim, questionRow: BASE }),
    null,
  );
  assert.equal(
    resolvePresentedFingerprint({ secret: 's', jti: 'j', claim: undefined, questionRow: BASE }),
    null,
  );
  assert.equal(
    resolvePresentedFingerprint({ secret: 's', jti: 'j', claim: 'court', questionRow: BASE }),
    null,
  );
});
