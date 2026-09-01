'use strict';

/**
 * Garde-fous de charge et d'exposition issus de l'audit `docs/AUDIT_CHARGE_ET_BUGS_2026-08.md`.
 *
 * Ces cas tournent **sans base** : ils portent sur les modules purs extraits pour rendre
 * les correctifs vérifiables — limites de corps par niveau, borne de taille des fichiers
 * écrits, projection publique des comptes, cache du contenu de visite, index média.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveJsonBodyTier,
  defaultJsonBodyLimit,
  contentJsonBodyLimit,
  largeJsonBodyLimit,
} = require('../lib/jsonBodyLimit');
const { toPublicUserRow, PUBLIC_USER_FIELDS } = require('../lib/publicUser');
const { createVisitContentCache } = require('../lib/visitContentCache');
const { buildKeyIndexByRelativePath } = require('../lib/mediaLibrary');

// ── Limites de corps JSON ────────────────────────────────────────────────────────────

test('les mutations ordinaires retombent sur la limite basse', () => {
  // C'est le cœur du correctif : `/api/tasks` entier acceptait 25 Mo, donc valider une
  // tâche ouvrait un pic mémoire de plusieurs dizaines de Mo sur un process à ~120 Mo.
  assert.strictEqual(resolveJsonBodyTier('/api/tasks'), 'default');
  assert.strictEqual(resolveJsonBodyTier('/api/tasks/abc/status'), 'default');
  assert.strictEqual(resolveJsonBodyTier('/api/auth/login'), 'default');
  assert.strictEqual(resolveJsonBodyTier('/api/task-projects'), 'default');
  assert.strictEqual(resolveJsonBodyTier('/api/sync-state'), 'default');
});

test('le contenu illustré garde une limite intermédiaire', () => {
  for (const p of [
    '/api/forum/threads',
    '/api/context-comments',
    '/api/observations',
    '/api/zones/z1/photos',
    '/api/map/markers/m1/photos',
    '/api/plants/12/photo',
  ]) {
    assert.strictEqual(resolveJsonBodyTier(p), 'content', p);
  }
});

test('imports, packs et bibliothèque conservent la limite haute', () => {
  for (const p of [
    '/api/students/import',
    '/api/tasks/import',
    '/api/plants/import',
    '/api/tutorials/import/files',
    '/api/media-library',
    '/api/visit/mascot-packs/42/assets',
    '/api/settings/admin/maps/foret/image',
    '/api/gl/chapters/admin/3/map-image',
    '/api/gl/mascots',
  ]) {
    assert.strictEqual(resolveJsonBodyTier(p), 'import', p);
  }
});

test('un préfixe n’est pas un préfixe de chaîne : /api/tasksomething reste au défaut', () => {
  assert.strictEqual(resolveJsonBodyTier('/api/tasksomething'), 'default');
  assert.strictEqual(resolveJsonBodyTier('/api/students/importateur'), 'content');
});

test('la query string n’influence pas le niveau', () => {
  assert.strictEqual(resolveJsonBodyTier('/api/media-library?limit=10'), 'import');
});

test('les trois limites sont ordonnées et surchargeables', () => {
  const parseMb = (s) => parseFloat(String(s).replace('mb', ''));
  assert.ok(parseMb(defaultJsonBodyLimit()) < parseMb(contentJsonBodyLimit()));
  assert.ok(parseMb(contentJsonBodyLimit()) < parseMb(largeJsonBodyLimit()));
  process.env.FORETMAP_JSON_BODY_LIMIT_CONTENT = '5mb';
  try {
    assert.strictEqual(contentJsonBodyLimit(), '5mb');
  } finally {
    delete process.env.FORETMAP_JSON_BODY_LIMIT_CONTENT;
  }
});

// ── Projection publique des comptes ──────────────────────────────────────────────────

test('toPublicUserRow n’expose que la liste blanche', () => {
  const row = {
    id: 'u1',
    user_type: 'student',
    pseudo: 'zoe',
    email: 'zoe@example.org',
    password_hash: '$2b$10$hash',
    // Colonne sensible ajoutée demain par une migration : ne doit pas sortir.
    totp_secret: 'SECRET',
    reset_token: 'jeton',
  };
  const out = toPublicUserRow(row);
  assert.strictEqual(out.id, 'u1');
  assert.strictEqual(out.pseudo, 'zoe');
  assert.strictEqual('password_hash' in out, false);
  assert.strictEqual('totp_secret' in out, false);
  assert.strictEqual('reset_token' in out, false);
});

test('toPublicUserRow n’invente pas de colonnes absentes et accepte des champs ajoutés', () => {
  const out = toPublicUserRow({ id: 'u1' }, { authToken: 'tok' });
  assert.deepStrictEqual(Object.keys(out), ['id', 'authToken']);
  assert.strictEqual(toPublicUserRow(null), null);
  assert.strictEqual(toPublicUserRow(undefined), null);
  assert.ok(PUBLIC_USER_FIELDS.includes('avatar_path'));
  assert.ok(!PUBLIC_USER_FIELDS.includes('password_hash'));
});

// ── Cache du contenu public de visite ────────────────────────────────────────────────

test('le contenu de visite est resservi tant qu’aucune écriture n’a eu lieu', () => {
  let writes = 7;
  const cache = createVisitContentCache({ writeVersion: () => writes });
  cache.set('foret', { zones: [1] });
  assert.deepStrictEqual(cache.get('foret'), { zones: [1] });
  assert.strictEqual(cache.get('n3'), null);
});

test('toute écriture en base périme le cache instantanément', () => {
  let writes = 1;
  const cache = createVisitContentCache({ writeVersion: () => writes });
  cache.set('foret', { zones: [1] });
  writes += 1; // une mutation quelconque est passée par les helpers SQL
  assert.strictEqual(cache.get('foret'), null);
});

test('le TTL couvre les écritures hors process (scripts, SQL direct)', () => {
  let clock = 1000;
  const cache = createVisitContentCache({
    writeVersion: () => 1,
    now: () => clock,
    ttlMs: 30000,
  });
  cache.set('foret', { zones: [1] });
  clock += 29999;
  assert.notStrictEqual(cache.get('foret'), null);
  clock += 2;
  assert.strictEqual(cache.get('foret'), null);
});

test('le cache est borné en nombre d’entrées', () => {
  const cache = createVisitContentCache({ writeVersion: () => 1, maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.ok(cache.size() <= 2);
});

test('createVisitContentCache exige une source de version', () => {
  assert.throws(() => createVisitContentCache({}), /writeVersion/);
});

// ── Index de la bibliothèque média ───────────────────────────────────────────────────

test('l’index média est adressé par chemin (fin de la recherche linéaire par fichier)', () => {
  const keyIndex = {
    k1: { relativePath: 'media-library/image/a.jpg', originalName: 'A.jpg' },
    k2: { relativePath: 'media-library/audio/b.mp3', originalName: 'B.mp3' },
    k3: { relativePath: null },
  };
  const byPath = buildKeyIndexByRelativePath(keyIndex);
  assert.strictEqual(byPath.get('media-library/image/a.jpg')[0], 'k1');
  assert.strictEqual(byPath.get('media-library/audio/b.mp3')[1].originalName, 'B.mp3');
  assert.strictEqual(byPath.get('media-library/inconnu.png'), undefined);
  assert.strictEqual(byPath.size, 2);
});

// ── Écriture des fichiers : asynchrone et bornée ─────────────────────────────────────

test('les écritures uploads sont asynchrones et bornées en taille', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foretmap-uploads-'));
  const previous = process.env.FORETMAP_MAX_UPLOAD_BYTES;
  process.env.FORETMAP_MAX_UPLOAD_BYTES = String(128 * 1024);
  // Import après réglage : la borne est lue à chaque appel, pas au chargement.
  const uploads = require('../lib/uploads');
  try {
    assert.strictEqual(typeof uploads.saveBase64ToDisk, 'function');
    // Une promesse, pas un retour synchrone : la boucle d'événements n'est plus bloquée.
    const small = uploads.writeBufferToDisk(
      `tests/${path.basename(tmp)}-ok.bin`,
      Buffer.alloc(1024, 1),
    );
    assert.ok(small instanceof Promise);
    await small;

    await assert.rejects(
      () => uploads.writeBufferToDisk('tests/too-big.bin', Buffer.alloc(200 * 1024, 1)),
      /trop volumineux/i,
    );
    assert.throws(() => uploads.assertUploadSize(200 * 1024), { code: 'UPLOAD_TOO_LARGE' });
  } finally {
    if (previous === undefined) delete process.env.FORETMAP_MAX_UPLOAD_BYTES;
    else process.env.FORETMAP_MAX_UPLOAD_BYTES = previous;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(path.join(__dirname, '..', 'uploads', 'tests'), { recursive: true, force: true });
  }
});
