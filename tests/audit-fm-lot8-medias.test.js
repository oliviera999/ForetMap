'use strict';

// Audit ForetMap du 19/11/2026, lot 8 — médiathèque, médias de Visite, fiches espèces.
// Chaque test rejoue le scénario du constat (docs/AUDIT_BUGS_FORETMAP_2026-11-19.md, § 5).

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { UPLOADS_DIR, saveBase64ToDisk } = require('../lib/uploads');
const {
  saveMediaFromBuffer,
  listMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
  mediaLibraryItemApp,
  resolveMediaByStableKey,
  loadMediaKeyIndex,
} = require('../lib/mediaLibrary');
const {
  KEYS_INDEX_FILE,
  MEDIA_LIBRARY_DIR,
  syncAssetManifests,
} = require('../lib/glAssetManifest');

const STAMP = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCABAAEADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAIDBP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//Z';

const createdMedia = [];
const exists = (rel) => fs.existsSync(path.join(UPLOADS_DIR, rel));

async function makeMedia(app, fileName) {
  const item = await saveMediaFromBuffer(PNG_1PX, 'image/png', fileName, { app });
  createdMedia.push(item.relativePath);
  return item;
}

after(() => {
  for (const rel of createdMedia) {
    const abs = path.join(UPLOADS_DIR, rel);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  // Retire de l'index les entrées laissées par ces tests.
  const indexPath = path.join(MEDIA_LIBRARY_DIR, KEYS_INDEX_FILE);
  const index = loadMediaKeyIndex();
  let changed = false;
  for (const [key, entry] of Object.entries(index)) {
    if (createdMedia.includes(entry?.relativePath) || key.includes(STAMP)) {
      delete index[key];
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  syncAssetManifests();
});

describe('C2 — clés de médiathèque : un envoi ForetMap a sa propre clé', () => {
  test('deux envois ForetMap « photo.jpg » gardent chacun leur étiquette', async () => {
    const name = `photo-c2-${STAMP}.png`;
    const first = await makeMedia('foretmap', name);
    const second = await makeMedia('foretmap', name);

    assert.equal(mediaLibraryItemApp(first.relativePath), 'foretmap');
    assert.equal(mediaLibraryItemApp(second.relativePath), 'foretmap');
    const listed = listMediaLibraryItems(800, { app: 'foretmap' }).map((i) => i.relativePath);
    assert.ok(listed.includes(first.relativePath), 'le premier envoi doit rester dans ForetMap');
    assert.ok(listed.includes(second.relativePath));
    const glListed = listMediaLibraryItems(800, { app: 'gl' }).map((i) => i.relativePath);
    assert.ok(
      !glListed.includes(first.relativePath),
      'le premier envoi ne passe pas « hérité G&L »',
    );

    // ForetMap peut toujours supprimer son premier envoi.
    executeMediaLibraryDeleteRequest({ relative_path: first.relativePath }, { app: 'foretmap' });
    assert.ok(!exists(first.relativePath));
    // Le libellé d'origine reste affiché ; la clé est propre au fichier.
    const item = listMediaLibraryItems(800, { app: 'foretmap' }).find(
      (i) => i.relativePath === second.relativePath,
    );
    assert.equal(item.label, name);
    assert.equal(item.stableKey, `foretmap:${second.relativePath}`);
    assert.equal(second.stableKey, `foretmap:${second.relativePath}`);
  });

  test('un envoi ForetMap nommé comme une ressource du jeu ne détourne pas sa résolution', async () => {
    const name = `ressource-c2-${STAMP}.png`;
    const key = `ressource-c2-${STAMP}`;
    const gl = await makeMedia('gl', name);
    assert.equal(resolveMediaByStableKey(key)?.relativePath, gl.relativePath);

    const foret = await makeMedia('foretmap', name);
    assert.equal(
      resolveMediaByStableKey(key)?.relativePath,
      gl.relativePath,
      'la ressource du jeu doit rester résolue vers le fichier G&L',
    );
    assert.equal(mediaLibraryItemApp(gl.relativePath), 'gl');
    assert.equal(mediaLibraryItemApp(foret.relativePath), 'foretmap');
  });

  test('une entrée ForetMap héritée (clé tirée du nom) garde son étiquette face au jeu', async () => {
    const name = `herite-c2-${STAMP}.png`;
    const key = `herite-c2-${STAMP}`;
    const foret = await makeMedia('foretmap', name);
    // Simule une entrée écrite avant la correction : clé tirée du nom, étiquette « foretmap ».
    const indexPath = path.join(MEDIA_LIBRARY_DIR, KEYS_INDEX_FILE);
    const index = loadMediaKeyIndex();
    for (const [k, entry] of Object.entries(index)) {
      if (entry?.relativePath === foret.relativePath) delete index[k];
    }
    index[key] = { relativePath: foret.relativePath, originalName: name, app: 'foretmap' };
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    assert.equal(mediaLibraryItemApp(foret.relativePath), 'foretmap');
    assert.equal(resolveMediaByStableKey(key), null, 'un média ForetMap n’est pas une ressource');

    const gl = await makeMedia('gl', name);
    assert.equal(mediaLibraryItemApp(foret.relativePath), 'foretmap');
    assert.equal(resolveMediaByStableKey(key)?.relativePath, gl.relativePath);
  });

  test('un média sans étiquette reste lu comme hérité G&L', async () => {
    const legacy = await makeMedia(null, `sans-etiquette-${STAMP}.png`);
    assert.equal(mediaLibraryItemApp(legacy.relativePath), 'gl');
    assert.equal(
      resolveMediaByStableKey(`sans-etiquette-${STAMP}`)?.relativePath,
      legacy.relativePath,
    );
  });
});

describe('C3 — appartenance d’un média : chemin normalisé', () => {
  test('« /media-library/… », « // » ou « ./ » ne font pas passer un média ForetMap pour G&L', async () => {
    const foret = await makeMedia('foretmap', `c3-${STAMP}.png`);
    const rel = foret.relativePath;
    const variants = [
      `/${rel}`,
      rel.replace('media-library/', 'media-library//'),
      rel.replace('media-library/', 'media-library/./'),
      rel.replace(/\//g, '\\'),
    ];
    for (const variant of variants) {
      assert.equal(mediaLibraryItemApp(variant), 'foretmap', variant);
      assert.throws(
        () => executeMediaLibraryDeleteRequest({ relative_path: variant }, { app: 'gl' }),
        /autre médiathèque/i,
        variant,
      );
      assert.throws(
        () => executeMediaLibraryDeleteRequest({ relative_paths: [variant] }, { app: 'gl' }),
        /autre médiathèque/i,
      );
    }
    assert.ok(exists(rel), 'le fichier ForetMap doit être intact');
    // Le propriétaire supprime avec un chemin non canonique : fichier et clé partent.
    executeMediaLibraryDeleteRequest({ relative_path: `/${rel}` }, { app: 'foretmap' });
    assert.ok(!exists(rel));
    assert.ok(!Object.values(loadMediaKeyIndex()).some((e) => e?.relativePath === rel));
  });
});

describe('C8 — uploads : contenu non textuel', () => {
  test('saveBase64ToDisk refuse une valeur non textuelle en 400 (pas de TypeError)', async () => {
    await assert.rejects(
      () => saveBase64ToDisk(`audit-lot8/${STAMP}.jpg`, 12345),
      (err) => err.status === 400 && err.expose === true && !(err instanceof TypeError),
    );
    await assert.rejects(
      () => saveBase64ToDisk(`audit-lot8/${STAMP}.jpg`, { a: 1 }),
      (err) => err.status === 400,
    );
  });
});

describe('routes', () => {
  let token;
  const plantIds = [];
  const markerIds = [];

  before(async () => {
    await initSchema();
    token = await ensureAdminTeacherAuthToken({ elevated: true });
  });

  after(async () => {
    for (const id of plantIds) {
      await request(app).delete(`/api/plants/${id}`).set('Authorization', `Bearer ${token}`);
    }
    for (const id of markerIds) {
      await execute('DELETE FROM visit_media WHERE target_type = ? AND target_id = ?', [
        'marker',
        id,
      ]).catch(() => {});
      await execute('DELETE FROM visit_markers WHERE id = ?', [id]).catch(() => {});
    }
  });

  test('C5 — remplacer l’image d’un média de Visite par un contenu invalide garde l’ancienne', async () => {
    const marker = await request(app)
      .post('/api/visit/markers')
      .set('Authorization', `Bearer ${token}`)
      .send({ map_id: 'foret', x_pct: 40, y_pct: 40, label: `Lot 8 C5 ${STAMP}`, emoji: '📷' })
      .expect(201);
    markerIds.push(marker.body.id);
    const media = await request(app)
      .post('/api/visit/media')
      .set('Authorization', `Bearer ${token}`)
      .send({
        target_type: 'marker',
        target_id: marker.body.id,
        image_data: `data:image/jpeg;base64,${TINY_JPEG_B64}`,
        caption: 'avant',
      })
      .expect(201);
    const id = media.body.id;
    await request(app).get(`/api/visit/media/${id}/data`).expect(200);

    await request(app)
      .put(`/api/visit/media/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ image_data: 'data:image/jpeg;base64,AAAAAAAA' })
      .expect(400);
    await request(app).get(`/api/visit/media/${id}/data`).expect(200);

    // Remplacement valide : toujours servi, sans fichier temporaire résiduel.
    await request(app)
      .put(`/api/visit/media/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ image_data: `data:image/jpeg;base64,${TINY_JPEG_B64}` })
      .expect(200);
    await request(app).get(`/api/visit/media/${id}/data`).expect(200);
    const leftovers = fs
      .readdirSync(path.join(UPLOADS_DIR, 'visit_media'))
      .filter((f) => f.startsWith(`${id}.`) && f.includes('.tmp'));
    assert.deepEqual(leftovers, []);
  });

  test('C7 — téléverser une photo d’espèce incrémente la révision et la renvoie', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Lot 8 C7 ${STAMP}` })
      .expect(201);
    const id = created.body.id;
    plantIds.push(id);
    const before = Number(
      (await queryOne('SELECT edit_revision FROM plants WHERE id = ?', [id])).edit_revision,
    );
    const png = `data:image/png;base64,${PNG_1PX.toString('base64')}`;
    const up = await request(app)
      .post(`/api/plants/${id}/photo-upload`)
      .set('Authorization', `Bearer ${token}`)
      .send({ field: 'photo', imageData: png })
      .expect(200);
    assert.equal(Number(up.body.edit_revision), before + 1);
    assert.equal(Number(up.body.plant.edit_revision), before + 1);

    // Un formulaire ouvert avant l'envoi est refusé au lieu d'effacer la photo.
    const stale = await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Lot 8 C7 ${STAMP}`, photos: [], expected_revision: before })
      .expect(409);
    assert.equal(stale.body.code, 'edit_conflict');
    const row = await queryOne('SELECT photo FROM plants WHERE id = ?', [id]);
    assert.equal(row.photo, up.body.url);

    // Le formulaire qui a adopté la révision renvoyée enregistre normalement.
    await request(app)
      .put(`/api/plants/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'ok', expected_revision: up.body.edit_revision })
      .expect(200);
  });

  test('C10 — import d’espèces : entrées invalides en 400 avec message', async () => {
    const cases = [
      [{ gsheetUrl: 'pas une url' }, /URL Google Sheet invalide/],
      [{ fileDataBase64: 'data:text/csv;base64,' }, /Fichier import vide/],
      [{}, /Aucune source/],
    ];
    for (const [body, pattern] of cases) {
      const res = await request(app)
        .post('/api/plants/import')
        .set('Authorization', `Bearer ${token}`)
        .send({ dryRun: true, ...body })
        .expect(400);
      assert.match(res.body.error, pattern);
    }
  });
});
