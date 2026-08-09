'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const fs = require('fs');
const path = require('path');
const {
  saveMediaFromBuffer,
  listMediaLibraryItems,
  deleteMediaLibraryItem,
  clearMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
  resolveMediaItemApp,
  mediaItemMatchesApp,
} = require('../lib/mediaLibrary');
const { UPLOADS_DIR } = require('../lib/uploads');

function mediaAbs(relativePath) {
  return path.resolve(UPLOADS_DIR, relativePath);
}

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=',
  'base64',
);

let teacherToken = '';
let glAdminToken = '';
const routeStamp = Date.now();

before(async () => {
  await initSchema();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole?.id || null,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: true,
      permissions: ['teacher.access'],
    },
    false,
  );

  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Scope', 'admin', 1, NOW(), NOW())`,
    [`scope-route-${routeStamp}@ecole.local`],
  );
  const glAdmin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `scope-route-${routeStamp}@ecole.local`,
  ]);
  glAdminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(glAdmin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
    displayName: 'MJ Scope',
  });
});

test('resolveMediaItemApp / mediaItemMatchesApp — médias hérités réservés à G&L', () => {
  assert.strictEqual(resolveMediaItemApp(null), 'gl');
  assert.strictEqual(resolveMediaItemApp('foretmap'), 'foretmap');
  assert.strictEqual(resolveMediaItemApp('inconnu'), 'gl');

  // legacy (sans étiquette) : visible côté G&L, masqué côté ForetMap
  assert.strictEqual(mediaItemMatchesApp(null, 'gl'), true);
  assert.strictEqual(mediaItemMatchesApp(null, 'foretmap'), false);
  // étiquetté ForetMap : strictement côté ForetMap
  assert.strictEqual(mediaItemMatchesApp('foretmap', 'foretmap'), true);
  assert.strictEqual(mediaItemMatchesApp('foretmap', 'gl'), false);
  assert.strictEqual(mediaItemMatchesApp('gl', 'gl'), true);
  // sans filtre : tout passe
  assert.strictEqual(mediaItemMatchesApp('foretmap', null), true);
});

test('listMediaLibraryItems cloisonne les deux médiathèques (legacy → G&L)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fm = saveMediaFromBuffer(TINY_PNG, 'image/png', `scope-fm-${stamp}.png`, {
    skipManifestSync: true,
    app: 'foretmap',
  });
  const gl = saveMediaFromBuffer(TINY_PNG, 'image/png', `scope-gl-${stamp}.png`, {
    skipManifestSync: true,
    app: 'gl',
  });
  const legacy = saveMediaFromBuffer(TINY_PNG, 'image/png', `scope-legacy-${stamp}.png`, {
    skipManifestSync: true,
  });

  const created = new Set([fm.relativePath, gl.relativePath, legacy.relativePath]);

  try {
    const foretmap = listMediaLibraryItems(800, { app: 'foretmap' }).filter((i) =>
      created.has(i.relativePath),
    );
    const glList = listMediaLibraryItems(800, { app: 'gl' }).filter((i) =>
      created.has(i.relativePath),
    );

    assert.deepStrictEqual(
      foretmap.map((i) => i.relativePath).sort(),
      [fm.relativePath],
      'ForetMap ne voit que ses propres médias',
    );
    assert.deepStrictEqual(
      glList.map((i) => i.relativePath).sort(),
      [gl.relativePath, legacy.relativePath].sort(),
      'G&L voit ses médias + les médias hérités',
    );

    // Chaque item expose slug + médiathèque d'origine.
    const fmItem = foretmap[0];
    assert.strictEqual(fmItem.app, 'foretmap');
    assert.ok(fmItem.stableKey, 'slug exposé pour l’affichage');

    const legacyItem = glList.find((i) => i.relativePath === legacy.relativePath);
    assert.strictEqual(legacyItem.app, 'gl', 'média hérité rattaché à G&L');
  } finally {
    deleteMediaLibraryItem(fm.relativePath, { skipManifestSync: true });
    deleteMediaLibraryItem(gl.relativePath, { skipManifestSync: true });
    deleteMediaLibraryItem(legacy.relativePath, { skipManifestSync: true });
  }
});

