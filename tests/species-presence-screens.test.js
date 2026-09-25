'use strict';

/**
 * « Espèce présente sur ce site » écran par écran — une seule réponse.
 *
 * Décision Q10 du mainteneur (`docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`, § 1.3.4 et § 3.2.6) :
 * la présence d'une espèce sur une carte avait quatre définitions selon l'écran. Ces tests,
 * écrits d'abord pour caractériser l'existant, fixent maintenant la définition commune
 * (`lib/biodiv/presenceService.js`) : la **réunion** du registre de la carte, des zones et
 * des repères, avec la provenance de chaque espèce.
 *
 * Avant → après, sur le jeu minimal ci-dessous :
 * - groupes emboîtés : registre seul (A, D)            → réunion ∩ classées (A, B, C, D) ;
 * - réseau trophique : réunion (A, B, C, D, F)         → inchangé ;
 * - visite           : lieux publiés (B, C, D, F)      → lieux inchangés, **plus** une liste
 *                      « espèces du site » (A, B, C, D, F, H) ;
 * - catalogue        : réunion refaite par le client, plus l'ancien nom d'un repère
 *                      (A, B, C, D, F, G)              → réponse du serveur (A, B, C, D, F, H).
 *
 * Jeu minimal (carte `pres-…`) :
 * - A : registre de la carte (`map_species`) seulement ;
 * - B : une zone seulement ;
 * - C : un repère seulement ;
 * - D : registre **et** zone ;
 * - E : témoin, absent de la carte (cible des relations trophiques) ;
 * - F : une zone seulement, sans groupe emboîté (`clade_id` NULL) ;
 * - G : nommé par l'ancienne colonne mono-espèce d'un repère (`map_markers.plant_name`),
 *   sans ligne de jonction — n'est **plus** compté ;
 * - H : une zone réservée aux professeurs (`visible_role_slugs`) : présente pour tous, mais la
 *   zone n'est nommée qu'à qui peut la voir.
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
const RESERVED_ZONE_ID = `pres-reserved-${suffix}`;
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

function entryOf(species, key) {
  return (species || []).find((e) => Number(e.plant_id) === plants[key].id);
}

const POINTS = JSON.stringify([
  { xp: 10, yp: 10 },
  { xp: 30, yp: 10 },
  { xp: 30, yp: 30 },
]);

async function insertZone(zoneId, name, visibleRoleSlugs = null) {
  await execute(
    `INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, visible_role_slugs)
     VALUES (?, ?, ?, 0, 0, 0, 0, '', 'growing', 0, 'rect', ?, '#86efac90', ?)`,
    [zoneId, MAP_ID, name, POINTS, visibleRoleSlugs],
  );
  await execute(
    `INSERT INTO visit_zones (id, map_id, name, points, short_description, is_active, visible_role_slugs)
     VALUES (?, ?, ?, ?, 'Texte de visite.', 1, ?)`,
    [zoneId, MAP_ID, name, POINTS, visibleRoleSlugs],
  );
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
  for (const key of ['A', 'B', 'C', 'D', 'E', 'G', 'H']) await insertPlant(key, LEAF_CLADE);
  await insertPlant('F', null);

  await insertZone(ZONE_ID, `Zone présence ${suffix}`);
  for (const key of ['B', 'D', 'F']) {
    await execute('INSERT INTO zone_species (zone_id, plant_id) VALUES (?, ?)', [
      ZONE_ID,
      plants[key].id,
    ]);
  }
  await insertZone(RESERVED_ZONE_ID, `Zone réservée ${suffix}`, JSON.stringify(['prof']));
  await execute('INSERT INTO zone_species (zone_id, plant_id) VALUES (?, ?)', [
    RESERVED_ZONE_ID,
    plants.H.id,
  ]);

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

/** Visite publique (anonyme) : espèces des lieux publiés, et espèces du site. */
async function visitScreen(auth = null) {
  const req = request(app).get(`/api/visit/content?map_id=${encodeURIComponent(MAP_ID)}`);
  if (auth) req.set(auth);
  const res = await req.expect(200);
  const placeIds = new Set();
  for (const loc of [...(res.body.zones || []), ...(res.body.markers || [])]) {
    for (const id of loc.species_ids || []) placeIds.add(id);
  }
  return {
    placeIds: onlyFixture(placeIds),
    siteIds: onlyFixture((res.body.site_species || []).map((e) => e.plant_id)),
    body: res.body,
  };
}

/** Route de présence (catalogue, fiche espèce). */
async function presenceRoute(auth = null, query = '') {
  const req = request(app).get(`/api/maps/${encodeURIComponent(MAP_ID)}/species${query}`);
  if (auth) req.set(auth);
  const res = await req.expect(200);
  return { ids: onlyFixture(res.body.species.map((e) => e.plant_id)), body: res.body };
}

/** Catalogue : filtre « Présente sur cette carte », appliqué par le client à la réponse serveur. */
async function catalogueScreen() {
  const auth = { Authorization: `Bearer ${token}` };
  const [{ plantMatchesZonePresence, ZONE_PRESENCE_FILTER }, { indexSpeciesPresence }] =
    await Promise.all([
      import(pathToFileURL(path.join(__dirname, '../src/utils/plantFilters.js')).href),
      import(pathToFileURL(path.join(__dirname, '../src/utils/speciesPresence.js')).href),
    ]);
  const [plantsRes, presence] = await Promise.all([
    request(app).get('/api/plants').set(auth).expect(200),
    presenceRoute(auth),
  ]);
  const index = indexSpeciesPresence(presence.body.species);
  const present = plantsRes.body
    .filter((p) => plantMatchesZonePresence(p, index, ZONE_PRESENCE_FILTER.IN_MAP))
    .map((p) => p.id);
  return onlyFixture(present);
}

