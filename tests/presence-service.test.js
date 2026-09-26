'use strict';

/**
 * Service de présence des espèces (`lib/biodiv/presenceService.js`, décision Q10).
 *
 * Fonctions pures (canaux, sous-requêtes, filtrage des lieux, comptes) puis lectures en base
 * sur une carte dédiée : liste par carte et par zone, question « X est-elle présente sur
 * Y ? », équivalence entre la sous-requête SQL et la liste, et non-régression du registre
 * (la synchronisation différentielle du lot P0 conserve les données éditoriales).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const presence = require('../lib/biodiv/presenceService');

const db = { queryAll, queryOne };
const suffix = crypto.randomUUID().slice(0, 8);
const MAP_ID = `psvc-${suffix}`;
const OTHER_MAP_ID = `psvc2-${suffix}`;
const ZONE_1 = `psvc-z1-${suffix}`;
const ZONE_2 = `psvc-z2-${suffix}`;
const MARKER = `psvc-m-${suffix}`;
const plants = {};

async function insertPlant(key, name) {
  const res = await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
    name,
    '🌿',
    'Espèce du test de service de présence.',
  ]);
  plants[key] = Number(res.insertId);
}

before(async () => {
  await initSchema();
  for (const id of [MAP_ID, OTHER_MAP_ID]) {
    await execute(
      `INSERT INTO maps (id, label, map_image_url, sort_order, is_active)
       VALUES (?, ?, '/maps/map-foret.svg', 997, 1)`,
      [id, `Carte service ${id}`],
    );
  }
  // Noms choisis pour vérifier l'ordre alphabétique français (accents, casse).
  await insertPlant('ortie', `ortie ${suffix}`);
  await insertPlant('erable', `Érable ${suffix}`);
  await insertPlant('merle', `Merle ${suffix}`);
  await insertPlant('absente', `Absente ${suffix}`);

  for (const [zoneId, name] of [
    [ZONE_1, 'Haie'],
    [ZONE_2, 'Bosquet'],
  ]) {
    await execute(
      `INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color)
       VALUES (?, ?, ?, 0, 0, 0, 0, '', 'growing', 0, 'rect', '[]', '#86efac90')`,
      [zoneId, MAP_ID, `${name} ${suffix}`],
    );
  }
  // L'ortie est dans deux zones : deux lieux, une seule espèce.
  for (const [zoneId, key] of [
    [ZONE_1, 'ortie'],
    [ZONE_2, 'ortie'],
    [ZONE_2, 'erable'],
  ]) {
    await execute('INSERT INTO zone_species (zone_id, plant_id) VALUES (?, ?)', [
      zoneId,
      plants[key],
    ]);
  }
  await execute(
    `INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, note, emoji)
     VALUES (?, ?, 50, 50, ?, '', '', '📍')`,
    [MARKER, MAP_ID, `Nichoir ${suffix}`],
  );
  await execute('INSERT INTO marker_species (marker_id, plant_id) VALUES (?, ?)', [
    MARKER,
    plants.merle,
  ]);
  await execute(
    `INSERT INTO map_species (map_id, plant_id, validation_status, presence_status)
     VALUES (?, ?, 'confirme_site', 'resident'), (?, ?, 'documentaire', NULL)`,
    [MAP_ID, plants.merle, OTHER_MAP_ID, plants.absente],
  );
});

after(async () => {
  const ids = Object.values(plants);
  if (ids.length) {
    await execute(`DELETE FROM plants WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
  }
  await execute('DELETE FROM map_markers WHERE map_id = ?', [MAP_ID]);
  await execute('DELETE FROM zones WHERE map_id = ?', [MAP_ID]);
  await execute('DELETE FROM maps WHERE id IN (?, ?)', [MAP_ID, OTHER_MAP_ID]);
});

test('canaux : liste stricte, liste tolérante, ordre canonique', () => {
  assert.deepEqual(presence.ALL_PRESENCE_SOURCES, ['registre', 'zone', 'repere']);
  assert.deepEqual(presence.parsePresenceSources(undefined), {
    ok: true,
    sources: ['registre', 'zone', 'repere'],
  });
  assert.deepEqual(presence.parsePresenceSources('repere, registre'), {
    ok: true,
    sources: ['registre', 'repere'],
  });
  assert.deepEqual(presence.parsePresenceSources(['zone']).sources, ['zone']);
  const bad = presence.parsePresenceSources('zone,plant_name');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /plant_name/);
  assert.deepEqual(presence.normalizePresenceSources('inconnu'), ['registre', 'zone', 'repere']);
  assert.deepEqual(presence.normalizePresenceSources(['repere', 'x']), ['repere']);
});

test('sous-requêtes : un paramètre par canal, zone à un paramètre', () => {
  const all = presence.mapPresenceSubquery('foret');
  assert.deepEqual(all.params, ['foret', 'foret', 'foret']);
  assert.equal((all.sql.match(/\?/g) || []).length, 3);
  assert.match(all.sql, /^\(.*UNION.*\)$/s);
  const registry = presence.mapPresenceSubquery('foret', { sources: ['registre'] });
  assert.deepEqual(registry.params, ['foret']);
  assert.doesNotMatch(registry.sql, /UNION/);
  const zone = presence.zonePresenceSubquery(' z1 ');
  assert.deepEqual(zone.params, ['z1']);
  assert.equal((zone.sql.match(/\?/g) || []).length, 1);
});

test('restrictPresencePlaces : retire les lieux invisibles, garde présence et canaux', () => {
  const species = [
    {
      plant_id: 1,
      sources: ['zone', 'repere'],
      zones: [
        { id: 'z1', label: 'Haie' },
        { id: 'z2', label: 'Réservée' },
      ],
      markers: [{ id: 'm1', label: 'Nichoir' }],
      registry: null,
    },
  ];
  const out = presence.restrictPresencePlaces(species, { zoneIds: ['z1'], markerIds: null });
  assert.deepEqual(
    out[0].zones.map((z) => z.id),
    ['z1'],
  );
  assert.equal(out[0].markers.length, 1);
  assert.deepEqual(out[0].sources, ['zone', 'repere']);
  // L'entrée d'origine n'est pas modifiée.
  assert.equal(species[0].zones.length, 2);
});

test('summarizePresence et serializePresenceEntry', () => {
  const species = [
    { plant_id: 1, sources: ['registre'], zones: [], markers: [], registry: null },
    { plant_id: 2, sources: ['registre', 'zone'], zones: [], markers: [], registry: null },
    { plant_id: 3, sources: ['repere'], zones: [], markers: [], registry: null },
  ];
  assert.deepEqual(presence.summarizePresence(species), {
    total: 3,
    registre: 2,
    zone: 1,
    repere: 1,
    registre_seul: 1,
  });
  const entry = presence.serializePresenceEntry({
    plant_id: 9,
    name: 'Merle',
    emoji: '🐦',
    clade_id: 'x',
    sources: ['registre', 'repere'],
    registry: { validation_status: 'attendu', presence_status: null },
    zones: [{ id: 'z', label: 'Haie' }],
    markers: [{ id: 'm', label: 'Nichoir' }],
  });
  assert.deepEqual(entry, {
    plant_id: 9,
    name: 'Merle',
    emoji: '🐦',
    sources: ['registre', 'repere'],
    validation_status: 'attendu',
    zones: [{ id: 'z', name: 'Haie' }],
    markers: [{ id: 'm', label: 'Nichoir' }],
  });
});

test('listSpeciesForMap : réunion, provenance, lieux dédoublonnés, ordre français', async () => {
  const species = await presence.listSpeciesForMap(db, MAP_ID);
  assert.deepEqual(
    species.map((e) => e.plant_id),
    [plants.erable, plants.merle, plants.ortie],
  );
  const ortie = species.find((e) => e.plant_id === plants.ortie);
  assert.deepEqual(ortie.sources, ['zone']);
  assert.deepEqual(
    ortie.zones.map((z) => z.id),
    [ZONE_2, ZONE_1],
  );
  assert.equal(ortie.registry, null);
  const merle = species.find((e) => e.plant_id === plants.merle);
  assert.deepEqual(merle.sources, ['registre', 'repere']);
  assert.deepEqual(merle.registry, {
    validation_status: 'confirme_site',
    presence_status: 'resident',
  });
  assert.deepEqual(merle.markers, [{ id: MARKER, label: `Nichoir ${suffix}` }]);
  // Canaux restreints explicitement.
  const registryOnly = await presence.listSpeciesForMap(db, MAP_ID, { sources: ['registre'] });
  assert.deepEqual(
    registryOnly.map((e) => e.plant_id),
    [plants.merle],
  );
  assert.deepEqual(registryOnly[0].markers, []);
  assert.deepEqual(await presence.listSpeciesForMap(db, ''), []);
});

test('sous-requête SQL et liste donnent le même ensemble', async () => {
  for (const sources of [undefined, ['registre'], ['zone', 'repere']]) {
    const sub = presence.mapPresenceSubquery(MAP_ID, { sources });
    const rows = await queryAll(`SELECT id FROM plants WHERE id IN ${sub.sql} ORDER BY id`, [
      ...sub.params,
    ]);
    const listed = (await presence.listSpeciesForMap(db, MAP_ID, { sources }))
      .map((e) => e.plant_id)
      .sort((a, b) => a - b);
    assert.deepEqual(
      rows.map((r) => Number(r.id)),
      listed,
    );
  }
});

test('listSpeciesForZone : espèces de la zone seule', async () => {
  const species = await presence.listSpeciesForZone(db, ZONE_2);
  assert.deepEqual(
    species.map((e) => e.plant_id),
    [plants.erable, plants.ortie],
  );
  assert.deepEqual(species[0].sources, ['zone']);
  assert.deepEqual(species[0].zones, [{ id: ZONE_2, label: `Bosquet ${suffix}` }]);
  assert.deepEqual(await presence.listSpeciesForZone(db, `absente-${suffix}`), []);
});

test('« X est-elle présente sur Y ? » — par quels canaux', async () => {
  assert.deepEqual(await presence.getSpeciesPresenceOnMap(db, plants.merle, MAP_ID), {
    present: true,
    sources: ['registre', 'repere'],
  });
  assert.deepEqual(await presence.getSpeciesPresenceOnMap(db, plants.ortie, MAP_ID), {
    present: true,
    sources: ['zone'],
  });
  assert.equal(await presence.isSpeciesPresentOnMap(db, plants.absente, MAP_ID), false);
  assert.equal(await presence.isSpeciesPresentOnMap(db, plants.absente, OTHER_MAP_ID), true);
  assert.deepEqual(await presence.getSpeciesPresenceOnMap(db, 'x', MAP_ID), {
    present: false,
    sources: [],
  });
});

test('registre : un enregistrement de fiche ne réinitialise pas les données lues par le service', async () => {
  const token = await ensureAdminTeacherAuthToken();
  // Le formulaire renvoie toujours `map_ids` : la ligne conservée ne doit pas être réécrite.
  await request(app)
    .put(`/api/plants/${plants.merle}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Merle ${suffix}`, emoji: '🐦', map_ids: [MAP_ID] })
    .expect(200);
  const species = await presence.listSpeciesForMap(db, MAP_ID, { sources: ['registre'] });
  assert.deepEqual(species[0].registry, {
    validation_status: 'confirme_site',
    presence_status: 'resident',
  });
});