test('clear_all / suppressions — cloisonnement strict ForetMap vs G&L', () => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fm = saveMediaFromBuffer(TINY_PNG, 'image/png', `clear-fm-${stamp}.png`, {
    skipManifestSync: true,
    app: 'foretmap',
  });
  const gl = saveMediaFromBuffer(TINY_PNG, 'image/png', `clear-gl-${stamp}.png`, {
    skipManifestSync: true,
    app: 'gl',
  });
  const legacy = saveMediaFromBuffer(TINY_PNG, 'image/png', `clear-legacy-${stamp}.png`, {
    skipManifestSync: true,
  });

  try {
    assert.throws(
      () => clearMediaLibraryItems(),
      (err) => err && err.status === 400 && /app/i.test(err.message),
      'clear_all sans app doit être refusé',
    );
    assert.throws(
      () => executeMediaLibraryDeleteRequest({ clear_all: true }),
      (err) => err && err.status === 400 && /app/i.test(err.message),
      'executeMediaLibraryDeleteRequest sans app doit être refusé',
    );

    const clearedFm = executeMediaLibraryDeleteRequest({ clear_all: true }, { app: 'foretmap' });
    assert.ok(clearedFm.deleted >= 1, 'au moins le média ForetMap est ciblé');
    assert.ok(!fs.existsSync(mediaAbs(fm.relativePath)));
    assert.ok(
      fs.existsSync(mediaAbs(gl.relativePath)),
      'clear_all ForetMap ne doit pas supprimer un média G&L',
    );
    assert.ok(
      fs.existsSync(mediaAbs(legacy.relativePath)),
      'clear_all ForetMap ne doit pas supprimer un média hérité (G&L)',
    );

    assert.throws(
      () =>
        executeMediaLibraryDeleteRequest({ relative_path: gl.relativePath }, { app: 'foretmap' }),
      (err) => err && err.status === 403,
      'suppression unitaire hors périmètre refusée',
    );
    assert.ok(fs.existsSync(mediaAbs(gl.relativePath)));

    // Suppression unitaire G&L OK ; le clear_all G&L n'est pas rejoué ici pour éviter
    // d'effacer toute la médiathèque partagée des autres tests du process.
    const deletedGl = executeMediaLibraryDeleteRequest(
      { relative_path: gl.relativePath },
      { app: 'gl' },
    );
    assert.strictEqual(deletedGl.deleted, 1);
    assert.ok(!fs.existsSync(mediaAbs(gl.relativePath)));
    assert.ok(fs.existsSync(mediaAbs(legacy.relativePath)), 'legacy encore présent');
  } finally {
    for (const relativePath of [fm.relativePath, gl.relativePath, legacy.relativePath]) {
      try {
        deleteMediaLibraryItem(relativePath, { skipManifestSync: true });
      } catch {
        /* déjà supprimé */
      }
    }
  }
});

test('DELETE HTTP clear_all ForetMap n’efface pas la médiathèque G&L', async () => {
  const stamp = `${routeStamp}-${Math.random().toString(16).slice(2, 8)}`;
  const fm = saveMediaFromBuffer(TINY_PNG, 'image/png', `http-clear-fm-${stamp}.png`, {
    skipManifestSync: true,
    app: 'foretmap',
  });
  const gl = saveMediaFromBuffer(TINY_PNG, 'image/png', `http-clear-gl-${stamp}.png`, {
    skipManifestSync: true,
    app: 'gl',
  });

  try {
    const res = await request(app)
      .delete('/api/media-library')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ clear_all: true })
      .expect(200);
    assert.ok((res.body?.deleted || 0) >= 1);
    assert.ok(!fs.existsSync(mediaAbs(fm.relativePath)));
    assert.ok(
      fs.existsSync(mediaAbs(gl.relativePath)),
      'DELETE clear_all ForetMap ne doit pas toucher G&L',
    );

    const forbidden = await request(app)
      .delete('/api/media-library')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ relative_path: gl.relativePath })
      .expect(403);
    assert.match(String(forbidden.body?.error || ''), /périmètre/i);
    assert.ok(fs.existsSync(mediaAbs(gl.relativePath)));
  } finally {
    for (const relativePath of [fm.relativePath, gl.relativePath]) {
      try {
        deleteMediaLibraryItem(relativePath, { skipManifestSync: true });
      } catch {
        /* déjà supprimé */
      }
    }
  }
});

test('GET routes médiathèque — cloisonnement HTTP ForetMap vs G&L', async () => {
  const stamp = `${routeStamp}-${Math.random().toString(16).slice(2, 8)}`;
  const fm = saveMediaFromBuffer(TINY_PNG, 'image/png', `route-fm-${stamp}.png`, {
    skipManifestSync: true,
    app: 'foretmap',
  });
  const gl = saveMediaFromBuffer(TINY_PNG, 'image/png', `route-gl-${stamp}.png`, {
    skipManifestSync: true,
    app: 'gl',
  });
  const legacy = saveMediaFromBuffer(TINY_PNG, 'image/png', `route-legacy-${stamp}.png`, {
    skipManifestSync: true,
  });
  const created = new Set([fm.relativePath, gl.relativePath, legacy.relativePath]);

  try {
    const fmRes = await request(app)
      .get('/api/media-library?limit=800')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    const fmPaths = (fmRes.body?.items || [])
      .filter((i) => created.has(i.relativePath))
      .map((i) => i.relativePath);
    assert.deepStrictEqual(fmPaths, [fm.relativePath]);

    const glRes = await request(app)
      .get('/api/gl/admin/media-library?limit=800')
      .set('Authorization', `Bearer ${glAdminToken}`)
      .expect(200);
    const glPaths = (glRes.body?.items || [])
      .filter((i) => created.has(i.relativePath))
      .map((i) => i.relativePath)
      .sort();
    assert.deepStrictEqual(glPaths, [gl.relativePath, legacy.relativePath].sort());

    const legacyItem = (glRes.body?.items || []).find(
      (i) => i.relativePath === legacy.relativePath,
    );
    assert.strictEqual(legacyItem?.app, 'gl');
  } finally {
    deleteMediaLibraryItem(fm.relativePath, { skipManifestSync: true });
    deleteMediaLibraryItem(gl.relativePath, { skipManifestSync: true });
    deleteMediaLibraryItem(legacy.relativePath, { skipManifestSync: true });
  }
});
