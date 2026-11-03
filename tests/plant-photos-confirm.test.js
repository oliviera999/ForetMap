require('./helpers/setup');
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initSchema, queryAll, execute } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const STAMP = Date.now();
const U = (s) => `https://example.org/photos/${s}-${STAMP}.jpg`;

describe('plant_photos — propose + confirm', () => {
  let token;
  const ids = [];

  before(async () => {
    await initSchema();
    token = await ensureAdminTeacherAuthToken();
  });

  after(async () => {
    for (const id of ids) await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  });

  test('propose intègre d’emblée des photos non confirmées ; confirm les valide', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Confirm photo ${STAMP}`, emoji: '🌿' })
      .expect(201);
    const plantId = created.body.id;
    assert.ok(plantId);
    ids.push(plantId);

    const url = U('propose');
    const proposed = await request(app)
      .post(`/api/plants/${plantId}/photos/propose`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        photos: [
          {
            kind: 'photo_species',
            url,
            credit: 'Alice',
            licence: 'CC BY 4.0',
            source: 'gbif_media',
            source_url: 'https://www.gbif.org/occurrence/1',
          },
        ],
      })
      .expect(200);

    assert.equal(proposed.body.inserted, 1);
    assert.ok(Array.isArray(proposed.body.photos));
    const pending = proposed.body.photos.find((p) => p.url === url);
    assert.ok(pending);
    assert.equal(pending.confirmed, false);
    assert.ok(pending.id);

    const rows = await queryAll(
      'SELECT confirmed FROM plant_photos WHERE plant_id = ? AND url = ?',
      [plantId, url],
    );
    assert.equal(Number(rows[0].confirmed), 0);

    const confirmed = await request(app)
      .post(`/api/plants/${plantId}/photos/${pending.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    assert.equal(confirmed.body.photo.confirmed, true);
    const after = await queryAll(
      'SELECT confirmed FROM plant_photos WHERE plant_id = ? AND id = ?',
      [plantId, pending.id],
    );
    assert.equal(Number(after[0].confirmed), 1);

    // Doublon : pas de seconde insertion
    const again = await request(app)
      .post(`/api/plants/${plantId}/photos/propose`)
      .set('Authorization', `Bearer ${token}`)
      .send({ photos: [{ kind: 'photo_species', url, credit: 'Alice', licence: 'CC BY 4.0' }] })
      .expect(200);
    assert.equal(again.body.inserted, 0);
  });

  test('une intégration fait avancer la révision : un PUT périmé n’efface pas les photos', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Revision photo ${STAMP}`, emoji: '🌿' })
      .expect(201);
    const plantId = created.body.id;
    ids.push(plantId);
    const before = Number(created.body.edit_revision) || 0;

    const url = U('revision');
    const proposed = await request(app)
      .post(`/api/plants/${plantId}/photos/propose`)
      .set('Authorization', `Bearer ${token}`)
      .send({ photos: [{ kind: 'photo_species', url, credit: 'Bob', licence: 'CC BY 4.0' }] })
      .expect(200);
    assert.equal(proposed.body.inserted, 1);
    assert.equal(Number(proposed.body.plant.edit_revision), before + 1);

    const stale = await request(app)
      .put(`/api/plants/${plantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: created.body.name,
        emoji: '🌿',
        photos: [],
        expected_revision: before,
      });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'edit_conflict');

    const rows = await queryAll('SELECT url, confirmed FROM plant_photos WHERE plant_id = ?', [
      plantId,
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, url);
    assert.equal(Number(rows[0].confirmed), 0);

    const confirmed = await request(app)
      .post(`/api/plants/${plantId}/photos/${proposed.body.photos[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    assert.equal(Number(confirmed.body.plant.edit_revision), before + 2);
  });

  test('une intégration en repli colonnes ne republie pas un crédit retiré ni n’efface un lien de colonne', async () => {
    const created = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Repli crédit ${STAMP}`, emoji: '🌿' })
      .expect(201);
    const plantId = created.body.id;
    ids.push(plantId);

    const keptUrl = U('kept');
    const columnOnlyUrl = U('column-only');
    const addedUrl = U('added');
    const publicCredit = 'Auteur publié';
    // Écart voulu : la colonne a été nettoyée (plus d’adresse), la ligne de table garde
    // l’ancienne attribution, et un second lien n’existe que dans la colonne.
    await execute('UPDATE plants SET photo = ?, photo_credit = ? WHERE id = ?', [
      `${keptUrl}\n${columnOnlyUrl}`,
      publicCredit,
      plantId,
    ]);
    await execute(
      `INSERT INTO plant_photos (plant_id, kind, url, credit, licence, source, sort_order, confirmed)
       VALUES (?, 'photo', ?, ?, 'CC BY-SA 3.0', 'wikimedia_commons', 0, 1)`,
      [plantId, keptUrl, 'Auteur publié auteur@example.test'],
    );

    const proposed = await request(app)
      .post(`/api/plants/${plantId}/photos/propose`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        photos: [
          {
            kind: 'photo_species',
            url: addedUrl,
            credit: 'Observateur',
            licence: 'CC BY 4.0',
            source: 'gbif_media',
          },
        ],
      })
      .expect(200);

    assert.equal(proposed.body.inserted, 1);
    assert.equal(proposed.body.plant.photo_credit, publicCredit);
    assert.equal(proposed.body.plant.photo.includes(keptUrl), true);
    assert.equal(proposed.body.plant.photo.includes(columnOnlyUrl), true);
    const credits = (proposed.body.photos || []).map((p) => String(p.credit || ''));
    assert.equal(
      credits.some((credit) => credit.includes('@')),
      false,
    );
    assert.equal(
      proposed.body.photos.some((p) => p.url === addedUrl && p.confirmed === false),
      true,
    );

    const stored = await queryAll('SELECT photo, photo_credit FROM plants WHERE id = ?', [plantId]);
    assert.equal(stored[0].photo_credit, publicCredit);
    assert.equal(String(stored[0].photo).includes(columnOnlyUrl), true);
    assert.equal(String(stored[0].photo_credit).includes('@'), false);
  });
});
