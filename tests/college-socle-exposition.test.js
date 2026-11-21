'use strict';

// Socle de l'affichage collège (migration `college_socle`) : exposition EN LECTURE des colonnes
// ajoutées, sans changement d'affichage.
//
// Ce que ce fichier protège :
// - la migration de socle se rejoue sans erreur (idempotence) ;
// - `GET /api/plants` rend `usage_label`, `description_college` et `usage_group` (boîte
//   `visible_college` la plus proche dans l'arbre, libellé `label_simple || name`, `null` sans
//   boîte marquée) ;
// - `GET /api/clades` et `GET /api/clades/:id/path` rendent `label_simple`, `attribute_simple`,
//   `visible_college` ;
// - `GET /api/maps/:id/species` rend `is_featured` (registre seulement) ;
// - `GET /api/quiz/categories` rend `description_college` ;
// - le connecteur lit ces champs (`foretmap_get_species`, `foretmap_species list`).

require('./helpers/setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const fx = require('./helpers/mcpFixtures');
const { initSchema, execute, splitSqlStatements } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { indexClades, usageGroupFor, cladeSimpleLabel } = require('../lib/clades');
const { serializePresenceEntry } = require('../lib/biodiv/presenceService');
const { invalidatePlantsListCache } = require('../lib/biodiv/speciesService');

fx.enableMcpEnv();
const { app } = require('../server');

const U = crypto.randomUUID().slice(0, 8);
const CLADE = Object.freeze({
  root: `tcs_root_${U}`,
  mid: `tcs_mid_${U}`,
  leaf: `tcs_leaf_${U}`,
});
const CATEGORY = `tcs_${U}`;
const MAP_ID = 'foret';
const ids = {};
let adminToken;
let mcpToken;

const call = (name, args) => fx.callTool(app, mcpToken, name, args);
function ok(r) {
  assert.equal(r.isError, false, r.text);
  return r.data;
}

async function catalogById() {
  invalidatePlantsListCache();
  const res = await request(app).get('/api/plants').expect(200);
  return new Map(res.body.map((p) => [p.id, p]));
}

before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  const admin = await fx.createAccount('admin');
  mcpToken = (await fx.obtainTokens(app, admin)).access_token;

  await execute(
    `INSERT INTO clades (id, parent_id, name, label_simple, shared_attribute, attribute_simple, sort_order, visible_college)
     VALUES (?, NULL, ?, ?, ?, ?, 0, 1), (?, ?, ?, NULL, ?, NULL, 0, 0), (?, ?, ?, NULL, ?, NULL, 0, 0)`,
    [
      CLADE.root,
      `Arthropodes ${U}`,
      `Animaux à pattes articulées ${U}`,
      'Exosquelette et pattes articulées',
      'Une carapace et des pattes en segments',
      CLADE.mid,
      CLADE.root,
      `Arachnides ${U}`,
      'Quatre paires de pattes',
      CLADE.leaf,
      CLADE.mid,
      `Salticidés ${U}`,
      'Grands yeux médians',
    ],
  );
  for (const [key, cladeId] of [
    ['featured', CLADE.leaf],
    ['plain', null],
  ]) {
    const res = await execute(
      `INSERT INTO plants (name, emoji, clade_id, usage_label, description_college)
       VALUES (?, '🧪', ?, ?, ?)`,
      [
        `Plante socle ${key} ${U}`,
        cladeId,
        key === 'featured' ? 'une araignée sauteuse' : null,
        key === 'featured' ? 'Elle chasse à vue et saute sur ses proies.' : null,
      ],
    );
    ids[key] = res.insertId;
  }
  await execute(
    `INSERT INTO map_species (map_id, plant_id, validation_status, is_featured)
     VALUES (?, ?, 'attendu', 1), (?, ?, 'attendu', 0)`,
    [MAP_ID, ids.featured, MAP_ID, ids.plain],
  );
  await execute(
    `INSERT INTO quiz_categories (slug, nom, theme, description, description_college, order_index)
     VALUES (?, ?, 'sciences', 'Énergie et matière dans les écosystèmes', 'Qui mange qui, et pourquoi', 999)`,
    [CATEGORY, `Catégorie socle ${U}`],
  );
});

after(async () => {
  for (const id of Object.values(ids)) {
    await execute('DELETE FROM map_species WHERE plant_id = ?', [id]);
    await execute('DELETE FROM plants WHERE id = ?', [id]);
  }
  await execute('DELETE FROM clades WHERE id IN (?, ?)', [CLADE.leaf, CLADE.mid]);
  await execute('DELETE FROM clades WHERE id = ?', [CLADE.root]);
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [CATEGORY]);
  invalidatePlantsListCache();
  await fx.cleanupAccounts();
});

beforeEach(() => fx.enableMcpEnv());

test('migration college_socle : rejouable sans erreur', async () => {
  const file = fs
    .readdirSync(path.join(__dirname, '..', 'migrations'))
    .find((name) => /_college_socle\.sql$/.test(name));
  assert.ok(file, 'fichier de migration college_socle introuvable');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', file), 'utf8');
  for (let pass = 0; pass < 2; pass += 1) {
    for (const stmt of splitSqlStatements(sql)) await execute(stmt);
  }
});

