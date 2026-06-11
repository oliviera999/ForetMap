'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseTaskDangerLevelFromClient,
  parseTaskDifficultyLevelFromClient,
  parseTaskImportanceLevelFromClient,
  taskDangerLevelForResponse,
  taskDifficultyLevelForResponse,
  taskImportanceLevelForResponse,
} = require('../lib/tasks/taskFieldLevels');

test('parseTask*LevelFromClient : absent/null/vide → { level: null }', () => {
  for (const fn of [parseTaskDangerLevelFromClient, parseTaskDifficultyLevelFromClient, parseTaskImportanceLevelFromClient]) {
    assert.deepEqual(fn(undefined), { level: null });
    assert.deepEqual(fn(null), { level: null });
    assert.deepEqual(fn(''), { level: null });
    assert.deepEqual(fn('   '), { level: null });
  }
});

test('parseTaskDangerLevelFromClient : valeurs valides + casse/espaces, sinon { error }', () => {
  assert.deepEqual(parseTaskDangerLevelFromClient('safe'), { level: 'safe' });
  assert.deepEqual(parseTaskDangerLevelFromClient('  Dangerous '), { level: 'dangerous' });
  assert.deepEqual(parseTaskDangerLevelFromClient('very_dangerous'), { level: 'very_dangerous' });
  assert.deepEqual(parseTaskDangerLevelFromClient('nope'), { error: 'Niveau de danger invalide' });
});

test('parseTaskDifficultyLevelFromClient : valide / invalide', () => {
  assert.deepEqual(parseTaskDifficultyLevelFromClient('EASY'), { level: 'easy' });
  assert.deepEqual(parseTaskDifficultyLevelFromClient('very_hard'), { level: 'very_hard' });
  assert.deepEqual(parseTaskDifficultyLevelFromClient('xxx'), { error: 'Niveau de difficulté invalide' });
});

test('parseTaskImportanceLevelFromClient : valide / invalide', () => {
  assert.deepEqual(parseTaskImportanceLevelFromClient('absolute'), { level: 'absolute' });
  assert.deepEqual(parseTaskImportanceLevelFromClient('not_important'), { level: 'not_important' });
  assert.deepEqual(parseTaskImportanceLevelFromClient('huge'), { error: "Degré d'importance invalide" });
});

test('task*LevelForResponse : valeur BDD → clé API ou null (jamais de défaut)', () => {
  assert.equal(taskDangerLevelForResponse(null), null);
  assert.equal(taskDangerLevelForResponse(''), null);
  assert.equal(taskDangerLevelForResponse('SAFE'), 'safe');
  assert.equal(taskDangerLevelForResponse('bogus'), null);
  assert.equal(taskDifficultyLevelForResponse('hard'), 'hard');
  assert.equal(taskDifficultyLevelForResponse('bogus'), null);
  assert.equal(taskImportanceLevelForResponse('low'), 'low');
  assert.equal(taskImportanceLevelForResponse(undefined), null);
});
