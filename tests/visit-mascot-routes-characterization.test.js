'use strict';

// Caractérisation des routes « mascotte » de la visite (`routes/visit/mascot.js`, piste B,
// étape B7 de l'audit du 25/09/2026, § 3.3 ligne 15).
//
// Avant d'aligner le routeur sur `asyncHandler` (O8) et `validate()` (O7), ces tests figent
// ce qu'il répond aujourd'hui, défauts compris :
//   - les contrôles de paramètres et de corps (statut + message exact, et leur ORDRE face au
//     « pack introuvable ») ;
//   - les trois politiques d'erreur des anciens try/catch : erreur SQL traduite (famille
//     « packs » ou « bibliothèque de sprites »), erreur métier portant un `.status` (archives),
//     sinon 500 « Erreur serveur » — toujours avec le `requestId` ;
//   - le refus des fichiers non image sur les quatre chemins d'écriture (faille N1 : dépôt,
//     renommage, bibliothèque de sprites, import ZIP).

require('./helpers/setup');

// Pannes SQL simulées : l'enveloppe est posée AVANT le chargement du serveur (les routeurs
// déstructurent les helpers de `database.js` au premier `require`) et ne se déclenche que sur
// les requêtes qui visent la table choisie — l'authentification, elle, passe normalement.
const database = require('../database');

let sqlFault = null;
for (const name of ['queryOne', 'queryAll', 'execute']) {
  const original = database[name];
  database[name] = (sql, ...rest) =>
    sqlFault && sqlFault.match.test(String(sql))
      ? Promise.reject(sqlFault.error)
      : original(sql, ...rest);
}
function sqlError(errno, code, message = code) {
  const err = new Error(message);
  err.errno = errno;
  err.code = code;
  return err;
}
async function withSqlFault(match, error, run) {
  sqlFault = { match, error };
  try {
    return await run();
  } finally {
    sqlFault = null;
  }
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const request = require('supertest');
const { app } = require('../server');
const { initDatabase, initSchema } = database;
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { UPLOADS_DIR } = require('../lib/uploads');

const REQ_ID = 'carac-mascotte-01';
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';
const HOSTILE_HTML = '<html><script>alert(1)</script></html>';
const HOSTILE_HTML_B64 = Buffer.from(HOSTILE_HTML).toString('base64');
const UNKNOWN_UUID = '00000000-0000-4000-8000-00000000abcd';

let token;
const createdPackIds = [];
const createdSpriteFiles = [];

function call(method, url) {
  return request(app)
    [method](url)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Request-Id', REQ_ID);
}

async function createPack() {
  const res = await call('post', '/api/visit/mascot-packs').send({ is_published: 0 }).expect(201);
  createdPackIds.push(res.body.id);
  return res.body.id;
}

function uploadPackAsset(packId, filename, imageData = TINY_PNG_B64) {
  return call('post', `/api/visit/mascot-packs/${packId}/assets`).send({
    filename,
    image_data: imageData,
  });
}

function packDir(packId) {
  return path.join(UPLOADS_DIR, 'visit_mascot_packs', packId);
}

function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  token = await ensureAdminTeacherAuthToken();
});

after(async () => {
  for (const id of createdPackIds) {
    await call('delete', `/api/visit/mascot-packs/${id}`);
  }
  for (const filename of createdSpriteFiles) {
    await call('delete', `/api/visit/mascot-sprite-library/assets/${filename}`);
  }
});