const COMMON = ['A', 'B', 'C', 'D', 'F', 'H'];

test('groupes emboîtés : vivier = présence commune ∩ espèces classées (A, B, C, D, H)', async () => {
  // Avant : registre seul (A, D).
  assert.deepEqual(await cladesScreen(), idsOf(['A', 'B', 'C', 'D', 'H']));
});

test('réseau trophique : présence commune, inchangée (A, B, C, D, F)', async () => {
  // H n'a pas de relation dans le jeu minimal ; G n'est plus présent (et ne l'était pas ici).
  assert.deepEqual(await foodWebScreen(), idsOf(['A', 'B', 'C', 'D', 'F']));
});

test('visite : lieux inchangés, liste « espèces du site » = présence commune', async () => {
  const { placeIds, siteIds, body } = await visitScreen();
  // Les lieux publiés gardent leurs espèces pour l'affichage sur la carte (la zone réservée
  // n'est pas servie à un anonyme).
  assert.deepEqual(placeIds, idsOf(['B', 'C', 'D', 'F']));
  assert.deepEqual(siteIds, idsOf(COMMON));
  // L'ancien nom mono-espèce reste un libellé de repère, sans être une présence.
  const legacy = (body.markers || []).find((m) => m.id === LEGACY_MARKER_ID);
  assert.ok(legacy, 'repère ancien publié');
  assert.deepEqual(legacy.species_ids, []);
  assert.deepEqual(legacy.living_beings_list, [plants.G.name]);
  // Provenance, et lieu réservé jamais nommé à un anonyme.
  assert.deepEqual(entryOf(body.site_species, 'A').sources, ['registre']);
  assert.deepEqual(entryOf(body.site_species, 'D').sources, ['registre', 'zone']);
  assert.deepEqual(entryOf(body.site_species, 'C').sources, ['repere']);
  assert.deepEqual(entryOf(body.site_species, 'H').sources, ['zone']);
  assert.deepEqual(entryOf(body.site_species, 'H').zones, []);
  assert.deepEqual(
    entryOf(body.site_species, 'B').zones.map((z) => z.id),
    [ZONE_ID],
  );
  assert.ok(body.site_species_summary.total >= COMMON.length);
});

test('catalogue : le filtre suit la réponse du serveur, sans l’ancien nom (A, B, C, D, F, H)', async () => {
  // Avant : réunion refaite par le client, plus G par son ancien nom mono-espèce.
  assert.deepEqual(await catalogueScreen(), idsOf(COMMON));
});

test('une seule réponse : catalogue, visite et réseau trophique donnent la même liste', async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const route = await presenceRoute(auth);
  const visit = await visitScreen();
  assert.deepEqual(route.ids, visit.siteIds);
  assert.deepEqual(await catalogueScreen(), route.ids);
  // Réseau trophique : toutes les espèces du jeu qui ont une relation sont dans la liste.
  for (const id of await foodWebScreen()) assert.ok(route.ids.includes(id));
  // Groupes emboîtés : la même liste, restreinte aux espèces classées (F n'a pas de groupe).
  assert.deepEqual(
    await cladesScreen(),
    route.ids.filter((id) => id !== plants.F.id),
  );
});

test('GET /api/maps/:mapId/species — provenance et lieux par espèce', async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const { body } = await presenceRoute(auth);
  assert.equal(body.map_id, MAP_ID);
  assert.deepEqual(body.sources, ['registre', 'zone', 'repere']);
  assert.deepEqual(entryOf(body.species, 'A').sources, ['registre']);
  assert.deepEqual(entryOf(body.species, 'A').zones, []);
  assert.equal(entryOf(body.species, 'A').validation_status, 'attendu');
  assert.deepEqual(entryOf(body.species, 'B').sources, ['zone']);
  assert.deepEqual(entryOf(body.species, 'B').zones, [
    { id: ZONE_ID, name: `Zone présence ${suffix}` },
  ]);
  assert.deepEqual(entryOf(body.species, 'C').markers, [
    { id: MARKER_ID, label: `Repère présence ${suffix}` },
  ]);
  assert.equal(entryOf(body.species, 'G'), undefined);
  // Un gestionnaire voit la zone réservée.
  assert.deepEqual(
    entryOf(body.species, 'H').zones.map((z) => z.id),
    [RESERVED_ZONE_ID],
  );
});

test('GET /api/maps/:mapId/species — anonyme : même présence, lieu réservé non nommé', async () => {
  const { ids, body } = await presenceRoute();
  assert.deepEqual(ids, idsOf(COMMON));
  assert.deepEqual(entryOf(body.species, 'H').sources, ['zone']);
  assert.deepEqual(entryOf(body.species, 'H').zones, []);
});

test('GET /api/maps/:mapId/species — canaux explicites, erreurs', async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const registry = await presenceRoute(auth, '?sources=registre');
  assert.deepEqual(registry.ids, idsOf(['A', 'D']));
  assert.deepEqual(registry.body.sources, ['registre']);
  const located = await presenceRoute(auth, '?sources=repere,zone');
  assert.deepEqual(located.ids, idsOf(['B', 'C', 'D', 'F', 'H']));
  assert.deepEqual(located.body.sources, ['zone', 'repere']);

  const bad = await request(app)
    .get(`/api/maps/${encodeURIComponent(MAP_ID)}/species?sources=nom_ancien`)
    .set(auth)
    .expect(400);
  assert.match(bad.body.error, /Source de présence inconnue/);
  await request(app).get(`/api/maps/carte-inexistante-${suffix}/species`).set(auth).expect(404);
});
