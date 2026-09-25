'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initSchema, queryAll } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

test.before(async () => {
  await initSchema();
});

test('POST/PUT /api/plants — map_ids (rattachement direct à une carte)', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const stamp = Date.now();
  const name = `Merle map ${stamp}`;

  const created = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: ['foret'] })
    .expect(201);

  assert.ok(created.body.id);
  assert.deepEqual(created.body.map_ids, ['foret']);

  const rows = await queryAll('SELECT map_id FROM map_species WHERE plant_id = ? ORDER BY map_id', [
    created.body.id,
  ]);
  assert.deepEqual(
    rows.map((r) => r.map_id),
    ['foret'],
  );

  const list = await request(app).get('/api/plants').expect(200);
  const fromList = list.body.find((p) => Number(p.id) === Number(created.body.id));
  assert.ok(fromList);
  assert.ok(Array.isArray(fromList.map_ids));
  assert.ok(fromList.map_ids.includes('foret'));

  const updated = await request(app)
    .put(`/api/plants/${created.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: [] })
    .expect(200);
  assert.deepEqual(updated.body.map_ids, []);

  const after = await queryAll('SELECT map_id FROM map_species WHERE plant_id = ?', [
    created.body.id,
  ]);
  assert.equal(after.length, 0);
});

test('PUT /api/plants/:id — un map_id inconnu ne vide pas les rattachements valides', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const stamp = Date.now();
  const name = `Merle stale ${stamp}`;

  const created = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: ['foret'] })
    .expect(201);

  // L'id inexistant est en tête : sans filtre + transaction, le DELETE commité
  // puis l'INSERT FK laissait la fiche sans aucune carte.
  const updated = await request(app)
    .put(`/api/plants/${created.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: [`carte-absente-${stamp}`, 'foret'] })
    .expect(200);

  assert.deepEqual(updated.body.map_ids, ['foret']);
  const rows = await queryAll('SELECT map_id FROM map_species WHERE plant_id = ? ORDER BY map_id', [
    created.body.id,
  ]);
  assert.deepEqual(
    rows.map((r) => r.map_id),
    ['foret'],
  );
});

// Audit du 25/09/2026, § 1.3.4 — le formulaire de fiche envoie toujours `map_ids` (y compris
// à l'enregistrement automatique) ; la synchronisation DELETE + INSERT effaçait à chaque fois
// le registre éditorial de la carte (présence, phénologie, fréquence, validation, notes).
test('PUT /api/plants/:id — le registre map_species d’une carte conservée est préservé', async () => {
  const token = await ensureAdminTeacherAuthToken({ elevated: true });
  const stamp = Date.now();
  const name = `Merle registre ${stamp}`;
  const { execute } = require('../database');

  const created = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: ['foret'] })
    .expect(201);
  const plantId = created.body.id;

  await execute(
    `UPDATE map_species
        SET presence_status = 'resident', months_present = '3,4,5', detection_mode = 'vue,chant',
            frequency = 'commun', validation_status = 'confirme_site', site_notes = 'Haie nord'
      WHERE plant_id = ? AND map_id = 'foret'`,
    [plantId],
  );

  // Même carte + une nouvelle : la ligne existante ne bouge pas, la nouvelle prend les défauts.
  await request(app)
    .put(`/api/plants/${plantId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: ['foret', 'n3'] })
    .expect(200);

  const rows = await queryAll(
    `SELECT map_id, presence_status, months_present, detection_mode, frequency,
            validation_status, site_notes
       FROM map_species WHERE plant_id = ? ORDER BY map_id`,
    [plantId],
  );
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    [
      {
        map_id: 'foret',
        presence_status: 'resident',
        months_present: '3,4,5',
        detection_mode: 'vue,chant',
        frequency: 'commun',
        validation_status: 'confirme_site',
        site_notes: 'Haie nord',
      },
      {
        map_id: 'n3',
        presence_status: null,
        months_present: null,
        detection_mode: null,
        frequency: null,
        validation_status: 'attendu',
        site_notes: null,
      },
    ],
  );

  // Retirer une carte ne touche que sa ligne.
  await request(app)
    .put(`/api/plants/${plantId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name, emoji: '🐦', map_ids: ['foret'] })
    .expect(200);
  const after = await queryAll(
    'SELECT map_id, validation_status FROM map_species WHERE plant_id = ? ORDER BY map_id',
    [plantId],
  );
  assert.deepEqual(
    after.map((r) => ({ ...r })),
    [{ map_id: 'foret', validation_status: 'confirme_site' }],
  );
});