test('usageGroupFor : boîte visible la plus proche, libellé simple, repli null', () => {
  const byId = indexClades([
    { id: 'r', parent_id: null, name: 'Êtres vivants', visible_college: 1 },
    {
      id: 'a',
      parent_id: 'r',
      name: 'Arthropodes',
      label_simple: 'Pattes articulées',
      visible_college: 1,
    },
    { id: 'b', parent_id: 'a', name: 'Arachnides', visible_college: 0 },
    { id: 'c', parent_id: 'b', name: 'Salticidés', visible_college: 0 },
    { id: 'x', parent_id: null, name: 'Isolé', visible_college: 0 },
  ]);
  assert.deepEqual(usageGroupFor(byId, 'c'), { id: 'a', label: 'Pattes articulées' });
  assert.deepEqual(usageGroupFor(byId, 'a'), { id: 'a', label: 'Pattes articulées' });
  assert.deepEqual(usageGroupFor(byId, 'r'), { id: 'r', label: 'Êtres vivants' });
  assert.equal(usageGroupFor(byId, 'x'), null);
  assert.equal(usageGroupFor(byId, null), null);
  assert.equal(usageGroupFor(byId, 'inconnu'), null);
  assert.equal(cladeSimpleLabel({ name: 'Arachnides', label_simple: '  ' }), 'Arachnides');
  assert.equal(cladeSimpleLabel(null), '');
});

test('GET /api/plants : étiquette, description collège et groupe d’usage', async () => {
  const byId = await catalogById();
  const featured = byId.get(ids.featured);
  assert.equal(featured.usage_label, 'une araignée sauteuse');
  assert.equal(featured.description_college, 'Elle chasse à vue et saute sur ses proies.');
  assert.deepEqual(featured.usage_group, {
    id: CLADE.root,
    label: `Animaux à pattes articulées ${U}`,
  });
  const plain = byId.get(ids.plain);
  assert.equal(plain.usage_label, null);
  assert.equal(plain.description_college, null);
  assert.equal(plain.usage_group, null);

  // Boîte intermédiaire marquée sans libellé simple : elle devient le groupe, sous son nom.
  await execute('UPDATE clades SET visible_college = 1 WHERE id = ?', [CLADE.mid]);
  try {
    const again = (await catalogById()).get(ids.featured);
    assert.deepEqual(again.usage_group, { id: CLADE.mid, label: `Arachnides ${U}` });
  } finally {
    await execute('UPDATE clades SET visible_college = 0 WHERE id = ?', [CLADE.mid]);
  }
});

test('GET /api/clades et /:id/path : champs simples et visibilité collège', async () => {
  const list = await request(app).get('/api/clades').expect(200);
  const root = list.body.items.find((c) => c.id === CLADE.root);
  assert.equal(root.label_simple, `Animaux à pattes articulées ${U}`);
  assert.equal(root.attribute_simple, 'Une carapace et des pattes en segments');
  assert.equal(Number(root.visible_college), 1);
  const mid = list.body.items.find((c) => c.id === CLADE.mid);
  assert.equal(mid.label_simple, null);
  assert.equal(Number(mid.visible_college), 0);

  const res = await request(app).get(`/api/clades/${CLADE.leaf}/path`).expect(200);
  assert.deepEqual(
    res.body.path.map((n) => [n.id, n.label_simple, n.visible_college]),
    [
      [CLADE.root, `Animaux à pattes articulées ${U}`, 1],
      [CLADE.mid, null, 0],
      [CLADE.leaf, null, 0],
    ],
  );
  assert.equal(res.body.path[0].attribute_simple, 'Une carapace et des pattes en segments');
});

test('GET /api/maps/:id/species : is_featured porté par le registre', async () => {
  const res = await request(app)
    .get(`/api/maps/${MAP_ID}/species`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const byId = new Map(res.body.species.map((s) => [s.plant_id, s]));
  assert.equal(byId.get(ids.featured)?.is_featured, true);
  assert.equal(byId.get(ids.plain)?.is_featured, false);

  // Le formulaire de fiche renvoie toujours `map_ids` : la marque « phare » doit survivre.
  await request(app)
    .put(`/api/plants/${ids.featured}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Plante socle featured ${U}`, emoji: '🧪', map_ids: [MAP_ID] })
    .expect(200);
  const again = await request(app)
    .get(`/api/maps/${MAP_ID}/species`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(again.body.species.find((s) => s.plant_id === ids.featured)?.is_featured, true);
  // Entrée sans registre (zone ou repère seulement) : jamais phare.
  const zoneOnly = serializePresenceEntry({
    plant_id: 1,
    name: 'x',
    emoji: '',
    sources: ['zone'],
    registry: null,
    zones: [],
    markers: [],
  });
  assert.equal(zoneOnly.is_featured, false);
});

test('GET /api/quiz/categories : description collège', async () => {
  const res = await request(app).get('/api/quiz/categories').expect(200);
  const cat = res.body.categories.find((c) => c.slug === CATEGORY);
  assert.ok(cat, 'catégorie de test absente');
  assert.equal(cat.description_college, 'Qui mange qui, et pourquoi');
});

test('connecteur : foretmap_get_species et foretmap_species list lisent les champs collège', async () => {
  const sheet = ok(await call('foretmap_get_species', { id: ids.featured }));
  assert.equal(sheet.species.usage_label, 'une araignée sauteuse');
  assert.equal(sheet.species.description_college, 'Elle chasse à vue et saute sur ses proies.');
  const presence = (sheet.presence?.maps || []).find((m) => m.map_id === MAP_ID);
  assert.ok(presence, JSON.stringify(sheet.presence));
  assert.equal(Number(presence.is_featured), 1);

  invalidatePlantsListCache();
  const listed = ok(await call('foretmap_species', { action: 'list', q: `socle featured ${U}` }));
  const item = listed.items.find((p) => p.id === ids.featured);
  assert.ok(item, JSON.stringify(listed.items));
  assert.equal(item.usage_label, 'une araignée sauteuse');
  assert.deepEqual(item.usage_group, { id: CLADE.root, label: `Animaux à pattes articulées ${U}` });
});
