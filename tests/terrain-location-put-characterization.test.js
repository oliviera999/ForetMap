'use strict';

/**
 * Caractérisation de `PUT /api/zones/:id` et `PUT /api/map/markers/:id` — les deux handlers
 * « jumeaux » que l'étape B4 de l'audit du 25/09/2026 (§ 2.2, § 3.3 ligne 12) fait passer par
 * un service commun (`lib/terrain/locationService.js`).
 *
 * Écrit AVANT l'extraction, sur le patron de la méthode § 3.4 : il fige les réponses
 * actuelles — **défauts compris** (un repère accepte `x_pct = 150` en modification, alors que
 * la création le refuse) — et doit passer à l'identique avant et après. Les mêmes cas sont
 * rejoués sur les deux types de lieu : champs, espèces, photos, droits, erreurs.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryAll, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const fx = require('./helpers/fmFixtures');

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 30, yp: 10 },
  { xp: 30, yp: 30 },
];

/** Les deux types de lieu, décrits par ce qui les distingue dans l'API. */
const KINDS = {
  zone: {
    base: '/api/zones',
    nameField: 'name',
    textField: 'description',
    notFound: 'Zone introuvable',
    nameRequired: 'Nom requis',
    visitTable: 'visit_zones',
    categoryTable: 'zone_categories',
    categoryFk: 'zone_id',
    speciesTable: 'zone_species',
    speciesFk: 'zone_id',
    photoTable: 'zone_photos',
    photoFk: 'zone_id',
    createBody: (suffix) => ({ name: `Zone carac ${suffix}`, map_id: 'foret', points: POLYGON }),
  },
  marker: {
    base: '/api/map/markers',
    nameField: 'label',
    textField: 'note',
    notFound: 'Repère introuvable',
    nameRequired: 'Label requis',
    visitTable: 'visit_markers',
    categoryTable: 'marker_categories',
    categoryFk: 'marker_id',
    speciesTable: 'marker_species',
    speciesFk: 'marker_id',
    photoTable: 'marker_photos',
    photoFk: 'marker_id',
    createBody: (suffix) => ({
      label: `Repère carac ${suffix}`,
      map_id: 'foret',
      x_pct: 12,
      y_pct: 34,
    }),
  },
};

/**
 * Clés exactes de la réponse d'un PUT. La zone relit `zones.*` + l'éditorial visite ; le
 * repère, `map_markers.*` + l'éditorial visite. Toute clé ajoutée ou retirée doit être un
 * choix explicite.
 *
 * Bascule explicite de la piste C (audit du 25/09/2026, § 3.5, temps T1/T2) : `current_plant`,
 * `stage` et `history` (zone), `plant_name` (repère) ne sortent plus — leur suppression au
 * temps T3 ne changera donc plus rien pour les clients.
 */
const PUT_RESPONSE_KEYS = {
  zone: [
    'categories',
    'category_ids',
    'color',
    'description',
    'edit_revision',
    'emoji',
    // Texte e-nov (migration 313) : lu et écrit par la console (gestionnaire).
    'enov_description',
    'has_visit_body',
    'height',
    'hidden_surfaces',
    'id',
    'is_infrastructure',
    'links',
    'living_beings_list',
    'map_id',
    'name',
    'notes',
    'points',
    'search_aliases',
    'shape',
    'special',
    'species',
    'species_ids',
    'visible_group_ids',
    'visible_role_slugs',
    'visit_body_json',
    'visit_details_text',
    'visit_details_title',
    'visit_short_description',
    'visit_subtitle',
    'width',
    'x',
    'y',
  ],
  marker: [
    'categories',
    'category_ids',
    'created_at',
    'edit_revision',
    'emoji',
    'enov_description',
    'hidden_surfaces',
    'id',
    'is_infrastructure',
    'label',
    'links',
    'living_beings_list',
    'map_id',
    'note',
    'notes',
    'search_aliases',
    'species',
    'species_ids',
    'visible_group_ids',
    'visible_role_slugs',
    'visit_body_json',
    'visit_details_text',
    'visit_details_title',
    'visit_short_description',
    'visit_subtitle',
    'x_pct',
    'y_pct',
  ],
};

let token;
let plantA;
let plantB;
let groupId;
let categoryId;
const created = { zone: [], marker: [] };

function asTeacher(req) {
  return req.set('Authorization', `Bearer ${token}`);
}

