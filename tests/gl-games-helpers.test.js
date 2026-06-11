'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  QCM_ANSWER_STAFF_PERMISSIONS,
  parseId,
  parsePct,
  staffCanAnswerQcmForTeam,
  resolveRosterError,
} = require('../lib/gl/glGamesHelpers');

test('parseId : Number(value) si fini, sinon null (comportement verbatim)', () => {
  assert.equal(parseId('42'), 42);
  assert.equal(parseId(7), 7);
  assert.equal(parseId('abc'), null); // Number('abc') = NaN
  assert.equal(parseId(undefined), null); // Number(undefined) = NaN
  // Number('') et Number(null) valent 0 (fini) → 0, pas null.
  assert.equal(parseId(''), 0);
  assert.equal(parseId(null), 0);
});

test('parsePct : 0..100 arrondi 2 décimales, sinon null', () => {
  assert.equal(parsePct('50'), 50);
  assert.equal(parsePct(33.333), 33.33);
  assert.equal(parsePct(0), 0);
  assert.equal(parsePct(100), 100);
  assert.equal(parsePct(-1), null);
  assert.equal(parsePct(101), null);
  assert.equal(parsePct('x'), null);
});

test('staffCanAnswerQcmForTeam : joueur/null → false ; staff selon hasGlPermission injecté', () => {
  const grant = (keys) => (_auth, key) => keys.includes(key);
  assert.equal(staffCanAnswerQcmForTeam(null, grant([])), false);
  assert.equal(staffCanAnswerQcmForTeam({ userType: 'gl_player' }, grant(QCM_ANSWER_STAFF_PERMISSIONS)), false);
  assert.equal(staffCanAnswerQcmForTeam({ userType: 'gl_staff' }, grant(['gl.game.manage'])), true);
  assert.equal(staffCanAnswerQcmForTeam({ userType: 'gl_staff' }, grant(['gl.read'])), false);
});

test('resolveRosterError : mapping 404/409 ou null', () => {
  assert.deepEqual(resolveRosterError({ status: 404, message: 'TEAM_NOT_FOUND' }), { status: 404, error: 'Équipe introuvable' });
  assert.deepEqual(resolveRosterError({ status: 404, message: 'PLAYER_NOT_FOUND' }), { status: 404, error: 'Joueur introuvable' });
  assert.deepEqual(resolveRosterError({ status: 404, message: 'GAME_NOT_FOUND' }), { status: 404, error: 'Partie introuvable' });
  assert.deepEqual(resolveRosterError({ status: 404, message: 'OTHER' }), { status: 404, error: 'Ressource introuvable' });
  assert.equal(resolveRosterError({ status: 409 }).status, 409);
  assert.equal(resolveRosterError({ message: 'PLAYER_CLASS_MISMATCH' }).status, 409);
  assert.equal(resolveRosterError({ status: 500 }), null);
  assert.equal(resolveRosterError(null), null);
});
