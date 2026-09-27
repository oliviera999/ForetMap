'use strict';

// =====================================================================
// Caractérisation de l'API des fiches espèces (`/api/plants`) — étape B3 de la piste B
// (audit du 25/09/2026, § 2.2, § 3.3 ligne 9 et § 3.4).
//
// Ce fichier FIGE ce que rendent aujourd'hui les routes de `routes/plants.js`, sur deux
// fiches entièrement maîtrisées (une riche, une minimale) :
//   - instantanés de `POST /api/plants`, de `GET /api/plants` (lignes des fiches de test)
//     et de `PUT /api/plants/:id` — la liste est la seule lecture « fiche » du front, il
//     n'existe pas de `GET /api/plants/:id` (404, figé lui aussi) ;
//   - création, modification, suppression et leurs erreurs ;
//   - revue des dangers : 403 sans `plants.hazards.validate`, drapeau `hazard_reviewed`
//     jamais écrit par la fiche ;
//   - préremplissage GBIF : l'ORDRE latin est proposé comme « grand groupe » et la FAMILLE
//     comme « genre » (défaut connu, § 1.3.6 — figé, pas corrigé ici) ;
//   - recherche du catalogue : un nom secondaire n'est PAS trouvé (défaut connu, § 1.3.6).
//
// Il a été écrit AVANT l'extraction de `lib/biodiv/speciesService.js` et
// `lib/biodiv/speciesRepository.js` et doit rester vert après : c'est la preuve qu'elle ne
// change aucun comportement. Il fige aussi les défauts — une différence n'est jamais
// « corrigée » ici en silence : le lot qui change un comportement régénère la référence et
// le dit.
//
// Les sorties sont comparées à `tests/fixtures/plants-species.golden.json` après deux
// normalisations : identifiants et noms horodatés remplacés par des alias stables (`A`, `B`,
// `<nom A>`…), horodatages par `<t>`.
//
// Régénérer la référence (changement de comportement VOULU, à justifier dans la PR) :
//   PLANTS_CHAR_RECORD=1 node --test --test-concurrency=1 --test-force-exit \
//     tests/plants-species-characterization.test.js
//   npx prettier --write tests/fixtures/plants-species.golden.json
// =====================================================================

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { buildPlantPayload } = require('../lib/plantsRouteHelpers');

const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'plants-species.golden.json');
const RECORD = process.env.PLANTS_CHAR_RECORD === '1';
const recorded = {};

const STAMP = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
const NAME_A = `Caractérisation riche ${STAMP}`;
const NAME_B = `Caractérisation minimale ${STAMP}`;

/** Alias stables : identifiants et noms générés → libellés fixes. */
const aliases = new Map();
const TIME_KEYS = new Set(['hazard_reviewed_at', 'gbif_checked_at', 'created_at', 'updated_at']);
const ID_KEYS = new Set(['id', 'plant_id', 'plantId', 'lookalike_plant_id']);
const RELATED_LIST_KEYS = new Set(['photos']);

function canon(value, key = '') {
  // Identifiants des lignes liées (photos…) : attribués par la base, remplacés par un repère.
  if (Array.isArray(value) && RELATED_LIST_KEYS.has(key)) {
    return value.map((entry) =>
      entry && typeof entry === 'object' && entry.id != null
        ? canon({ ...entry, id: '<id>' })
        : canon(entry),
    );
  }
  if (Array.isArray(value)) return value.map((entry) => canon(entry));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canon(value[k], k);
    return out;
  }
  if (TIME_KEYS.has(key) && value != null && value !== '') return '<t>';
  // Le relecteur est le compte admin de la base de test : son id change d'une base à l'autre.
  if (key === 'hazard_reviewed_by' && value != null && value !== '') return '<relecteur>';
  // Un nombre n'est un identifiant que sous une clé d'identifiant : `temp_max_c: 25` ne doit
  // jamais devenir « A » parce que la fiche A porte l'id 25.
  if (typeof value === 'number' && ID_KEYS.has(key) && aliases.has(String(value))) {
    return aliases.get(String(value));
  }
  if (typeof value === 'string' && aliases.has(value)) return aliases.get(value);
  return value;
}

