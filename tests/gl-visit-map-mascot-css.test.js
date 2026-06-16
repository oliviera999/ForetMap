const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('visit-map-mascot.css : ancrage absolute pour le plateau / visite', () => {
  const css = readFileSync(join(__dirname, '../src/shared/styles/visit-map-mascot.css'), 'utf8');
  assert.match(css, /\.visit-map-mascot\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /@keyframes visitMascotWalkBob/);
});
