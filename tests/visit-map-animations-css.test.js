const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Garde-fous CSS des animations de carte (audit `docs/AUDIT_ANIMATIONS_CARTE_2026-10.md`). */

const read = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

function keyframesBody(css, name) {
  const start = css.indexOf(`@keyframes ${name}`);
  assert.notEqual(start, -1, `@keyframes ${name} introuvable`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return css.slice(start);
}

test('bulle de la mascotte : son apparition garde le redressement horizontal', () => {
  const body = keyframesBody(
    read('src/shared/styles/visit-map-mascot.css'),
    'visitMascotDialogPop',
  );
  const transforms = body.match(/transform:[^;]+;/g) || [];
  assert.ok(transforms.length >= 2);
  for (const t of transforms) assert.match(t, /scaleX\(var\(--visit-mascot-dialog-x/);
});

test('point de position : défini une seule fois, contre-échelonné', () => {
  assert.doesNotMatch(read('src/index.css'), /\.fm-pct-position/);
  assert.match(
    read('src/shared/styles/pct-map-layers.css'),
    /\.fm-pct-position__dot\s*\{[^}]*scale\(var\(--pct-inv, 1\)\)/,
  );
});

test('mouvement réduit : spritesheet de mascotte et popovers GL figés', () => {
  assert.match(
    read('src/shared/styles/visit-map-mascot.css'),
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.visit-map-mascot-spritesheet\s*\{\s*animation:\s*none/,
  );
  assert.match(
    read('src/gl/styles/gl-theme.css'),
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.gl-qcm-popover,\s*\.gl-zone-content-popover,\s*\.gl-dice-popover\s*\{\s*animation:\s*none/,
  );
});
