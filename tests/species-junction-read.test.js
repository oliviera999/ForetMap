'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  livingBeingsListFromSpecies,
  attachSpeciesToEntity,
  speciesReadFromJunctionEnabled,
} = require('../lib/speciesJunction');

async function getAdminAuthToken() {
  return ensureAdminTeacherAuthToken({ elevated: true });
}

test('livingBeingsListFromSpecies — junction prioritaire sur JSON obsolète', () => {
  const prev = process.env.FORETMAP_SPECIES_READ_JUNCTION;
  process.env.FORETMAP_SPECIES_READ_JUNCTION = '1';
  try {
    assert.ok(speciesReadFromJunctionEnabled());
    const list = livingBeingsListFromSpecies(
      [{ id: 1, name: 'Chêne', emoji: '🌳' }],
      '["VieuxNom"]',
      '',
    );
    assert.deepStrictEqual(list, ['Chêne']);
  } finally {
    if (prev === undefined) delete process.env.FORETMAP_SPECIES_READ_JUNCTION;
    else process.env.FORETMAP_SPECIES_READ_JUNCTION = prev;
  }
});

test('livingBeingsListFromSpecies — repli JSON si junction vide', () => {
  const list = livingBeingsListFromSpecies([], '["Menthe","Tomate"]', '');
  assert.deepStrictEqual(list, ['Menthe', 'Tomate']);
});

test('attachSpeciesToEntity — expose species et living_beings_list sans living_beings', () => {
  const entity = attachSpeciesToEntity(
    { id: 5, living_beings: '["Legacy"]' },
    [{ id: 10, name: 'Abeille', emoji: '🐝' }],
    { legacySingleName: '' },
  );
  assert.deepStrictEqual(entity.living_beings_list, ['Abeille']);
  assert.deepStrictEqual(entity.species_ids, [10]);
  assert.equal(entity.living_beings, undefined);
});

async function ensurePlant(name, emoji = '🌱') {
  const existing = await queryOne('SELECT id FROM plants WHERE name = ? LIMIT 1', [name]);
  if (existing?.id) return existing.id;
  const res = await execute('INSERT INTO plants (name, emoji) VALUES (?, ?)', [name, emoji]);
  return res.insertId;
}

test('GET zone — living_beings_list depuis zone_species si JSON divergent', async () => {
  await initSchema();
  const token = await getAdminAuthToken();
  const stamp = Date.now();

  const mentheId = await ensurePlant('Menthe', '🌱');
  const tomateId = await ensurePlant('Tomate', '🍅');

  const created = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Zone junction read ${stamp}`,
      map_id: 'foret',
      points: [
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 15, yp: 20 },
      ],
      species_ids: [mentheId, tomateId],
    })
    .expect(201);

  const zoneId = created.body.id;

  const fetched = await request(app).get(`/api/zones/${zoneId}`).expect(200);
  assert.ok(fetched.body.living_beings_list.includes('Menthe'));
  assert.ok(fetched.body.living_beings_list.includes('Tomate'));
  assert.equal(fetched.body.living_beings, undefined);
});