describe('Mascotte — contrôles des paramètres (400 / 404)', () => {
  it('identifiant de pack mal formé : message propre à chaque route', async () => {
    const cases = [
      ['get', '/api/visit/mascot-packs/pas-un-uuid', 'Identifiant de pack invalide'],
      ['put', '/api/visit/mascot-packs/pas-un-uuid', 'Pack invalide'],
      ['get', '/api/visit/mascot-packs/pas-un-uuid/export.zip', 'Pack invalide'],
      ['delete', '/api/visit/mascot-packs/pas-un-uuid', 'Pack invalide'],
      ['post', '/api/visit/mascot-packs/pas-un-uuid/reset', 'Pack invalide'],
      ['get', '/api/visit/mascot-packs/pas-un-uuid/assets', 'Pack invalide'],
      ['post', '/api/visit/mascot-packs/pas-un-uuid/assets', 'Pack invalide'],
      ['get', '/api/visit/mascot-packs/pas-un-uuid/assets/a.png', 'Paramètres invalides'],
      ['delete', '/api/visit/mascot-packs/pas-un-uuid/assets/a.png', 'Paramètres invalides'],
      ['patch', '/api/visit/mascot-packs/pas-un-uuid/assets/a.png', 'Paramètres invalides'],
    ];
    for (const [method, url, message] of cases) {
      const res = await call(method, url).send({ new_filename: 'b.png' });
      assert.equal(res.status, 400, `${method} ${url}`);
      assert.deepEqual(res.body, { error: message }, `${method} ${url}`);
    }
  });

  it('nom de fichier non image dans l’URL : 400 « Paramètres invalides »', async () => {
    const packId = await createPack();
    for (const [method, url] of [
      ['get', `/api/visit/mascot-packs/${packId}/assets/page.html`],
      ['delete', `/api/visit/mascot-packs/${packId}/assets/page.html`],
      ['patch', `/api/visit/mascot-packs/${packId}/assets/page.html`],
      ['get', '/api/visit/mascot-sprite-library/assets/page.html'],
      ['get', '/api/visit/mascot-sprite-library/foret/assets/page.html'],
      ['delete', '/api/visit/mascot-sprite-library/assets/page.html'],
      ['patch', '/api/visit/mascot-sprite-library/assets/page.html'],
    ]) {
      const res = await call(method, url).send({ new_filename: 'b.png' });
      assert.equal(res.status, 400, `${method} ${url}`);
      assert.deepEqual(res.body, { error: 'Paramètres invalides' }, `${method} ${url}`);
    }
  });

  it('pack inconnu : 404, y compris quand le corps est invalide (le 404 passe avant)', async () => {
    const cases = [
      ['get', `/api/visit/mascot-packs/${UNKNOWN_UUID}`, {}],
      ['put', `/api/visit/mascot-packs/${UNKNOWN_UUID}`, { label: '' }],
      ['get', `/api/visit/mascot-packs/${UNKNOWN_UUID}/export.zip`, {}],
      ['delete', `/api/visit/mascot-packs/${UNKNOWN_UUID}`, {}],
      ['post', `/api/visit/mascot-packs/${UNKNOWN_UUID}/reset`, {}],
      ['get', `/api/visit/mascot-packs/${UNKNOWN_UUID}/assets`, {}],
      ['post', `/api/visit/mascot-packs/${UNKNOWN_UUID}/assets`, { filename: 'x.html' }],
      ['get', `/api/visit/mascot-packs/${UNKNOWN_UUID}/assets/a.png`, {}],
      ['delete', `/api/visit/mascot-packs/${UNKNOWN_UUID}/assets/a.png`, {}],
      ['patch', `/api/visit/mascot-packs/${UNKNOWN_UUID}/assets/a.png`, { new_filename: 'b.png' }],
    ];
    for (const [method, url, body] of cases) {
      const res = await call(method, url).send(body);
      assert.equal(res.status, 404, `${method} ${url}`);
      assert.deepEqual(res.body, { error: 'Pack introuvable' }, `${method} ${url}`);
    }
  });

  it('bibliothèque de sprites : entrée inconnue → 404', async () => {
    const del = await call('delete', '/api/visit/mascot-sprite-library/assets/absent-carac.png');
    assert.equal(del.status, 404);
    assert.deepEqual(del.body, { error: 'Entrée introuvable' });
    const get = await call('get', '/api/visit/mascot-sprite-library/assets/absent-carac.png');
    assert.equal(get.status, 404);
    assert.deepEqual(get.body, { error: 'Fichier introuvable' });
  });

  it('modèle catalogue inconnu : 404 avec la liste des modèles et le requestId', async () => {
    const res = await call('get', '/api/visit/mascot-catalog/inconnu/export.zip');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Modèle catalogue inconnu');
    assert.ok(Array.isArray(res.body.allowed_catalog_ids) && res.body.allowed_catalog_ids.length);
    assert.equal(res.body.requestId, REQ_ID);
  });
});

