'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasConflictMarkers,
  compareSemver,
  maxVersion,
  parseConflicts,
  resolveChangelogConflicts,
  resolveVersionOnlyConflicts,
} = require('../scripts/auto-resolve-conflicts.js');

// Construit un bloc de conflit Git à partir des deux côtés.
function conflict(ours, theirs) {
  return ['<<<<<<< HEAD', ...ours, '=======', ...theirs, '>>>>>>> origin/main'].join('\n');
}

test('hasConflictMarkers détecte les marqueurs et ignore le texte propre', () => {
  assert.equal(hasConflictMarkers('rien à signaler'), false);
  assert.equal(hasConflictMarkers(conflict(['a'], ['b'])), true);
});

test('compareSemver / maxVersion comparent numériquement (pas lexicalement)', () => {
  assert.equal(compareSemver('1.60.0', '1.9.0'), 1); // 60 > 9
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  assert.equal(compareSemver('1.59.35', '1.60.0'), -1);
  assert.equal(maxVersion('1.59.35', '1.60.0'), '1.60.0');
  assert.equal(maxVersion('2.0.0', '1.99.99'), '2.0.0');
});

test('parseConflicts isole texte et blocs, gère la base diff3', () => {
  const text = ['avant', conflict(['x'], ['y']), 'après'].join('\n');
  const segs = parseConflicts(text);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[0], { type: 'text', lines: ['avant'] });
  assert.deepEqual(segs[1], { type: 'conflict', ours: ['x'], theirs: ['y'] });
  assert.deepEqual(segs[2], { type: 'text', lines: ['après'] });

  const diff3 = ['<<<<<<< HEAD', 'x', '||||||| base', 'b', '=======', 'y', '>>>>>>> main'].join(
    '\n',
  );
  const [seg] = parseConflicts(diff3);
  assert.deepEqual(seg, { type: 'conflict', ours: ['x'], theirs: ['y'] });
});

test('resolveChangelogConflicts conserve les deux côtés (union)', () => {
  const text = ['## [Non publié]', conflict(['- entrée A'], ['- entrée B']), 'fin'].join('\n');
  const { resolved, text: out } = resolveChangelogConflicts(text);
  assert.equal(resolved, true);
  assert.equal(hasConflictMarkers(out), false);
  assert.ok(out.includes('- entrée A'));
  assert.ok(out.includes('- entrée B'));
  assert.ok(out.indexOf('entrée A') < out.indexOf('entrée B'));
});

test('resolveChangelogConflicts dédoublonne les côtés identiques', () => {
  const text = conflict(['- même ligne'], ['- même ligne']);
  const { text: out } = resolveChangelogConflicts(text);
  assert.equal(out.match(/même ligne/g).length, 1);
});

test('resolveChangelogConflicts laisse passer un texte sans conflit', () => {
  const { resolved, text } = resolveChangelogConflicts('aucun conflit');
  assert.equal(resolved, true);
  assert.equal(text, 'aucun conflit');
});

test('resolveVersionOnlyConflicts garde la version la plus haute', () => {
  const pkg = [
    '{',
    '  "name": "foretmap",',
    conflict(['  "version": "1.59.35",'], ['  "version": "1.60.0",']),
    '  "private": true',
    '}',
  ].join('\n');
  const { resolved, text } = resolveVersionOnlyConflicts(pkg);
  assert.equal(resolved, true);
  assert.equal(hasConflictMarkers(text), false);
  assert.ok(text.includes('"version": "1.60.0"'));
  assert.ok(!text.includes('1.59.35'));
});

test('resolveVersionOnlyConflicts renonce si la différence n’est pas qu’une version', () => {
  const pkg = [
    '{',
    conflict(
      ['  "version": "1.60.0",', '  "dependencies": { "a": "^1" }'],
      ['  "version": "1.59.0",', '  "dependencies": { "a": "^2" }'],
    ),
    '}',
  ].join('\n');
  const { resolved } = resolveVersionOnlyConflicts(pkg);
  assert.equal(resolved, false);
});

test('resolveVersionOnlyConflicts renonce si les blocs ont des tailles différentes', () => {
  const pkg = conflict(['  "version": "1.60.0",'], ['  "version": "1.59.0",', '  "extra": true']);
  const { resolved } = resolveVersionOnlyConflicts(pkg);
  assert.equal(resolved, false);
});
