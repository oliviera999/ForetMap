'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MANAGED_PREFIXES,
  parseFlags,
  normalizeRelativePath,
  isManagedPath,
  listUploadFiles,
  computeOrphanPaths,
} = require('../scripts/reconcile-orphan-uploads');

test('parseFlags: défaut dry-run managed', () => {
  const f = parseFlags([]);
  assert.strictEqual(f.apply, false);
  assert.strictEqual(f.json, false);
  assert.strictEqual(f.scope, 'managed');
});

test('parseFlags: applique options explicites', () => {
  const f = parseFlags(['--apply', '--json', '--scope=all']);
  assert.strictEqual(f.apply, true);
  assert.strictEqual(f.json, true);
  assert.strictEqual(f.scope, 'all');
});

test('normalizeRelativePath normalise et bloque parent traversal', () => {
  assert.strictEqual(normalizeRelativePath('\\zones\\z1\\1.jpg'), 'zones/z1/1.jpg');
  assert.strictEqual(normalizeRelativePath('/task-logs/t1_1.jpg'), 'task-logs/t1_1.jpg');
  assert.strictEqual(normalizeRelativePath('../secret.txt'), '');
  assert.strictEqual(normalizeRelativePath(''), '');
});

test('isManagedPath reconnaît les préfixes gérés', () => {
  assert.ok(Array.isArray(MANAGED_PREFIXES));
  assert.strictEqual(isManagedPath('zones/a/1.jpg'), true);
  assert.strictEqual(isManagedPath('task-logs/t_1.jpg'), true);
  assert.strictEqual(isManagedPath('observations/o_1.jpg'), true);
  assert.strictEqual(isManagedPath('students/u/avatar.jpg'), true);
  assert.strictEqual(isManagedPath('misc/manual.png'), false);
});

test('listUploadFiles respecte scope managed/all', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-reconcile-'));
  try {
    fs.mkdirSync(path.join(tmp, 'zones', 'z1'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'misc'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'zones', 'z1', '1.jpg'), 'x');
    fs.writeFileSync(path.join(tmp, 'misc', 'manual.png'), 'y');

    const managed = listUploadFiles(tmp, 'managed');
    const all = listUploadFiles(tmp, 'all');

    assert.deepStrictEqual(managed.sort(), ['zones/z1/1.jpg']);
    assert.deepStrictEqual(all.sort(), ['misc/manual.png', 'zones/z1/1.jpg']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('computeOrphanPaths calcule uniquement les non référencés', () => {
  const disk = ['zones/z1/1.jpg', 'zones/z1/2.jpg', 'task-logs/t1_9.jpg'];
  const refs = ['zones/z1/1.jpg', 'task-logs/t1_9.jpg'];
  const orphans = computeOrphanPaths(disk, refs);
  assert.deepStrictEqual(orphans, ['zones/z1/2.jpg']);
});
