'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  BUNDLE_BUDGETS,
  TARGET_JS_KB,
  collectStaticClosure,
  measureClosure,
  checkBudget,
  looksLikeDevBuild,
} = require('../scripts/check-bundle-budget');

const FAKE_MANIFEST = Object.freeze({
  'index.vite.html': {
    file: 'assets/main-A.js',
    css: ['assets/main-A.css'],
    imports: ['_vendor.js', '_shared.js'],
    dynamicImports: ['src/Lazy.jsx'],
  },
  '_vendor.js': { file: 'assets/vendor-B.js' },
  '_shared.js': {
    file: 'assets/shared-C.js',
    css: ['assets/styles-D.css'],
    imports: ['_vendor.js'],
  },
  'src/Lazy.jsx': { file: 'assets/Lazy-E.js', css: ['assets/Lazy-E.css'], imports: ['_shared.js'] },
});

test('budget : fermeture statique de l’entrée, sans les chunks dynamiques', () => {
  const closure = collectStaticClosure(FAKE_MANIFEST, 'index.vite.html');
  assert.deepStrictEqual(closure.js, [
    'assets/main-A.js',
    'assets/vendor-B.js',
    'assets/shared-C.js',
  ]);
  assert.deepStrictEqual(closure.css, ['assets/main-A.css', 'assets/styles-D.css']);
  assert.throws(() => collectStaticClosure(FAKE_MANIFEST, 'absent.html'), /absente/);
});

test('budget : mesure en Ko décodés et dépassement signalé', () => {
  const closure = collectStaticClosure(FAKE_MANIFEST, 'index.vite.html');
  const sizes = {
    'assets/main-A.js': 300 * 1024,
    'assets/vendor-B.js': 200 * 1024,
    'assets/shared-C.js': 10 * 1024,
    'assets/main-A.css': 5 * 1024,
    'assets/styles-D.css': 50 * 1024,
  };
  const measure = measureClosure(closure, (file) => sizes[file]);
  assert.strictEqual(measure.jsBytes, 510 * 1024);
  assert.strictEqual(measure.cssBytes, 55 * 1024);
  assert.deepStrictEqual(checkBudget(measure, { jsKb: 600, cssKb: 60 }), []);
  assert.strictEqual(checkBudget(measure, { jsKb: 500, cssKb: 50 }).length, 2);
});

test('budget : un build de développement est refusé, pas mesuré', () => {
  const closure = { js: ['a.js'], css: [] };
  assert.strictEqual(
    looksLikeDevBuild(closure, () => 'x("In HTML, %s cannot be a child")'),
    true,
  );
  assert.strictEqual(
    looksLikeDevBuild(closure, () => 'minifié'),
    false,
  );
});

test('budget : l’entrée non connectée de ForetMap a un plafond, au-dessus de l’objectif', () => {
  const budget = BUNDLE_BUDGETS['index.vite.html'];
  assert.ok(budget, 'plafond de index.vite.html');
  assert.ok(budget.jsKb >= TARGET_JS_KB);
  assert.strictEqual(TARGET_JS_KB, 400);
});