/** Compare à la référence (ou l'enregistre en mode PLANTS_CHAR_RECORD=1). */
function expectGolden(name, actual) {
  const normalized = canon(actual);
  if (RECORD) {
    recorded[name] = normalized;
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.ok(Object.hasOwn(golden, name), `référence absente : ${name}`);
  assert.deepStrictEqual(normalized, golden[name], name);
}

/** Fiche riche : identité, taxonomie, photos (plusieurs liens), danger, remarques, détermination. */
const RICH_BODY = {
  name: NAME_A,
  emoji: '🌿',
  description: 'Rosette de feuilles dentées.',
  second_name: 'Dent-de-lion caractérisation, Salade de taupe',
  scientific_name: 'Taraxacum officinale',
  taxon_kingdom: 'Végétal (Chlorobiontes)',
  taxon_group: 'Angiosperme',
  taxon_family: 'Astéracées',
  habitat: 'Pelouse',
  habitat_type: 'terrestre',
  trophic_role: 'Producteur',
  life_cycle: 'vivace',
  is_edible: '1',
  temp_min_c: '5',
  temp_max_c: '25',
  ph_min: '6,5',
  ph_max: '7.5',
  origin_status: 'indigène',
  iucn_status: 'LC',
  photo: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Caracterisation_A.jpg',
  photo_species:
    'https://upload.wikimedia.org/wikipedia/commons/a/aa/Caracterisation_A.jpg\nhttps://upload.wikimedia.org/wikipedia/commons/b/bb/Caracterisation_A2.jpg',
  photo_flower: '/uploads/plants/0/photo_flower-1.jpg',
  photo_credit: 'Auteur caractérisation',
  photo_licence: 'CC BY-SA 4.0',
  remark_1: 'Première remarque.',
  remark_3: 'Troisième remarque.',
  identification_criteria: 'Capitule jaune, latex blanc.',
  lookalike_species: 'Porcelle enracinée : tige ramifiée.',
  identification_period: 'Printemps',
  toxicity_level: 'aucune',
  hazard_exposure: 'contact',
  hazard_notes: 'Latex légèrement irritant.',
  health_risk: 'allergie',
  sources: 'https://fr.wikipedia.org/wiki/Pissenlit',
  hazard_reviewed: 1,
};

let token;
let managerToken;
let managerRoleId;
let managerUserId;
const createdIds = [];

/** Compte enseignant dont le rôle n'a QUE `plants.manage` (pas `plants.hazards.validate`). */
async function createPlantsManagerOnlyToken() {
  const slug = `test_plants_mgr_${STAMP}`.slice(0, 64);
  await execute(
    'INSERT INTO roles (slug, display_name, emoji, min_done_tasks, display_order, `rank`, is_system) VALUES (?, ?, ?, 0, 1, 350, 0)',
    [slug, 'Gestion des fiches (test)', '🌿'],
  );
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  managerRoleId = role.id;
  await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
    managerRoleId,
    'plants.manage',
  ]);
  managerUserId = `teacher-plants-mgr-${STAMP}`.slice(0, 64);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [managerUserId, `${managerUserId}@foretmap.local`, managerUserId, 'Gestionnaire fiches'],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [managerUserId, managerRoleId],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [
    managerRoleId,
    managerUserId,
  ]);
  return signAuthToken({
    userType: 'teacher',
    userId: managerUserId,
    canonicalUserId: managerUserId,
    roleId: managerRoleId,
    roleSlug: slug,
    roleDisplayName: 'Gestion des fiches (test)',
  });
}

async function listRow(id) {
  const res = await request(app).get('/api/plants').expect(200);
  assert.ok(Array.isArray(res.body));
  const row = res.body.find((p) => Number(p.id) === Number(id));
  assert.ok(row, `fiche ${id} absente de GET /api/plants`);
  return row;
}

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken({ extraPermissions: ['plants.hazards.validate'] });
  managerToken = await createPlantsManagerOnlyToken();
});

