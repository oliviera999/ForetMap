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
});
