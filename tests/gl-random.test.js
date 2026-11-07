'use strict';

/**
 * Aléa centralisé du moteur G&L (`lib/glRandom.js`) : plus aucun `crypto.randomInt` ni
 * `Math.random` dans `lib/gl*` hors du module ; générateur déterministe par partie quand
 * `GL_RANDOM_SEED` est posé hors production ; `crypto` sinon.
 */

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const glRandom = require('../lib/glRandom');

const ROOT = path.join(__dirname, '..');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function listGlEngineFiles() {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'lib'))) {
    if (f.startsWith('gl') && f.endsWith('.js') && f !== 'glRandom.js')
      out.push(path.join('lib', f));
  }
  for (const f of fs.readdirSync(path.join(ROOT, 'lib', 'gl'))) {
    if (f.endsWith('.js')) out.push(path.join('lib', 'gl', f));
  }
  return out;
}

test('anti-régression : aucun crypto.randomInt ni Math.random dans lib/gl* hors glRandom.js', () => {
  const offenders = [];
  for (const rel of listGlEngineFiles()) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (/crypto\.randomInt\s*\(|Math\.random\s*\(/.test(src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test('mode crypto par défaut : bornes respectées, pick et shuffle cohérents', () => {
  const previous = process.env.GL_RANDOM_SEED;
  delete process.env.GL_RANDOM_SEED;
  glRandom.resetForTests();
  assert.equal(glRandom.seededEnabled(), false);
  for (let i = 0; i < 200; i += 1) {
    const n = glRandom.randomInt(2, 5);
    assert.ok(n >= 2 && n < 5);
    const m = glRandom.randomInt(6);
    assert.ok(m >= 0 && m < 6);
  }
  assert.equal(glRandom.pick([]), null);
  assert.equal(glRandom.pick(['seul']), 'seul');
  const shuffled = glRandom.shuffle([1, 2, 3, 4, 5]);
  assert.deepEqual([...shuffled].sort(), [1, 2, 3, 4, 5]);
  assert.throws(() => glRandom.randomInt(5, 5), RangeError);
  if (previous !== undefined) process.env.GL_RANDOM_SEED = previous;
});

test('GL_RANDOM_SEED hors production : séquence reproductible, une graine par partie', () => {
  const previous = process.env.GL_RANDOM_SEED;
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.GL_RANDOM_SEED = '12345';
  glRandom.resetForTests();
  assert.equal(glRandom.seededEnabled(), true);
  const a = Array.from({ length: 20 }, () => glRandom.forGame(7).randomInt(1, 7));
  const b = Array.from({ length: 20 }, () => glRandom.forGame(8).randomInt(1, 7));
  glRandom.resetForTests();
  const a2 = Array.from({ length: 20 }, () => glRandom.forGame(7).randomInt(1, 7));
  assert.deepEqual(a, a2, 'même graine, même partie → même séquence');
  assert.notDeepEqual(a, b, 'deux parties → deux séquences');
  // Les parties en parallèle ne se perturbent pas : la séquence de 7 ne dépend pas des tirages de 8.
  glRandom.resetForTests();
  const mixed = [];
  for (let i = 0; i < 20; i += 1) {
    mixed.push(glRandom.forGame(7).randomInt(1, 7));
    glRandom.forGame(8).randomInt(1, 7);
  }
  assert.deepEqual(mixed, a);
  // Une graine textuelle est hachée ; en production la graine est ignorée.
  process.env.GL_RANDOM_SEED = 'brume';
  glRandom.resetForTests();
  assert.equal(glRandom.seededEnabled(), true);
  process.env.NODE_ENV = 'production';
  assert.equal(glRandom.seededEnabled(), false);
  process.env.NODE_ENV = previousEnv;
  if (previous === undefined) delete process.env.GL_RANDOM_SEED;
  else process.env.GL_RANDOM_SEED = previous;
  glRandom.resetForTests();
});