async function createLocation(kind) {
  const suffix = crypto.randomUUID().slice(0, 6);
  const res = await asTeacher(request(app).post(KINDS[kind].base))
    .send(KINDS[kind].createBody(suffix))
    .expect(201);
  created[kind].push(res.body.id);
  return res.body;
}

function put(kind, id, body) {
  return asTeacher(request(app).put(`${KINDS[kind].base}/${encodeURIComponent(id)}`)).send(body);
}

test.before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken({ extraPermissions: ['map.manage_markers'] });
  const suffix = crypto.randomUUID().slice(0, 6);
  plantA = await fx.createPlant({ name: `Carac Achillée ${suffix}`, emoji: '🌼' });
  plantB = await fx.createPlant({ name: `Carac Bourrache ${suffix}`, emoji: '💠' });
  groupId = crypto.randomUUID();
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [groupId, `carac-${groupId.slice(0, 8)}`, 'Classe carac'],
  );
  categoryId = (await fx.createLocationCategory({ label: `Carac ${suffix}` })).id;
});

test.beforeEach(async () => {
  token = await ensureAdminTeacherAuthToken({ extraPermissions: ['map.manage_markers'] });
});

test.after(async () => {
  for (const id of created.zone) await execute('DELETE FROM zones WHERE id = ?', [id]);
  for (const id of created.marker) await execute('DELETE FROM map_markers WHERE id = ?', [id]);
  await execute('DELETE FROM location_categories WHERE id = ?', [categoryId]);
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
  await execute('DELETE FROM plants WHERE id IN (?, ?)', [plantA.id, plantB.id]);
});