describe('Mascotte — contrôles des corps', () => {
  it('dépôt d’image dans un pack : champs requis, nom non image, contenu non image', async () => {
    const packId = await createPack();
    const url = `/api/visit/mascot-packs/${packId}/assets`;
    const cases = [
      [{}, 'filename et image_data requis'],
      [{ filename: 'a.png' }, 'filename et image_data requis'],
      [{ filename: 'a.png', image_data: '   ' }, 'filename et image_data requis'],
      [{ filename: 'x.html', image_data: HOSTILE_HTML_B64 }, 'filename et image_data requis'],
      [{ filename: 'x.svg', image_data: TINY_PNG_B64 }, 'filename et image_data requis'],
      [
        { filename: 'deguise.png', image_data: HOSTILE_HTML_B64 },
        'Format image non supporté (PNG, JPEG, WebP ou GIF)',
      ],
      [{ filename: 'vide.png', image_data: 'data:image/png;base64,' }, 'Image invalide'],
    ];
    for (const [body, message] of cases) {
      const res = await call('post', url).send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(res.body, { error: message }, JSON.stringify(body));
    }
    const ok = await uploadPackAsset(packId, 'vraie.png');
    assert.equal(ok.status, 201);
    assert.deepEqual(Object.keys(ok.body).sort(), ['filename', 'ok', 'preview_url', 'url']);
    assert.equal(ok.body.url, `/api/visit/mascot-packs/${packId}/assets/vraie.png`);
    assert.deepEqual(fs.readdirSync(packDir(packId)), ['vraie.png']);
  });

  it('bibliothèque de sprites : mêmes refus que le dépôt dans un pack', async () => {
    const url = '/api/visit/mascot-sprite-library/assets';
    const cases = [
      [{}, 'filename et image_data requis'],
      [{ filename: 'lib-x.html', image_data: HOSTILE_HTML_B64 }, 'filename et image_data requis'],
      [
        { filename: 'lib-deguise.png', image_data: HOSTILE_HTML_B64 },
        'Format image non supporté (PNG, JPEG, WebP ou GIF)',
      ],
    ];
    for (const [body, message] of cases) {
      const res = await call('post', url).send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(res.body, { error: message }, JSON.stringify(body));
    }
    const filename = `carac-${Date.now()}.png`;
    const ok = await call('post', url).send({ filename, image_data: TINY_PNG_B64 });
    createdSpriteFiles.push(filename);
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body, {
      ok: true,
      url: `/api/visit/mascot-sprite-library/assets/${filename}`,
      filename,
    });
  });

  it('renommage (pack et bibliothèque) : nom identique, nom non image, collision, fichier absent', async () => {
    const packId = await createPack();
    await uploadPackAsset(packId, 'a.png').expect(201);
    await uploadPackAsset(packId, 'b.png').expect(201);
    const base = `/api/visit/mascot-packs/${packId}/assets`;
    const same = await call('patch', `${base}/a.png`).send({ new_filename: 'a.png' });
    assert.equal(same.status, 400);
    assert.deepEqual(same.body, { error: 'Le nouveau nom est identique à l’actuel' });
    // N1 : impossible de renommer une image en page HTML.
    const html = await call('patch', `${base}/a.png`).send({ new_filename: 'a.html' });
    assert.equal(html.status, 400);
    assert.deepEqual(html.body, { error: 'Paramètres invalides' });
    const missingBody = await call('patch', `${base}/a.png`);
    assert.equal(missingBody.status, 400);
    assert.deepEqual(missingBody.body, { error: 'Paramètres invalides' });
    const collision = await call('patch', `${base}/a.png`).send({ new_filename: 'b.png' });
    assert.equal(collision.status, 409);
    assert.deepEqual(collision.body, { error: 'Un fichier porte déjà ce nom' });
    const absent = await call('patch', `${base}/zz.png`).send({ new_filename: 'yy.png' });
    assert.equal(absent.status, 404);
    assert.deepEqual(absent.body, { error: 'Fichier introuvable' });
    const renamed = await call('patch', `${base}/a.png`).send({ new_filename: 'c.png' });
    assert.equal(renamed.status, 200);
    assert.deepEqual(Object.keys(renamed.body).sort(), [
      'filename',
      'ok',
      'preview_url',
      'previous_filename',
      'url',
    ]);
    assert.deepEqual(fs.readdirSync(packDir(packId)).sort(), ['b.png', 'c.png']);

    const lib = '/api/visit/mascot-sprite-library/assets';
    const libName = `carac-ren-${Date.now()}.png`;
    await call('post', lib).send({ filename: libName, image_data: TINY_PNG_B64 }).expect(201);
    createdSpriteFiles.push(libName);
    const libHtml = await call('patch', `${lib}/${libName}`).send({ new_filename: 'lib.html' });
    assert.equal(libHtml.status, 400);
    assert.deepEqual(libHtml.body, { error: 'Paramètres invalides' });
    const libSame = await call('patch', `${lib}/${libName}`).send({ new_filename: libName });
    assert.equal(libSame.status, 400);
    assert.deepEqual(libSame.body, { error: 'Le nouveau nom est identique à l’actuel' });
    const libUnknown = await call('patch', `${lib}/absent-carac.png`).send({
      new_filename: 'autre.png',
    });
    assert.equal(libUnknown.status, 404);
    assert.deepEqual(libUnknown.body, { error: 'Entrée introuvable' });
  });

  it('corps absent (pas de JSON) : 500 « Erreur serveur » avec requestId sur les dépôts — défaut figé', async () => {
    const packId = await createPack();
    for (const url of [
      `/api/visit/mascot-packs/${packId}/assets`,
      '/api/visit/mascot-sprite-library/assets',
    ]) {
      const res = await call('post', url);
      assert.equal(res.status, 500, url);
      assert.deepEqual(res.body, { error: 'Erreur serveur', requestId: REQ_ID }, url);
    }
  });

  it('suppression d’un fichier catalogue statique : URL refusée ou absente', async () => {
    for (const body of [{}, { url: '/uploads/x.png' }, { url: '/assets/mascots/x.html' }]) {
      const res = await call('delete', '/api/visit/mascot-assets/public').send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(res.body, { error: 'URL invalide pour un asset catalogue statique' });
    }
    const noBody = await call('delete', '/api/visit/mascot-assets/public');
    assert.equal(noBody.status, 400);
    const absent = await call('delete', '/api/visit/mascot-assets/public').send({
      url: '/assets/mascots/absent-carac.png',
    });
    assert.equal(absent.status, 404);
    assert.deepEqual(absent.body, { error: 'Fichier introuvable' });
  });

  it('pack : libellé vidé → 400 ; réinitialisation d’un pack créé ici → 409 avec code et requestId', async () => {
    const packId = await createPack();
    const empty = await call('put', `/api/visit/mascot-packs/${packId}`).send({ label: '  ' });
    assert.equal(empty.status, 400);
    assert.deepEqual(empty.body, { error: 'label requis' });
    const reset = await call('post', `/api/visit/mascot-packs/${packId}/reset`);
    assert.equal(reset.status, 409);
    assert.equal(reset.body.code, 'visit_mascot_pack_not_builtin');
    assert.equal(reset.body.requestId, REQ_ID);
  });

  it('préférence de mascotte : 401 sans compte, 400 mascotte inconnue', async () => {
    const anon = await request(app)
      .put('/api/visit/mascot-preference')
      .send({ visit_mascot_catalog_id: 'x' });
    assert.equal(anon.status, 401);
    assert.deepEqual(anon.body, { error: 'Authentification requise' });
    const bad = await call('put', '/api/visit/mascot-preference').send({
      visit_mascot_catalog_id: 'mascotte-inexistante-carac',
    });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.body, { error: 'Mascotte indisponible pour la visite' });
    const cleared = await call('put', '/api/visit/mascot-preference').send({});
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body, { ok: true, visit_mascot_catalog_id: null });
  });
});

