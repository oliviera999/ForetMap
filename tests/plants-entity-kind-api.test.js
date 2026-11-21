'use strict';

// Nature des fiches (`plants.entity_kind`) : API, réseau trophique, gestion, liste élève.
//
// Ce que ce fichier protège :
// - `GET /api/plants` rend la nature de chaque fiche et garde les fiches « ressource » : le
//   réseau trophique, les liens et la gestion lisent ce catalogue entier ;
// - la liste et la recherche des ÉLÈVES ne proposent pas les fiches « ressource »
//   (`plantsForStudentCatalog`, utilisé par le catalogue élève) ; la gestion les garde ;
// - le réseau trophique (`GET /api/food-web`) garde une ressource comme nœud ;
// - la nature se lit et se modifie côté gestion (`POST`/`PUT /api/plants`, `foretmap_species`),
//   jamais sans la permission ; une valeur inconnue est refusée (400), pas ramenée en silence
//   à la valeur par défaut ; une modification qui ne cite pas le champ le laisse intact.

require('./helpers/setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const request = require('supertest');

const fx = require('./helpers/mcpFixtures');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  ENTITY_KIND_ENUM,
  STUDENT_HIDDEN_ENTITY_KINDS,
  isStudentHiddenEntity,
} = require('../lib/shared/biodivEnums');

fx.enableMcpEnv();
const { app } = require('../server');

const U = crypto.randomUUID().slice(0, 8);
const NAMES = Object.freeze({
  resource: `Litière test ${U}`,
  species: `Cloporte test ${U}`,
  group: `Plancton test ${U}`,
});
const ids = {};
let adminToken;
let mcpToken;
let interactionId;
let filters;

const call = (name, args) => fx.callTool(app, mcpToken, name, args);
function ok(r) {
  assert.equal(r.isError, false, r.text);
  return r.data;
}

async function catalog() {
  // Le catalogue est gardé 20 s en mémoire : chaque écriture par l'API le vide.
  const res = await request(app).get('/api/plants').expect(200);
  return res.body;
}

before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  const admin = await fx.createAccount('admin');
  mcpToken = (await fx.obtainTokens(app, admin)).access_token;
  filters = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'plantFilters.js')).href
  );
  for (const [key, entityKind] of [
    ['resource', 'ressource'],
    ['species', 'taxon'],
    ['group', 'groupe_fonctionnel'],
  ]) {
    const res = await request(app)
      .post('/api/plants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: NAMES[key], emoji: '🧪', entity_kind: entityKind })
      .expect(201);
    ids[key] = res.body.id;
    assert.equal(res.body.entity_kind, entityKind);
  }
  const link = await execute(
    `INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, evidence_level)
     VALUES (?, ?, 'predation', 'bibliographie')`,
    [ids.species, ids.resource],
  );
  interactionId = link.insertId;
});

after(async () => {
  if (interactionId) {
    await execute('DELETE FROM species_interactions WHERE id = ?', [interactionId]);
  }
  for (const id of Object.values(ids)) await execute('DELETE FROM plants WHERE id = ?', [id]);
  await fx.cleanupAccounts();
});

beforeEach(() => fx.enableMcpEnv());

test('référentiel : seule la nature « ressource » est masquée des élèves', () => {
  assert.deepEqual([...STUDENT_HIDDEN_ENTITY_KINDS], ['ressource']);
  for (const kind of ENTITY_KIND_ENUM.values) {
    assert.equal(isStudentHiddenEntity({ entity_kind: kind }), kind === 'ressource', kind);
    assert.ok(ENTITY_KIND_ENUM.labels[kind], `libellé de ${kind}`);
  }
  // Fiche sans nature connue (objet partiel, base non migrée) : jamais masquée.
  assert.equal(isStudentHiddenEntity({}), false);
  assert.equal(isStudentHiddenEntity(null), false);
});

test('GET /api/plants : la nature est rendue et les fiches « ressource » restent au catalogue', async () => {
  const plants = await catalog();
  const byId = new Map(plants.map((p) => [p.id, p]));
  assert.equal(byId.get(ids.resource)?.entity_kind, 'ressource');
  assert.equal(byId.get(ids.species)?.entity_kind, 'taxon');
  assert.equal(byId.get(ids.group)?.entity_kind, 'groupe_fonctionnel');
});

test('liste et recherche élève : sans les fiches « ressource » ; gestion : avec', async () => {
  const plants = await catalog();
  const student = filters.plantsForStudentCatalog(plants);
  const studentIds = new Set(student.map((p) => p.id));
  assert.equal(studentIds.has(ids.resource), false, 'la ressource sort de la liste élève');
  assert.equal(studentIds.has(ids.species), true);
  assert.equal(studentIds.has(ids.group), true, 'un groupe fonctionnel reste proposé');
  assert.equal(
    student.some((p) => p.entity_kind === 'ressource'),
    false,
    'aucune fiche « ressource », semée ou créée',
  );

  // Recherche par le nom exact de la ressource : rien côté élève, la fiche côté gestion.
  const query = NAMES.resource.toLowerCase();
  const search = (list) =>
    list.filter((p) =>
      filters.plantMatchesAllFilters(p, {
        structured: {},
        queryTrimmedLower: query,
        zonePresence: '',
      }),
    );
  assert.deepEqual(search(student), []);
  const manager = filters.plantsForStudentCatalog(plants, { includeResourceEntities: true });
  assert.equal(manager.length, plants.length, 'la gestion voit tout le catalogue');
  assert.deepEqual(
    search(manager).map((p) => p.id),
    [ids.resource],
  );
});

