'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  getMascotPackValidatorCandidates,
  getMascotPackLibProbe,
} = require('../lib/mascotPackValidatorResolve');

test('mascotPackValidatorResolve : miroir lib présent dans le dépôt', () => {
  const probe = getMascotPackLibProbe();
  assert.ok(
    probe.libMirrorOk,
    'lib/visit-pack/mascotPack.js, visitMascotState.js et visitMascotInteractionEvents.js attendus',
  );
  assert.ok(probe.candidatesCount >= 1);
  const root = path.resolve(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'lib', 'visit-pack', 'mascotPack.js')));
});

test('mascotPackValidatorResolve : au moins un candidat importable', () => {
  const c = getMascotPackValidatorCandidates();
  assert.ok(c.length >= 1);
  for (const abs of c) {
    assert.ok(fs.existsSync(abs));
    assert.ok(abs.includes('mascotPack.js'));
  }
});

test('mascotPackValidatorResolve : import dynamique du validateur opérationnel', async () => {
  const candidates = getMascotPackValidatorCandidates();
  assert.ok(candidates.length >= 1);
  let imported = null;
  let lastErr = null;
  for (const abs of candidates) {
    try {
      imported = await import(pathToFileURL(abs).href);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  assert.ok(imported, lastErr ? `Import impossible: ${lastErr.message}` : 'Import impossible');
  assert.equal(typeof imported.validateMascotPackV1, 'function');
});
