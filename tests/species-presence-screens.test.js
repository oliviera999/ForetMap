'use strict';

/**
 * « Espèce présente sur ce site » écran par écran — tests de caractérisation.
 *
 * Décision Q10 du mainteneur (`docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`, § 1.3.4 et § 3.2.6) :
 * la présence d'une espèce sur une carte a quatre définitions selon l'écran. Ce fichier fige
 * ce que chaque écran répond **aujourd'hui**, sur un jeu minimal construit sur une carte
 * dédiée, avant l'introduction d'un service unique.
 *
 * Jeu minimal (carte `pres-…`) :
 * - A : registre de la carte (`map_species`) seulement ;
 * - B : une zone seulement ;
 * - C : un repère seulement ;
 * - D : registre **et** zone ;
 * - E : témoin, absent de la carte (cible des relations trophiques) ;
 * - F : une zone seulement, sans groupe emboîté (`clade_id` NULL) ;
 * - G : nommé par l'ancienne colonne mono-espèce d'un repère (`map_markers.plant_name`),
 *   sans ligne de jonction.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const suffix = crypto.randomUUID().slice(0, 8);
const MAP_ID = `pres-${suffix}`;
const ROOT_CLADE = `tpres_root_${suffix}`;
const LEAF_CLADE = `tpres_leaf_${suffix}`;
const ZONE_ID = `pres-zone-${suffix}`;
const MARKER_ID = `pres-marker-${suffix}`;
const LEGACY_MARKER_ID = `pres-legacy-${suffix}`;

const plants = {};
let token = '';

async function insertPlant(key, cladeId) {
  const res = await execute(
    'INSERT INTO plants (name, emoji, description, clade_id) VALUES (?, ?, ?, ?)',
    [`Présence ${key} ${suffix}`, '🌱', `Espèce ${key} du jeu de présence.`, cladeId],
  );
  plants[key] = { id: Number(res.insertId), name: `Présence ${key} ${suffix}` };
}

function idsOf(keys) {
  return keys.map((k) => plants[k].id).sort((a, b) => a - b);
}

function sorted(set) {
  return [...set].map(Number).sort((a, b) => a - b);
}

/** Identifiants du jeu minimal seulement (la base de test en contient d'autres). */
function onlyFixture(ids) {
  const mine = new Set(Object.values(plants).map((p) => p.id));
  return sorted(new Set([...ids].map(Number).filter((id) => mine.has(id))));
}

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();

  await execute(
    `INSERT INTO maps (id, label, map_image_url, sort_order, is_active)
     VALUES (?, ?, '/maps/map-foret.svg', 998, 1)`,
    [MAP_ID, `Carte présence ${suffix}`],
  );
  await execute(
    `INSERT INTO clades (id, parent_id, name, shared_attribute, sort_order)
     VALUES (?, NULL, 'Présence racine', 'Attribut racine', 990),
            (?, ?, 'Présence feuille', 'Attribut feuille', 991)`,
    [ROOT_CLADE, LEAF_CLADE, ROOT_CLADE],
  );
  for (const key of ['A', 'B', 'C', 'D', 'E', 'G']) await insertPlant(key, LEAF_CLADE);
  await insertPlant('F', null);

  const points = JSON.stringify([
    { xp: 10, yp: 10 },
    { xp: 30, yp: 10 },
    { xp: 30, yp: 30 },
  ]);
  await execute(
    `INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color)
     VALUES (?, ?, ?, 0, 0, 0, 0, '', 'growing', 0, 'rect', ?, '#86efac90')`,
    [ZONE_ID, MAP_ID, `Zone présence ${suffix}`, points],
  );
  await execute(
    `INSERT INTO visit_zones (id, map_id, name, points, short_description, is_active)
     VALUES (?, ?, ?, ?, 'Texte de visite.', 1)`,
    [ZONE_ID, MAP_ID, `Zone présence ${suffix}`, points],
  );
  for (const key of ['B', 'D', 'F']) {
    await execute('INSERT INTO zone_species (zone_id, plant_id) VALUES (?, ?)', [
      ZONE_ID,
      plants[key].id,
    ]);
  }

  for (const [markerId, label, plantName] of [
    [MARKER_ID, `Repère présence ${suffix}`, ''],
    [LEGACY_MARKER_ID, `Repère ancien ${suffix}`, plants.G.name],
  ]) {
    await execute(
      `INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, note, emoji)
       VALUES (?, ?, 40, 40, ?, ?, '', '📍')`,
      [markerId, MAP_ID, label, plantName],
    );
    await execute(
      `INSERT INTO visit_markers (id, map_id, x_pct, y_pct, label, short_description, is_active)
       VALUES (?, ?, 40, 40, ?, 'Texte de visite du repère.', 1)`,
      [markerId, MAP_ID, label],
    );
  }
  await execute('INSERT INTO marker_species (marker_id, plant_id) VALUES (?, ?)', [
    MARKER_ID,
    plants.C.id,
  ]);

  for (const key of ['A', 'D']) {
    await execute('INSERT INTO map_species (map_id, plant_id) VALUES (?, ?)', [
      MAP_ID,
      plants[key].id,
    ]);
  }

  // Une relation de chaque espèce vers le témoin E (absent de la carte).
  for (const key of ['A', 'B', 'C', 'D', 'F', 'G']) {
    await execute(
      `INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type)
       VALUES (?, ?, 'predation')`,
      [plants[key].id, plants.E.id],
    );
  }
});

