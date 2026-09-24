'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

let describeAppPreview;

before(async () => {
  const mod = await import(pathToFileURL(join(__dirname, '../src/utils/appPreview.js')).href);
  describeAppPreview = mod.describeAppPreview;
});

test('describeAppPreview : aucun aperçu par défaut', () => {
  const d = describeAppPreview();
  assert.equal(d.active, false);
  assert.equal(d.summary, '');
});

test('describeAppPreview : vue de rôle seule', () => {
  const d = describeAppPreview({ roleViewMode: 'student' });
  assert.equal(d.active, true);
  assert.equal(d.roleActive, true);
  assert.equal(d.levelActive, false);
  assert.equal(d.summary, 'Vue n3beur');
  assert.equal(describeAppPreview({ roleViewMode: 'teacher' }).summary, 'Vue n3boss');
});

test('describeAppPreview : niveau seul, valeur normalisée', () => {
  const d = describeAppPreview({ teacherPreview: 'Lycée' });
  assert.equal(d.levelActive, true);
  assert.equal(d.summary, 'Affichage Lycée');
});

test('describeAppPreview : rôle et niveau combinés, terminologie injectable', () => {
  const d = describeAppPreview({
    roleViewMode: 'student',
    teacherPreview: 'college',
    roleTerms: { studentSingular: 'élève', teacherShort: 'prof' },
  });
  assert.equal(d.summary, 'Vue élève · Affichage Collège');
});

test('describeAppPreview : niveau inconnu ignoré', () => {
  assert.equal(describeAppPreview({ teacherPreview: 'maternelle' }).active, false);
});
