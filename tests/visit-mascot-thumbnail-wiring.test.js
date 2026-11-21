'use strict';

/**
 * Vignettes de mascotte branchées (lot J, audit UI/UX du 19/11/2026, constats U1 et U4).
 *
 * Contrats vérifiés :
 * - créer, enregistrer ou réinitialiser un pack écrit sa vignette (`_vignette.png`) ;
 * - `mascot_catalog[].thumbnail_url` (`/api/visit/content`) et le registre
 *   (`/api/visit/mascots`, `?light=1` compris) portent son URL, `null` sans vignette ;
 * - l'URL répond une image PNG, sans jeton, pour un pack publié ;
 * - un pack dont l'image manque s'enregistre quand même (aucune vignette, aucune erreur),
 *   et la vignette devenue fausse est retirée ;
 * - déposer ou supprimer une image du pack, importer une archive : vignette tenue à jour ;
 * - la vignette n'apparaît ni dans la liste des images du pack (studio) ni dans l'export.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const request = require('supertest');
const AdmZip = require('adm-zip');

const { initSchema, initDatabase } = require('../database');
const { app } = require('../server');
const { getAbsolutePath } = require('../lib/uploads');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  THUMBNAIL_FILENAME,
  THUMBNAIL_SIZE_PX,
  visitMascotPackThumbnailRelativePath,
  visitMascotPackThumbnailUrl,
} = require('../lib/visitMascotPackThumbnail');
const { buildVisitMascotCatalog } = require('../lib/visitContentMascots');

/** PNG 1 × 1, fabriqué à l'exécution (aucun binaire versionné). */
async function tinyPngBase64() {
  const buffer = await require('sharp')({
    create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return buffer.toString('base64');
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

let token;
const created = [];

function thumbnailPath(packId) {
  return getAbsolutePath(visitMascotPackThumbnailRelativePath(packId));
}

async function createPack(body) {
  const res = await request(app)
    .post('/api/visit/mascot-packs')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(201);
  created.push(res.body.id);
  return res.body;
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  token = await ensureAdminTeacherAuthToken({ elevated: true });
});

test.after(async () => {
  for (const id of created) {
    await request(app)
      .delete(`/api/visit/mascot-packs/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }
});

test('créer un pack à images écrit sa vignette, servie par le contenu et le registre', async () => {
  const pack = await createPack({
    clone_from_catalog_id: 'tan-bird-spritesheet',
    is_published: 1,
    label: 'Oiseau à vignette (test)',
  });
  assert.ok(fs.existsSync(thumbnailPath(pack.id)), 'vignette écrite à la création');
  const url = visitMascotPackThumbnailUrl(pack.id);

  const content = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  const row = content.body.mascot_catalog.find((m) => m.catalog_id === pack.catalog_id);
  assert.ok(row, 'le pack est proposé dans la Visite');
  assert.equal(row.thumbnail_url, url);
  assert.ok(
    content.body.mascot_catalog.every((m) => 'thumbnail_url' in m && !('pack' in m)),
    'chaque guide porte le champ, aucun n’embarque son JSON',
  );
  assert.ok(
    content.body.mascot_packs.every((m) => !('pack_uuid' in m)),
    'l’identifiant de ligne reste interne',
  );

  for (const path of ['/api/visit/mascots?light=1', '/api/visit/mascots']) {
    const registry = await request(app).get(path).expect(200);
    const entry = registry.body.mascots.find((m) => m.catalog_id === pack.catalog_id);
    assert.equal(entry.thumbnail_url, url, path);
  }

  // Sans jeton : la vignette d'un pack publié est publique, comme ses autres images.
  const image = await request(app).get(url).expect(200);
  assert.match(String(image.headers['content-type']), /^image\/png/);
  assert.ok(image.body.length > 0 && image.body.length < 30 * 1024, 'quelques kilo-octets');
  const meta = await require('sharp')(image.body).metadata();
  assert.ok(meta.width <= THUMBNAIL_SIZE_PX && meta.height <= THUMBNAIL_SIZE_PX);
});

test('la vignette ne figure pas parmi les images du pack', async () => {
  const pack = await createPack({
    clone_from_catalog_id: 'tan-bird-spritesheet',
    label: 'Liste (test)',
  });
  assert.ok(fs.existsSync(thumbnailPath(pack.id)));
  const res = await request(app)
    .get(`/api/visit/mascot-packs/${pack.id}/assets`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(!res.body.assets.some((a) => a.filename === THUMBNAIL_FILENAME));
});

test('enregistrer régénère la vignette ; un pack dont l’image manque s’enregistre et la retire', async () => {
  const pack = await createPack({
    clone_from_catalog_id: 'tan-bird-spritesheet',
    is_published: 1,
    label: 'Enregistrement (test)',
  });
  fs.rmSync(thumbnailPath(pack.id), { force: true });

  await request(app)
    .put(`/api/visit/mascot-packs/${pack.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ label: 'Enregistrement bis (test)' })
    .expect(200);
  assert.ok(fs.existsSync(thumbnailPath(pack.id)), 'vignette refaite à l’enregistrement');

  // Image de l'état `idle` retirée du pack (l'image désignée n'existe pas) : l'enregistrement réussit quand
  // même, et la vignette qui montrait l'ancienne image est retirée.
  const saved = await request(app)
    .put(`/api/visit/mascot-packs/${pack.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      pack: {
        ...pack.pack,
        stateFrames: {
          ...pack.pack.stateFrames,
          idle: {
            ...pack.pack.stateFrames.idle,
            srcs: [`/api/visit/mascot-packs/${pack.id}/assets/absente.png`],
          },
        },
      },
    })
    .expect(200);
  assert.equal(saved.body.id, pack.id);
  assert.ok(!fs.existsSync(thumbnailPath(pack.id)), 'vignette devenue fausse : retirée');

  const content = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  const row = content.body.mascot_catalog.find((m) => m.catalog_id === pack.catalog_id);
  assert.equal(row.thumbnail_url, null, 'sans vignette : repli sur la silhouette');
});

test('déposer une image puis importer une archive : vignette écrite, jamais exportée', async () => {
  const pack = await createPack({ is_published: 0, label: 'Archive (test)' });
  const framesBase = `/api/visit/mascot-packs/${pack.id}/assets/`;
  await request(app)
    .put(`/api/visit/mascot-packs/${pack.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      pack: {
        ...pack.pack,
        framesBase,
        stateFrames: { idle: { files: ['trame.png'], fps: 4 } },
      },
    })
    .expect(200);
  assert.ok(!fs.existsSync(thumbnailPath(pack.id)), 'image pas encore déposée');

  await request(app)
    .post(`/api/visit/mascot-packs/${pack.id}/assets`)
    .set('Authorization', `Bearer ${token}`)
    .send({ filename: 'trame.png', image_data: await tinyPngBase64() })
    .expect(201);
  assert.ok(fs.existsSync(thumbnailPath(pack.id)), 'vignette écrite au dépôt de l’image');

  const exported = await request(app)
    .get(`/api/visit/mascot-packs/${pack.id}/export.zip`)
    .set('Authorization', `Bearer ${token}`)
    .buffer(true)
    .parse(binaryParser)
    .expect(200);
  const names = new AdmZip(exported.body).getEntries().map((entry) => entry.entryName);
  assert.ok(
    names.some((name) => name.endsWith('trame.png')),
    'l’image du pack est exportée',
  );
  assert.ok(!names.some((name) => name.includes(THUMBNAIL_FILENAME)), 'pas la vignette');

  const imported = await request(app)
    .post('/api/visit/mascot-packs/import')
    .set('Authorization', `Bearer ${token}`)
    .send({ mode: 'create', archive: { fileDataBase64: exported.body.toString('base64') } })
    .expect(201);
  created.push(imported.body.id);
  assert.ok(fs.existsSync(thumbnailPath(imported.body.id)), 'vignette écrite à l’import');

  await request(app)
    .delete(`/api/visit/mascot-packs/${pack.id}/assets/trame.png`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(!fs.existsSync(thumbnailPath(pack.id)), 'image supprimée : vignette retirée');
});

test('catalogue léger : vignette résolue par identifiant de ligne, jamais inventée', () => {
  const seen = [];
  const catalog = buildVisitMascotCatalog(
    [
      { id: 'a', label: 'A', pack: {}, pack_uuid: 'uuid-a' },
      { id: 'b', label: 'B', pack: {}, pack_uuid: 'uuid-b' },
      { id: 'c', label: 'C', pack: {} },
    ],
    (uuid) => {
      seen.push(uuid);
      return uuid === 'uuid-a' ? '/vignette-a.png' : null;
    },
  );
  assert.deepEqual(
    catalog.map((m) => m.thumbnail_url),
    ['/vignette-a.png', null, null],
  );
  assert.deepEqual(seen, ['uuid-a', 'uuid-b']);
});