test('réseau trophique : la ressource reste un nœud et son lien est rendu', async () => {
  const res = await request(app).get('/api/food-web').expect(200);
  const link = res.body.items.find((i) => i.id === interactionId);
  assert.ok(link, 'le lien vers la ressource est dans le réseau');
  assert.equal(link.to_id, ids.resource);
  assert.equal(link.to_name, NAMES.resource);
  const sheet = await request(app).get(`/api/plants/${ids.species}/interactions`).expect(200);
  assert.match(JSON.stringify(sheet.body), new RegExp(NAMES.resource));
});

test('gestion : la nature se modifie par PUT, reste intacte si le champ est absent', async () => {
  const toResource = await request(app)
    .put(`/api/plants/${ids.species}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: NAMES.species, entity_kind: 'ressource' })
    .expect(200);
  assert.equal(toResource.body.entity_kind, 'ressource');
  assert.equal(
    filters.plantsForStudentCatalog(await catalog()).some((p) => p.id === ids.species),
    false,
    'le catalogue servi suit la modification (cache vidé)',
  );

  // Une modification qui ne cite pas le champ (ancien client, enregistrement automatique
  // d'un autre champ) ou l'envoie vide ne change pas la nature.
  for (const body of [
    { name: NAMES.species, description: 'Texte modifié' },
    { name: NAMES.species, entity_kind: '' },
    { name: NAMES.species, entity_kind: null },
  ]) {
    const kept = await request(app)
      .put(`/api/plants/${ids.species}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(200);
    assert.equal(kept.body.entity_kind, 'ressource');
  }

  const back = await request(app)
    .put(`/api/plants/${ids.species}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: NAMES.species, entity_kind: 'taxon' })
    .expect(200);
  assert.equal(back.body.entity_kind, 'taxon');
});

test('valeur inconnue : 400, rien n’est écrit ; sans permission : refus', async () => {
  const bad = await request(app)
    .put(`/api/plants/${ids.species}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `${NAMES.species} modifié`, entity_kind: 'mineral' })
    .expect(400);
  assert.match(bad.body.error, /Nature de fiche inconnue/);
  const row = await queryOne('SELECT name, entity_kind FROM plants WHERE id = ?', [ids.species]);
  assert.equal(row.name, NAMES.species, 'aucune écriture partielle');
  assert.equal(row.entity_kind, 'taxon');

  await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Refusée ${U}`, entity_kind: 'mineral' })
    .expect(400);
  assert.equal(await queryOne('SELECT id FROM plants WHERE name = ?', [`Refusée ${U}`]), undefined);

  const anonymous = await request(app)
    .put(`/api/plants/${ids.resource}`)
    .send({ name: NAMES.resource, entity_kind: 'taxon' });
  assert.ok([401, 403].includes(anonymous.status), `statut ${anonymous.status}`);
  const still = await queryOne('SELECT entity_kind FROM plants WHERE id = ?', [ids.resource]);
  assert.equal(still.entity_kind, 'ressource');
});

test('création sans nature : valeur par défaut « taxon »', async () => {
  const res = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Sans nature ${U}`, emoji: '🌱' })
    .expect(201);
  ids.plain = res.body.id;
  assert.equal(res.body.entity_kind, 'taxon');
});

test('foretmap_species : la nature se lit, se filtre et se modifie', async () => {
  const listed = ok(
    await call('foretmap_species', { action: 'list', entity_kind: 'ressource', q: U }),
  );
  assert.deepEqual(
    listed.items.map((p) => p.id),
    [ids.resource],
  );
  assert.equal(listed.items[0].entity_kind, 'ressource');
  const sheet = ok(await call('foretmap_species', { action: 'get', plant_id: ids.group }));
  assert.equal(sheet.entity_kind, 'groupe_fonctionnel');

  const updated = ok(
    await call('foretmap_species', {
      action: 'update',
      plant_id: ids.group,
      data: { name: NAMES.group, entity_kind: 'consortium' },
    }),
  );
  assert.equal(updated.entity_kind, 'consortium');

  const refused = await call('foretmap_species', {
    action: 'update',
    plant_id: ids.group,
    data: { name: NAMES.group, entity_kind: 'mineral' },
  });
  assert.equal(refused.isError, true);
  const row = await queryOne('SELECT entity_kind FROM plants WHERE id = ?', [ids.group]);
  assert.equal(row.entity_kind, 'consortium');
});
