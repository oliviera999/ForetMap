'use strict';

/**
 * Règle permanente du projet : aucun texte affiché n'invite à cueillir, goûter ou manipuler un
 * être vivant. Les observations d'espèces (migration 306) se font en regardant, en écoutant et
 * en photographiant, sans toucher ni prélever : leurs libellés passent par le même détecteur que
 * le corpus des visiteurs (`lib/visitorTextGuard.js`).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
const { findVisitorTextIncitations } = require('../lib/visitorTextGuard');

let texts;

test.before(async () => {
  texts = await import(
    pathToFileURL(join(__dirname, '../src/components/observations/observationTexts.js')).href
  );
});

function allStrings(mod) {
  const out = [];
  out.push(...Object.values(mod.OBSERVATION_TEXTS));
  out.push(...Object.values(mod.OBSERVATION_STATUS_LABELS));
  out.push(...Object.values(mod.OBSERVATION_STATUS_SHORT));
  out.push(...mod.DETECTION_MODE_OPTIONS.map((o) => o.label));
  return out;
}

test('aucun libellé d’observation n’incite à toucher, cueillir ou prélever', () => {
  for (const text of allStrings(texts)) {
    assert.deepEqual(findVisitorTextIncitations(text), [], `incitation dans « ${text} »`);
  }
});

test('le formulaire rappelle d’observer sans toucher ni prélever', () => {
  assert.match(texts.OBSERVATION_TEXTS.formIntro, /sans toucher ni prélever/);
});

test('les statuts et modes du front suivent le serveur', () => {
  const service = require('../lib/terrain/observationService');
  assert.deepEqual(
    Object.keys(texts.OBSERVATION_STATUS_LABELS).sort(),
    [...service.OBSERVATION_STATUSES].sort(),
  );
  assert.deepEqual(
    texts.DETECTION_MODE_OPTIONS.map((o) => o.value),
    [...service.DETECTION_MODES],
  );
});