describe('Mascotte — archives ZIP', () => {
  it('import : mode invalide, archive absente, archive illisible (statut métier + requestId)', async () => {
    const url = '/api/visit/mascot-packs/import';
    const mode = await call('post', url).send({ mode: 'fusion' });
    assert.equal(mode.status, 400);
    assert.deepEqual(mode.body, { error: 'mode invalide (create ou replace)' });
    const none = await call('post', url).send({ mode: 'create' });
    assert.equal(none.status, 400);
    assert.deepEqual(none.body, { error: 'Archive ZIP requise' });
    const garbage = await call('post', url).send({
      archive: { fileDataBase64: Buffer.from('pas un zip').toString('base64') },
    });
    assert.equal(garbage.status, 400);
    assert.deepEqual(garbage.body, { error: 'Archive ZIP illisible', requestId: REQ_ID });

    const analyzeNone = await call('post', `${url}/analyze`).send({});
    assert.equal(analyzeNone.status, 400);
    assert.deepEqual(analyzeNone.body, {
      error: 'Archive ZIP requise (archive ou fileDataBase64)',
    });
    const analyzeGarbage = await call('post', `${url}/analyze`).send({
      archive: { fileDataBase64: Buffer.from('pas un zip').toString('base64') },
    });
    assert.equal(analyzeGarbage.status, 400);
    assert.deepEqual(analyzeGarbage.body, {
      error: 'Archive ZIP illisible',
      requestId: REQ_ID,
    });
  });

  it('export puis import : seules de vraies images sont posées (N1, chemin ZIP)', async () => {
    const packId = await createPack();
    await uploadPackAsset(packId, 'frame-a.png').expect(201);
    const exported = await call('get', `/api/visit/mascot-packs/${packId}/export.zip?unified=1`)
      .buffer(true)
      .parse(binaryParser);
    assert.equal(exported.status, 200);
    assert.equal(exported.headers['content-type'], 'application/zip');
    assert.match(exported.headers['content-disposition'], /^attachment; filename="mascot-pack-/);

    const zip = new AdmZip(exported.body);
    zip.addFile('assets/page.html', Buffer.from(HOSTILE_HTML));
    zip.addFile('assets/deguise.png', Buffer.from(HOSTILE_HTML));
    zip.addFile('assets/vraie-importee.png', Buffer.from(TINY_PNG_B64, 'base64'));
    const archive = { fileDataBase64: zip.toBuffer().toString('base64') };

    const replaceWithoutTarget = await call('post', '/api/visit/mascot-packs/import').send({
      mode: 'replace',
      archive,
    });
    assert.equal(replaceWithoutTarget.status, 400);
    assert.deepEqual(replaceWithoutTarget.body, { error: 'target_pack_id requis en mode replace' });

    const imported = await call('post', '/api/visit/mascot-packs/import').send({
      mode: 'create',
      archive,
      is_published: 0,
    });
    assert.equal(imported.status, 201);
    createdPackIds.push(imported.body.id);
    const files = fs.readdirSync(packDir(imported.body.id)).sort();
    assert.ok(files.includes('vraie-importee.png'));
    assert.ok(!files.includes('page.html'), 'pas de page HTML posée');
    assert.ok(!files.includes('deguise.png'), 'pas de faux PNG posé');
    assert.ok(files.every((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)));
  });
});

describe('Mascotte — politiques d’erreur des anciens try/catch', () => {
  it('table des packs absente : 503 traduit (code + requestId) sur les routes « packs »', async () => {
    const missing = sqlError(1146, 'ER_NO_SUCH_TABLE');
    const packId = await createPack();
    const urls = [
      ['get', '/api/visit/mascot-packs'],
      ['get', `/api/visit/mascot-packs/${packId}`],
      ['get', `/api/visit/mascot-packs/${packId}/export.zip`],
      ['get', `/api/visit/mascot-packs/${packId}/assets`],
      ['delete', `/api/visit/mascot-packs/${packId}/assets/a.png`],
      ['get', '/api/visit/mascot-assets'],
    ];
    await withSqlFault(/visit_mascot_packs/, missing, async () => {
      for (const [method, url] of urls) {
        const res = await call(method, url);
        assert.equal(res.status, 503, `${method} ${url}`);
        assert.equal(res.body.code, 'visit_mascot_packs_table_missing', `${method} ${url}`);
        assert.equal(res.body.requestId, REQ_ID, `${method} ${url}`);
      }
    });
  });

  it('table des sprites absente : 503 « sprites » ; sur /mascot-assets la famille « packs » l’emporte (défaut figé)', async () => {
    const missing = sqlError(1146, 'ER_NO_SUCH_TABLE');
    await withSqlFault(/visit_mascot_sprite_library/, missing, async () => {
      const list = await call('get', '/api/visit/mascot-sprite-library/assets');
      assert.equal(list.status, 503);
      assert.equal(list.body.code, 'visit_mascot_sprite_library_table_missing');
      assert.equal(list.body.requestId, REQ_ID);
      const file = await call('get', '/api/visit/mascot-sprite-library/assets/x.png');
      assert.equal(file.status, 503);
      assert.equal(file.body.code, 'visit_mascot_sprite_library_table_missing');
      const all = await call('get', '/api/visit/mascot-assets');
      assert.equal(all.status, 503);
      assert.equal(all.body.code, 'visit_mascot_packs_table_missing');
    });
  });

  it('panne non traduite : 500 « Erreur serveur » + requestId', async () => {
    const boom = new Error('panne simulée');
    await withSqlFault(/visit_mascot_packs/, boom, async () => {
      for (const [method, url] of [
        ['get', '/api/visit/mascot-packs'],
        ['get', `/api/visit/mascot-packs/${UNKNOWN_UUID}/assets/a.png`],
      ]) {
        const res = await call(method, url);
        assert.equal(res.status, 500, `${method} ${url}`);
        assert.deepEqual(res.body, { error: 'Erreur serveur', requestId: REQ_ID });
      }
    });
    await withSqlFault(/UPDATE users SET visit_mascot_catalog_id/, boom, async () => {
      const res = await call('put', '/api/visit/mascot-preference').send({});
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: 'Erreur serveur', requestId: REQ_ID });
    });
  });
});