after(async () => {
  if (RECORD) {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
  }
  for (const id of createdIds) {
    await execute('DELETE FROM plants WHERE id = ?', [id]).catch(() => {});
  }
  if (managerUserId) {
    await execute('DELETE FROM user_roles WHERE user_id = ?', [managerUserId]).catch(() => {});
    await execute('DELETE FROM users WHERE id = ?', [managerUserId]).catch(() => {});
  }
  if (managerRoleId) {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [managerRoleId]).catch(
      () => {},
    );
    await execute('DELETE FROM roles WHERE id = ?', [managerRoleId]).catch(() => {});
  }
});

let idA;
let idB;

test('instantané — POST /api/plants (fiche riche, fiche minimale)', async () => {
  const resA = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send(RICH_BODY)
    .expect(201);
  idA = resA.body.id;
  createdIds.push(idA);
  aliases.set(String(idA), 'A');
  aliases.set(NAME_A, '<nom A>');

  const resB = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: NAME_B })
    .expect(201);
  idB = resB.body.id;
  createdIds.push(idB);
  aliases.set(String(idB), 'B');
  aliases.set(NAME_B, '<nom B>');

  expectGolden('post_rich', resA.body);
  expectGolden('post_minimal', resB.body);
});

test('instantané — GET /api/plants (lignes des deux fiches de test)', async () => {
  expectGolden('list_rich', await listRow(idA));
  expectGolden('list_minimal', await listRow(idB));
});

test('instantané — PUT /api/plants/:id partiel (les champs absents gardent leur valeur)', async () => {
  const res = await request(app)
    .put(`/api/plants/${idA}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: NAME_A, description: 'Description modifiée.', remark_2: 'Deuxième remarque.' })
    .expect(200);
  expectGolden('put_rich_partial', res.body);
  expectGolden('list_rich_after_put', await listRow(idA));
});

test('GET /api/plants/:id — aucune route de lecture unitaire', async () => {
  const res = await request(app).get(`/api/plants/${idA}`);
  expectGolden('get_by_id', { status: res.status, body: res.body });
});

test('erreurs — nom requis, lien photo non HTTPS, fiche inconnue', async () => {
  const noName = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ emoji: '🌱' });
  const httpPhoto = await request(app)
    .post('/api/plants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Photo http ${STAMP}`, photo: 'http://example.org/a.jpg' });
  const unknownPut = await request(app)
    .put('/api/plants/99999999')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'x' });
  const unknownDelete = await request(app)
    .delete('/api/plants/99999999')
    .set('Authorization', `Bearer ${token}`);
  const anonymousPost = await request(app).post('/api/plants').send({ name: 'x' });
  expectGolden('errors', {
    no_name: { status: noName.status, body: noName.body },
    http_photo: { status: httpPhoto.status, body: httpPhoto.body },
    unknown_put: { status: unknownPut.status, body: unknownPut.body },
    unknown_delete: { status: unknownDelete.status, body: unknownDelete.body },
    anonymous_post: { status: anonymousPost.status },
  });
});

test('dangers — 403 sans plants.hazards.validate ; hazard_reviewed jamais écrit par la fiche', async () => {
  // Le gestionnaire de fiches peut modifier la fiche…
  const put = await request(app)
    .put(`/api/plants/${idA}`)
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ name: NAME_A, hazard_reviewed: 1, hazard_reviewed_by: 'intrus' })
    .expect(200);
  assert.equal(Number(put.body.hazard_reviewed), 0);
  assert.equal(put.body.hazard_reviewed_by, null);
  // … mais pas certifier la relecture des dangers.
  const denied = await request(app)
    .post(`/api/plants/${idA}/validate-hazard`)
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ reviewed: true });
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.body, { error: 'Permission insuffisante' });
  const row = await queryOne(
    'SELECT hazard_reviewed, hazard_reviewed_by FROM plants WHERE id = ?',
    [idA],
  );
  assert.equal(Number(row.hazard_reviewed), 0);
  assert.equal(row.hazard_reviewed_by, null);

  // Avec la permission : validation, puis une modification du danger la retire.
  const ok = await request(app)
    .post(`/api/plants/${idA}/validate-hazard`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reviewed: true })
    .expect(200);
  assert.equal(Number(ok.body.hazard_reviewed), 1);
  expectGolden('validate_hazard', ok.body);
  const reset = await request(app)
    .put(`/api/plants/${idA}`)
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ name: NAME_A, hazard_notes: 'Autre conduite à tenir.' })
    .expect(200);
  assert.equal(Number(reset.body.hazard_reviewed), 0);
  assert.equal(reset.body.hazard_reviewed_at, null);
});

