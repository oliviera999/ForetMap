'use strict';

/**
 * Périmètre du réseau trophique (chantier collège du 22/11/2026, lot 1) : ressources toujours
 * dans le périmètre, cartes où vit une extrémité hors périmètre (`from_elsewhere` /
 * `to_elsewhere`), carte sans espèce, et cartes d'une espèce (`GET /api/food-web/species/:id/maps`).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, execute } = require('../database');
const { app } = require('../server');
const { FOODWEB_ALWAYS_IN_SCOPE_ENTITY_KINDS } = require('../lib/shared/biodivEnums');

const stamp = `${Date.now()}`.slice(-9);
const mapHere = `fws-here-${stamp}`;
const mapThere = `fws-there-${stamp}`;
const mapEmpty = `fws-empty-${stamp}`;
const mapHidden = `fws-hidden-${stamp}`;
const ids = {};
const links = {};

async function plant(name, kind = 'taxon') {
  const res = await execute('INSERT INTO plants (name, emoji, entity_kind) VALUES (?, ?, ?)', [
    `${name} ${stamp}`,
    '🌿',
    kind,
  ]);
  return res.insertId;
}

async function link(from, to, type) {
  const res = await execute(
    `INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
     VALUES (?, ?, ?, '')`,
    [from, to, type],
  );
  return res.insertId;
}

test.before(async () => {
  await initSchema();
  for (const [id, label, active] of [
    [mapHere, 'Ici', 1],
    [mapThere, 'Là-bas', 1],
    [mapEmpty, 'Vide', 1],
    [mapHidden, 'Inactive', 0],
  ]) {
    await execute(
      `INSERT INTO maps (id, label, sort_order, is_active) VALUES (?, ?, 990, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = VALUES(is_active)`,
      [id, `${label} ${stamp}`, active],
    );
  }
  ids.worm = await plant('Ver test');
  ids.compost = await plant('Compost test', 'ressource');
  ids.biofilm = await plant('Biofilm test', 'consortium');
  ids.bird = await plant('Oiseau test');
  ids.orphan = await plant('Orphelin test');
  ids.unlinked = await plant('Sans lien test');

  // Ver présent « ici » (registre) ; oiseau présent « là-bas » (registre) et sur la carte
  // inactive ; orphelin sur aucune carte.
  await execute('INSERT INTO map_species (map_id, plant_id) VALUES (?, ?), (?, ?), (?, ?)', [
    mapHere,
    ids.worm,
    mapThere,
    ids.bird,
    mapHidden,
    ids.bird,
  ]);

  links.compost = await link(ids.worm, ids.compost, 'detritivorie');
  links.biofilm = await link(ids.worm, ids.biofilm, 'detritivorie');
  links.bird = await link(ids.worm, ids.bird, 'predation');
  links.orphan = await link(ids.orphan, ids.worm, 'predation');
  // Lien entre deux fiches absentes de la carte « ici » (ressource + oiseau) : non retenu.
  links.away = await link(ids.bird, ids.compost, 'excretion');
});

async function itemsFor(mapId) {
  const res = await request(app).get(`/api/food-web?mapId=${encodeURIComponent(mapId)}`);
  assert.strictEqual(res.status, 200);
  return res.body.items;
}

test('natures toujours dans le périmètre : toutes sauf taxon', () => {
  assert.deepStrictEqual([...FOODWEB_ALWAYS_IN_SCOPE_ENTITY_KINDS].sort(), [
    'consortium',
    'groupe_fonctionnel',
    'ressource',
  ]);
});

test('une ressource ou un consortium lié est dans le périmètre de la carte', async () => {
  const items = await itemsFor(mapHere);
  for (const key of ['compost', 'biofilm']) {
    const row = items.find((r) => Number(r.id) === links[key]);
    assert.ok(row, `lien vers ${key} retourné`);
    assert.strictEqual(Number(row.from_in_scope), 1);
    assert.strictEqual(Number(row.to_in_scope), 1, `${key} jamais hors carte`);
    assert.deepStrictEqual(row.to_elsewhere, []);
  }
  assert.ok(
    !items.some((r) => Number(r.id) === links.away),
    'une ressource seule ne fait pas entrer les liens d’autres lieux',
  );
});

test('extrémité hors périmètre : cartes actives où elle vit (`*_elsewhere`)', async () => {
  const items = await itemsFor(mapHere);
  const bird = items.find((r) => Number(r.id) === links.bird);
  assert.strictEqual(Number(bird.to_in_scope), 0);
  assert.deepStrictEqual(bird.to_elsewhere, [{ id: mapThere, label: `Là-bas ${stamp}` }]);
  assert.deepStrictEqual(bird.from_elsewhere, []);

  const orphan = items.find((r) => Number(r.id) === links.orphan);
  assert.strictEqual(Number(orphan.from_in_scope), 0);
  assert.deepStrictEqual(orphan.from_elsewhere, [], 'aucune carte : liste vide');
  assert.deepStrictEqual(orphan.to_elsewhere, []);
});

test('carte sans espèce : aucune relation', async () => {
  const items = await itemsFor(mapEmpty);
  assert.deepStrictEqual(items, []);
});

test('GET /api/food-web/species/:id/maps — cartes actives de l’espèce', async () => {
  const res = await request(app).get(`/api/food-web/species/${ids.bird}/maps`).expect(200);
  assert.strictEqual(res.body.plantId, ids.bird);
  assert.deepStrictEqual(res.body.maps, [{ id: mapThere, label: `Là-bas ${stamp}` }]);

  const none = await request(app).get(`/api/food-web/species/${ids.unlinked}/maps`).expect(200);
  assert.deepStrictEqual(none.body.maps, []);

  await request(app).get('/api/food-web/species/999999999/maps').expect(404);
  await request(app).get('/api/food-web/species/abc/maps').expect(400);
});