after(async () => {
  const ids = Object.values(plants).map((p) => p.id);
  if (ids.length > 0) {
    await execute(`DELETE FROM plants WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
  }
  await execute('DELETE FROM visit_markers WHERE map_id = ?', [MAP_ID]);
  await execute('DELETE FROM map_markers WHERE map_id = ?', [MAP_ID]);
  await execute('DELETE FROM visit_zones WHERE map_id = ?', [MAP_ID]);
  await execute('DELETE FROM zones WHERE map_id = ?', [MAP_ID]);
  await execute('DELETE FROM maps WHERE id = ?', [MAP_ID]);
  await execute('DELETE FROM clades WHERE id = ?', [LEAF_CLADE]);
  await execute('DELETE FROM clades WHERE id = ?', [ROOT_CLADE]);
});

/** Groupes emboîtés : tirage de 20 espèces (plus que le vivier) sur la carte. */
async function cladesScreen() {
  const res = await request(app)
    .post('/api/clades/activity/subtree')
    .send({ mapId: MAP_ID, count: 20 })
    .expect(200);
  return onlyFixture(res.body.plants.map((p) => p.id));
}

/** Réseau trophique de la carte : espèces marquées « dans le périmètre ». */
async function foodWebScreen() {
  const res = await request(app)
    .get(`/api/food-web?mapId=${encodeURIComponent(MAP_ID)}`)
    .expect(200);
  const ids = new Set();
  for (const row of res.body.items || []) {
    if (Number(row.from_in_scope)) ids.add(row.from_id);
    if (row.to_id != null && Number(row.to_in_scope)) ids.add(row.to_id);
  }
  return onlyFixture(ids);
}

/** Visite publique (anonyme) : espèces portées par les lieux publiés. */
async function visitPlacesScreen() {
  const res = await request(app)
    .get(`/api/visit/content?map_id=${encodeURIComponent(MAP_ID)}`)
    .expect(200);
  const ids = new Set();
  for (const loc of [...(res.body.zones || []), ...(res.body.markers || [])]) {
    for (const id of loc.species_ids || []) ids.add(id);
  }
  return { ids: onlyFixture(ids), body: res.body };
}

/** Catalogue : filtre « Présente sur cette carte » tel que le calcule le client aujourd'hui. */
async function catalogueClientScreen() {
  const { plantPresentOnActiveMap } = await import(
    pathToFileURL(path.join(__dirname, '../src/utils/plantFilters.js')).href
  );
  const auth = { Authorization: `Bearer ${token}` };
  const q = encodeURIComponent(MAP_ID);
  const [plantsRes, zonesRes, markersRes] = await Promise.all([
    request(app).get('/api/plants').set(auth).expect(200),
    request(app).get(`/api/zones?map_id=${q}`).set(auth).expect(200),
    request(app).get(`/api/map/markers?map_id=${q}`).set(auth).expect(200),
  ]);
  const present = plantsRes.body
    .filter((p) => plantPresentOnActiveMap(p, zonesRes.body, markersRes.body, MAP_ID))
    .map((p) => p.id);
  return onlyFixture(present);
}

test('caractérisation — groupes emboîtés : registre seul (A, D)', async () => {
  assert.deepEqual(await cladesScreen(), idsOf(['A', 'D']));
});

test('caractérisation — réseau trophique : réunion des trois canaux (A, B, C, D, F)', async () => {
  assert.deepEqual(await foodWebScreen(), idsOf(['A', 'B', 'C', 'D', 'F']));
});

test('caractérisation — visite : zones et repères publiés (B, C, D, F)', async () => {
  const { ids, body } = await visitPlacesScreen();
  assert.deepEqual(ids, idsOf(['B', 'C', 'D', 'F']));
  // L'ancien nom mono-espèce du repère n'est qu'un libellé : aucun identifiant d'espèce.
  const legacy = (body.markers || []).find((m) => m.id === LEGACY_MARKER_ID);
  assert.ok(legacy, 'repère ancien publié');
  assert.deepEqual(legacy.species_ids, []);
  assert.deepEqual(legacy.living_beings_list, [plants.G.name]);
});

test('caractérisation — catalogue (client) : réunion + ancien nom de repère (A, B, C, D, F, G)', async () => {
  assert.deepEqual(await catalogueClientScreen(), idsOf(['A', 'B', 'C', 'D', 'F', 'G']));
});