test(
  'préremplissage GBIF — grand groupe = ORDRE, genre = FAMILLE (défaut figé)',
  { concurrency: false },
  async () => {
    const previousFetch = global.fetch;
    global.fetch = async (url) => {
      if (String(url).includes('api.gbif.org/v1/species/match')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              confidence: 97,
              scientificName: 'Rosa canina L.',
              canonicalName: 'Rosa canina',
              kingdom: 'Plantae',
              order: 'Rosales',
              family: 'Rosaceae',
              usageKey: 8395064,
            };
          },
        };
      }
      throw new Error(`URL inattendue: ${url}`);
    };
    let autofill;
    try {
      autofill = await request(app)
        .get(`/api/plants/autofill?q=${encodeURIComponent(`rosa canina ${STAMP}`)}&sources=gbif`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    } finally {
      global.fetch = previousFetch;
    }
    const fields = autofill.body.fields || {};
    // La réponse passe par la normalisation des fiches : les `group_*` de la source GBIF
    // deviennent `taxon_*`. Grand groupe = ordre, genre = famille.
    assert.equal(fields.taxon_group, 'Rosales');
    assert.equal(fields.taxon_genus, 'Rosaceae');
    assert.equal(fields.taxon_family, 'Rosaceae');
    assert.equal(fields.taxon_kingdom, 'Plantae');
    assert.equal(autofill.body.field_sources?.group_2?.source, 'gbif');
    assert.equal(autofill.body.field_sources?.group_4?.source, 'gbif');

    // Un import (colonnes `groupe_2` / `groupe_4`) ou un client qui renvoie les champs bruts de
    // la source : le serveur range `group_2` / `group_4` dans `taxon_group` / `taxon_genus`
    // quand ces champs sont vides (`lib/plantPayloadSync.js`).
    const payload = buildPlantPayload({
      name: 'Églantier',
      taxon_group: '',
      taxon_genus: '',
      group_2: 'Rosales',
      group_4: 'Rosaceae',
    });
    assert.equal(payload.taxon_group, 'Rosales');
    assert.equal(payload.taxon_genus, 'Rosaceae');

    const put = await request(app)
      .put(`/api/plants/${idB}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: NAME_B,
        taxon_group: '',
        taxon_genus: '',
        group_2: 'Rosales',
        group_4: 'Rosaceae',
      })
      .expect(200);
    assert.equal(put.body.taxon_group, 'Rosales');
    assert.equal(put.body.taxon_genus, 'Rosaceae');
    assert.equal(put.body.taxonomy.group, 'Rosales');
    assert.equal(put.body.taxonomy.genus, 'Rosaceae');
  },
);

test('recherche du catalogue — un nom secondaire n’est pas trouvé (défaut figé)', async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'plantFilters.js')).href
  );
  const row = await listRow(idA);
  assert.equal(mod.plantTextMatchesQuery(row, 'pelouse'), true);
  assert.equal(mod.plantTextMatchesQuery(row, 'taraxacum'), true);
  // `second_name` (« Dent-de-lion caractérisation, Salade de taupe ») n'est pas lu.
  assert.equal(mod.plantTextMatchesQuery(row, 'salade de taupe'), false);
});

test('suppression — 200 puis 404 ; la fiche quitte la liste', async () => {
  const del = await request(app)
    .delete(`/api/plants/${idB}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.deepEqual(del.body, { success: true });
  const again = await request(app)
    .delete(`/api/plants/${idB}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(again.status, 404);
  assert.deepEqual(again.body, { error: 'Plante introuvable' });
  const list = await request(app).get('/api/plants').expect(200);
  assert.ok(!list.body.some((p) => Number(p.id) === Number(idB)));
});