for (const kind of Object.keys(KINDS)) {
  const K = KINDS[kind];

  test(`${kind} — droits : sans jeton 401, lieu inconnu 404`, async () => {
    const loc = await createLocation(kind);
    const anon = await request(app).put(`${K.base}/${loc.id}`).send({}).expect(401);
    assert.deepEqual(anon.body, { error: 'Token requis' });
    const missing = await put(kind, 'inconnu-carac', {}).expect(404);
    assert.deepEqual(missing.body, { error: K.notFound });
  });

  test(`${kind} — erreurs de validation (400, message exact)`, async () => {
    const loc = await createLocation(kind);
    const cases = [
      [{ [K.nameField]: '   ' }, K.nameRequired],
      [
        { hidden_surfaces: ['bogus'] },
        'hidden_surfaces : surface inconnue (map, visit, plan, staff, enov)',
      ],
      [
        { visible_role_slugs: ['??'] },
        'visible_role_slugs : rôle inconnu (attendus : visiteur, personnel, eleve_novice, eleve_avance, eleve_chevronne, prof_classe, prof, admin)',
      ],
      [
        { visible_group_ids: ['00000000-0000-0000-0000-000000000000'] },
        'visible_group_ids : groupe inconnu (00000000-0000-0000-0000-000000000000)',
      ],
      [
        { links: [{ url: 'javascript:alert(1)', label: 'x' }] },
        'links[0].url : adresse non reconnue (attendu https://…, /page-de-l-application, mailto: ou tel:)',
      ],
      [{ links: 'x' }, 'links doit être un tableau'],
      [{ notes: 'x' }, 'notes doit être un tableau'],
      [{ notes: [{ body: '' }] }, 'notes[0].body : texte requis'],
      [{ map_id: '  ' }, 'map_id invalide'],
      [{ map_id: 'carte-inexistante' }, 'Carte introuvable'],
    ];
    if (kind === 'zone') {
      cases.push([{ points: [{ xp: 1 }] }, 'Au moins 3 sommets {xp, yp} numériques requis']);
    }
    for (const [body, error] of cases) {
      const res = await put(kind, loc.id, body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} → ${res.status}`);
      assert.deepEqual(res.body, { error }, JSON.stringify(body));
    }
    // Aucune de ces requêtes refusées n'a rien écrit.
    const table = kind === 'zone' ? 'zones' : 'map_markers';
    const row = await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [loc.id]);
    assert.equal(row[K.nameField], loc[K.nameField]);
  });

  test(`${kind} — champs simples : écrits, relus, clés de réponse figées`, async () => {
    const loc = await createLocation(kind);
    const res = await put(kind, loc.id, {
      [K.nameField]: '  Nouveau nom  ',
      [K.textField]: 'Texte de travail',
      emoji: '🍄',
      search_aliases: 'alias un ; alias deux',
      hidden_surfaces: ['plan'],
      ...(kind === 'zone' ? { color: '#123456' } : {}),
    }).expect(200);
    assert.deepEqual(Object.keys(res.body).sort(), PUT_RESPONSE_KEYS[kind]);
    assert.equal(res.body[K.nameField], 'Nouveau nom');
    assert.equal(res.body[K.textField], 'Texte de travail');
    assert.equal(res.body.emoji, '🍄');
    assert.equal(res.body.search_aliases, 'alias un ; alias deux');
    assert.deepEqual(res.body.hidden_surfaces, ['plan']);
    assert.deepEqual(res.body.visible_role_slugs, []);
    assert.deepEqual(res.body.visible_group_ids, []);
    assert.equal(res.body.map_id, 'foret');
    if (kind === 'zone') {
      assert.equal(res.body.color, '#123456');
      assert.equal(res.body.has_visit_body, 0);
      assert.equal(res.body.special, false);
    } else {
      assert.equal(res.body.x_pct, 12);
      assert.equal(res.body.y_pct, 34);
    }
    // Champs omis = inchangés.
    const again = await put(kind, loc.id, {}).expect(200);
    assert.equal(again.body[K.nameField], 'Nouveau nom');
    assert.equal(again.body.search_aliases, 'alias un ; alias deux');
    assert.deepEqual(again.body.hidden_surfaces, ['plan']);
    // `search_aliases: ''` efface, `hidden_surfaces: []` rouvre toutes les surfaces.
    const cleared = await put(kind, loc.id, { search_aliases: '', hidden_surfaces: [] }).expect(
      200,
    );
    // (la colonne reçoit NULL ; la sérialisation la rend en chaîne vide)
    assert.equal(cleared.body.search_aliases, '');
    assert.deepEqual(cleared.body.hidden_surfaces, []);
  });

  test(`${kind} — emoji : '' efface, omis conservé`, async () => {
    const loc = await createLocation(kind);
    await put(kind, loc.id, { emoji: '🦔' }).expect(200);
    const kept = await put(kind, loc.id, { [K.textField]: 'x' }).expect(200);
    assert.equal(kept.body.emoji, '🦔');
    const erased = await put(kind, loc.id, { emoji: '' }).expect(200);
    assert.equal(erased.body.emoji, '');
  });

  test(`${kind} — espèces : noms, identifiants, omission, liste vide`, async () => {
    const loc = await createLocation(kind);
    const byNames = await put(kind, loc.id, {
      living_beings: [plantB.name, plantA.name],
    }).expect(200);
    // Ordre de la jonction : par nom de fiche.
    assert.deepEqual(byNames.body.species_ids, [plantA.id, plantB.id]);
    assert.deepEqual(byNames.body.living_beings_list, [plantA.name, plantB.name]);
    assert.deepEqual(byNames.body.species, [
      { id: plantA.id, name: plantA.name, emoji: '🌼' },
      { id: plantB.id, name: plantB.name, emoji: '💠' },
    ]);
    // Corps sans `living_beings` ni `species_ids` : jonction intacte.
    const untouched = await put(kind, loc.id, { [K.textField]: 'y' }).expect(200);
    assert.deepEqual(untouched.body.species_ids, [plantA.id, plantB.id]);
    // `species_ids` seul : prend le pas, les noms sont relus depuis le catalogue.
    const byIds = await put(kind, loc.id, { species_ids: [plantB.id] }).expect(200);
    assert.deepEqual(byIds.body.species_ids, [plantB.id]);
    assert.deepEqual(byIds.body.living_beings_list, [plantB.name]);
    // Nom inconnu du catalogue : aucune jonction.
    const unknown = await put(kind, loc.id, { living_beings: ['Espèce absente du catalogue'] });
    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.body.species_ids, []);
    assert.deepEqual(unknown.body.living_beings_list, []);
    // Liste vide : tout est retiré.
    await put(kind, loc.id, { living_beings: [plantA.name] }).expect(200);
    const emptied = await put(kind, loc.id, { living_beings: [] }).expect(200);
    assert.deepEqual(emptied.body.species_ids, []);
    const rows = await queryAll(`SELECT plant_id FROM ${K.speciesTable} WHERE ${K.speciesFk} = ?`, [
      loc.id,
    ]);
    assert.equal(rows.length, 0);
  });

  test(`${kind} — nom mono-espèce hérité : ni lu, ni écrit (piste C, T1/T2)`, async () => {
    const loc = await createLocation(kind);
    const legacyField = kind === 'zone' ? 'current_plant' : 'plant_name';
    const table = kind === 'zone' ? 'zones' : 'map_markers';
    // Avant la piste C : écrit tel quel, puis relu en repli (« Nom hérité » dans la liste).
    // Désormais : le champ du corps est ignoré, la colonne n'est pas touchée.
    const res = await put(kind, loc.id, { [legacyField]: 'Nom hérité' }).expect(200);
    assert.ok(!(legacyField in res.body), `${legacyField} ne sort plus`);
    assert.deepEqual(res.body.living_beings_list, []);
    assert.deepEqual(res.body.species_ids, []);
    const row = await queryOne(`SELECT ${legacyField} AS v FROM ${table} WHERE id = ?`, [loc.id]);
    assert.equal(row.v, '');
    // Une valeur restée en base (données anciennes) n'est plus relue en repli.
    await execute(`UPDATE ${table} SET ${legacyField} = ? WHERE id = ?`, ['Resté en base', loc.id]);
    const reread = await put(kind, loc.id, {}).expect(200);
    assert.deepEqual(reread.body.living_beings_list, []);
    const list = await asTeacher(request(app).get(`${K.base}?map_id=foret`)).expect(200);
    const listed = list.body.find((item) => item.id === loc.id);
    assert.deepEqual(listed.living_beings_list, []);
    // …ni réécrite : elle attend le temps T3 telle quelle.
    await put(kind, loc.id, { living_beings: [plantA.name] }).expect(200);
    const kept = await queryOne(`SELECT ${legacyField} AS v FROM ${table} WHERE id = ?`, [loc.id]);
    assert.equal(kept.v, 'Resté en base');
  });

  if (kind === 'zone') {
    test('zone — historique de cultures (zone_history) : ni écrit, ni relu (piste C, T1/T2)', async () => {
      const loc = await createLocation('zone');
      await execute('UPDATE zones SET current_plant = ? WHERE id = ?', [
        'Ancienne culture',
        loc.id,
      ]);
      await put('zone', loc.id, { living_beings: [plantA.name] }).expect(200);
      const written = await queryAll('SELECT id FROM zone_history WHERE zone_id = ?', [loc.id]);
      assert.equal(written.length, 0, 'plus d’archivage dans zone_history');
      await execute('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)', [
        loc.id,
        'Radis',
        '2025-01-20',
      ]);
      const detail = await asTeacher(request(app).get(`/api/zones/${loc.id}`)).expect(200);
      assert.ok(!('history' in detail.body) && !('history_truncated' in detail.body));
      // La suppression de la zone laisse la clé étrangère (ON DELETE CASCADE) nettoyer.
      await asTeacher(request(app).delete(`/api/zones/${loc.id}`)).expect(200);
      const left = await queryAll('SELECT id FROM zone_history WHERE zone_id = ?', [loc.id]);
      assert.equal(left.length, 0);
    });
  }

  test(`${kind} — catégories : posées, conservées si omises, retirées par []`, async () => {
    const loc = await createLocation(kind);
    const set = await put(kind, loc.id, { category_ids: [categoryId] }).expect(200);
    assert.deepEqual(set.body.category_ids, [categoryId]);
    assert.equal(set.body.categories.length, 1);
    assert.equal(set.body.categories[0].id, categoryId);
    assert.equal(set.body.is_infrastructure, false);
    const kept = await put(kind, loc.id, { [K.textField]: 'z' }).expect(200);
    assert.deepEqual(kept.body.category_ids, [categoryId]);
    // Identifiant inconnu : ignoré sans erreur.
    const unknown = await put(kind, loc.id, { category_ids: ['cat-inconnue'] }).expect(200);
    assert.deepEqual(unknown.body.category_ids, []);
    const rows = await queryAll(
      `SELECT category_id FROM ${K.categoryTable} WHERE ${K.categoryFk} = ?`,
      [loc.id],
    );
    assert.equal(rows.length, 0);
  });

  test(`${kind} — audience : rôles et groupes, miroir vers la visite`, async () => {
    const loc = await createLocation(kind);
    // Éditorial visite : crée la ligne miroir.
    const withVisit = await put(kind, loc.id, {
      visit_subtitle: 'Sous-titre',
      visit_short_description: 'Accroche',
    }).expect(200);
    assert.equal(withVisit.body.visit_subtitle, 'Sous-titre');
    assert.equal(withVisit.body.visit_short_description, 'Accroche');
    assert.equal(withVisit.body.visit_details_title, 'Détails');
    const res = await put(kind, loc.id, {
      visible_role_slugs: ['prof'],
      visible_group_ids: [groupId],
    }).expect(200);
    assert.deepEqual(res.body.visible_role_slugs, ['prof']);
    assert.deepEqual(res.body.visible_group_ids, [groupId]);
    const mirror = await queryOne(
      `SELECT visible_role_slugs, visible_group_ids, subtitle FROM ${K.visitTable} WHERE id = ?`,
      [loc.id],
    );
    assert.equal(mirror.visible_role_slugs, '["prof"]');
    assert.equal(mirror.visible_group_ids, JSON.stringify([groupId]));
    assert.equal(mirror.subtitle, 'Sous-titre');
    // Omis = inchangés.
    const kept = await put(kind, loc.id, { [K.textField]: 'k' }).expect(200);
    assert.deepEqual(kept.body.visible_role_slugs, ['prof']);
    assert.deepEqual(kept.body.visible_group_ids, [groupId]);
  });

  test(`${kind} — liens et compléments réservés : remplacés, conservés, vidés`, async () => {
    const loc = await createLocation(kind);
    const res = await put(kind, loc.id, {
      links: [{ url: 'https://example.org/fiche', label: 'Fiche' }],
      notes: [{ body: 'Complément prof', role_slugs: ['prof'] }],
    }).expect(200);
    assert.equal(res.body.links.length, 1);
    assert.equal(res.body.links[0].url, 'https://example.org/fiche');
    assert.equal(res.body.links[0].label, 'Fiche');
    assert.equal(res.body.notes.length, 1);
    assert.equal(res.body.notes[0].body, 'Complément prof');
    const kept = await put(kind, loc.id, { [K.textField]: 'k' }).expect(200);
    assert.equal(kept.body.links.length, 1);
    assert.equal(kept.body.notes.length, 1);
    const emptied = await put(kind, loc.id, { links: [], notes: [] }).expect(200);
    assert.deepEqual(emptied.body.links, []);
    assert.deepEqual(emptied.body.notes, []);
  });

  test(`${kind} — photos : un PUT ne touche pas aux photos du lieu`, async () => {
    const loc = await createLocation(kind);
    await asTeacher(request(app).post(`${K.base}/${loc.id}/photos`))
      .send({ image_data: TINY_PNG_DATA_URL, caption: 'Photo carac' })
      .expect(201);
    await put(kind, loc.id, { [K.nameField]: 'Avec photo', living_beings: [] }).expect(200);
    const photos = await asTeacher(request(app).get(`${K.base}/${loc.id}/photos`)).expect(200);
    assert.equal(photos.body.length, 1);
    assert.equal(photos.body[0].caption, 'Photo carac');
    const rows = await queryAll(`SELECT id FROM ${K.photoTable} WHERE ${K.photoFk} = ?`, [loc.id]);
    assert.equal(rows.length, 1);
  });

  test(`${kind} — changement de carte`, async () => {
    const loc = await createLocation(kind);
    const res = await put(kind, loc.id, { map_id: ' n3 ' }).expect(200);
    assert.equal(res.body.map_id, 'n3');
  });
}

test('zone — points : remplacés par un polygone valide, conservés si omis', async () => {
  const loc = await createLocation('zone');
  const next = [
    { xp: 1, yp: 1 },
    { xp: 9, yp: 1 },
    { xp: 9, yp: 9 },
    { xp: 1, yp: 9 },
  ];
  const res = await put('zone', loc.id, { points: next }).expect(200);
  assert.deepEqual(JSON.parse(res.body.points), next);
  const kept = await put('zone', loc.id, { description: 'd' }).expect(200);
  assert.deepEqual(JSON.parse(kept.body.points), next);
});

test('zone — catégorie d’infrastructure : `special` en est le miroir', async () => {
  const loc = await createLocation('zone');
  const infra = await put('zone', loc.id, { category_ids: ['cat-infrastructure'] }).expect(200);
  assert.equal(infra.body.special, true);
  assert.equal(infra.body.is_infrastructure, true);
  const plain = await put('zone', loc.id, { category_ids: [] }).expect(200);
  assert.equal(plain.body.special, false);
});

test('repère — défaut figé : `x_pct` hors bornes accepté en modification (refusé en création)', async () => {
  const loc = await createLocation('marker');
  const res = await put('marker', loc.id, { x_pct: 150, y_pct: -5 }).expect(200);
  assert.equal(res.body.x_pct, 150);
  assert.equal(res.body.y_pct, -5);
  const createRes = await asTeacher(request(app).post('/api/map/markers'))
    .send({ label: 'Hors bornes', map_id: 'foret', x_pct: 150, y_pct: 5 })
    .expect(400);
  assert.deepEqual(createRes.body, { error: 'x_pct doit être un nombre entre 0 et 100' });
});

// ── Création, lecture, suppression : les autres handlers jumeaux ───────────────────────

/** Clés de la réponse d'une création (la zone relit `zones.*` seul, sans l'éditorial). */
const POST_RESPONSE_KEYS = {
  zone: PUT_RESPONSE_KEYS.zone.filter(
    (key) => !key.startsWith('visit_') && key !== 'has_visit_body',
  ),
  marker: PUT_RESPONSE_KEYS.marker,
};

/** Clés d'un lieu dans la liste (`GET /api/zones`, `GET /api/map/markers`). */
const LIST_ITEM_KEYS = {
  zone: PUT_RESPONSE_KEYS.zone.filter((key) => key !== 'visit_body_json'),
  marker: PUT_RESPONSE_KEYS.marker,
};

for (const kind of Object.keys(KINDS)) {
  const K = KINDS[kind];

  test(`${kind} — POST : clés de réponse, champs par défaut`, async () => {
    const loc = await createLocation(kind);
    assert.deepEqual(Object.keys(loc).sort(), POST_RESPONSE_KEYS[kind]);
    assert.deepEqual(loc.species_ids, []);
    assert.deepEqual(loc.living_beings_list, []);
    assert.deepEqual(loc.category_ids, []);
    assert.deepEqual(loc.links, []);
    assert.deepEqual(loc.notes, []);
    assert.deepEqual(loc.hidden_surfaces, []);
    assert.equal(loc.emoji, '');
    if (kind === 'zone') {
      assert.equal(loc.color, '#86efac80');
      assert.equal(loc.description, '');
    } else {
      assert.equal(loc.note, '');
    }
  });

  test(`${kind} — POST : espèces, nom requis, carte inconnue`, async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const res = await asTeacher(request(app).post(K.base))
      .send({ ...K.createBody(suffix), living_beings: [plantA.name] })
      .expect(201);
    created[kind].push(res.body.id);
    assert.deepEqual(res.body.species_ids, [plantA.id]);
    const noName = await asTeacher(request(app).post(K.base))
      .send({ ...K.createBody(suffix), [K.nameField]: ' ' })
      .expect(400);
    assert.deepEqual(noName.body, { error: K.nameRequired });
    const noMap = await asTeacher(request(app).post(K.base))
      .send({ ...K.createBody(suffix), map_id: 'carte-inexistante' })
      .expect(400);
    assert.deepEqual(noMap.body, { error: 'Carte introuvable' });
    const anon = await request(app).post(K.base).send(K.createBody(suffix)).expect(401);
    assert.deepEqual(anon.body, { error: 'Token requis' });
  });

  test(`${kind} — GET liste : clés d'un lieu`, async () => {
    const loc = await createLocation(kind);
    const list = await asTeacher(request(app).get(`${K.base}?map_id=foret`)).expect(200);
    const item = list.body.find((row) => row.id === loc.id);
    assert.ok(item, 'lieu créé absent de la liste');
    assert.deepEqual(Object.keys(item).sort(), LIST_ITEM_KEYS[kind]);
  });

  test(`${kind} — DELETE : succès puis 404`, async () => {
    const loc = await createLocation(kind);
    const del = await asTeacher(request(app).delete(`${K.base}/${loc.id}`)).expect(200);
    assert.deepEqual(del.body, { success: true });
    const again = await asTeacher(request(app).delete(`${K.base}/${loc.id}`)).expect(404);
    assert.deepEqual(again.body, { error: K.notFound });
  });
}

test('zone — GET /api/zones/:id : clés du détail', async () => {
  const loc = await createLocation('zone');
  const detail = await asTeacher(request(app).get(`/api/zones/${loc.id}`)).expect(200);
  assert.deepEqual(Object.keys(detail.body).sort(), PUT_RESPONSE_KEYS.zone);
});
