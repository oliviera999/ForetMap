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

test('une vignette suit son original, jamais orpheline tant qu’il est référencé', () => {
  const disk = [
    'zones/z1/5.jpg',
    'zones/z1/5.thumb.jpg',
    'markers/m1/2.png',
    'markers/m1/2.thumb.jpg',
    'zones/z1/9.thumb.jpg',
  ];
  const refs = ['zones/z1/5.jpg', 'markers/m1/2.png'];
  assert.deepStrictEqual(computeOrphanPaths(disk, refs), ['zones/z1/9.thumb.jpg']);
});

test('préfixes gérés étendus aux images publiques du forum, des commentaires et des fiches', () => {
  for (const p of [
    'forum-posts/p1/0.jpg',
    'context-comments/c1/0.png',
    'plants/3/photo-1.jpg',
    'markers/m/1.jpg',
    'tasks/t1.jpg',
  ]) {
    assert.strictEqual(isManagedPath(p), true, p);
  }
  // Médiathèque : pas de table, ses fichiers sont le catalogue — jamais gérée ici.
  assert.strictEqual(isManagedPath('media-library/image/2026/09/a.png'), false);
});

test('uploadPathsFromUrlText : une URL /uploads par ligne, liens externes ignorés', () => {
  const { uploadPathsFromUrlText } = require('../scripts/reconcile-orphan-uploads');
  assert.deepStrictEqual(
    uploadPathsFromUrlText(
      '/uploads/plants/3/photo-1.jpg\nhttps://upload.wikimedia.org/x.jpg\n/uploads/plants/3/b.png?v=2',
    ),
    ['plants/3/photo-1.jpg', 'plants/3/b.png'],
  );
  assert.deepStrictEqual(uploadPathsFromUrlText(null), []);
});

test('les sources de référence couvrent les photos d’observation et les pièces du carnet', async () => {
  require('./helpers/setup');
  const { initSchema } = require('../database');
  await initSchema();
  const {
    REFERENCE_SOURCES,
    loadReferencedImagePaths,
  } = require('../scripts/reconcile-orphan-uploads');
  const names = REFERENCE_SOURCES.map((s) => s.name);
  // Sans ces deux sources, `--apply` supprimerait les photos des observations d'espèces
  // (préfixe `observations/species/`) et les fichiers de l'ancien carnet recopiés au carnet.
  assert.ok(names.includes('species_observation_photos'));
  assert.ok(names.includes('user_journal_article_assets'));
  // Chaque préfixe géré doit avoir sa source, sinon `--apply` viderait le dossier.
  for (const n of [
    'marker_photos',
    'tasks',
    'forum_posts',
    'context_comments',
    'plant_photos',
    'plants',
  ]) {
    assert.ok(names.includes(n), n);
  }
  // Chaque requête s'exécute sur le schéma courant (colonne ou table renommée = échec ici).
  const refs = await loadReferencedImagePaths('all');
  assert.ok(Array.isArray(refs));
});
