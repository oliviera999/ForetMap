'use strict';

/**
 * Audience par **groupes** et **héritage par catégorie** (migration 262) — parcours HTTP.
 *
 * Ce que ce test protège, avec de vrais comptes et de vraies appartenances :
 * - un lieu restreint à une classe est **absent** de la charge servie à un élève d'une autre
 *   classe — pas grisé, pas filtré côté client : absent ;
 * - un lieu sans audience propre, rangé dans une catégorie réservée, hérite de sa restriction ;
 * - une catégorie **neutre** à côté d'une catégorie réservée ne rouvre pas le lieu (l'union
 *   avec « public » vaudrait « public » — c'est le piège de l'héritage) ;
 * - une audience posée sur le lieu l'emporte sur celle de sa catégorie ;
 * - le catalogue public de catégories ne révèle pas quels rôles ou groupes elles visent ;
 * - un identifiant de groupe inconnu est refusé à l'écriture, plutôt que de produire un lieu
 *   que plus personne ne voit.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('node:crypto');

const { initSchema, initDatabase, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const fx = require('./helpers/fmFixtures');

let teacherToken;
let mapId;
/** Deux classes distinctes : c'est la comparaison qui donne son sens au test. */
let groupA;
let groupB;
let studentA;
let studentB;

function auth(req) {
  return req.set('Authorization', 'Bearer ' + teacherToken);
}
function asStudent(req, token) {
  return req.set('Authorization', 'Bearer ' + token);
}

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 40, yp: 10 },
  { xp: 40, yp: 40 },
];

async function createGroup(name) {
  const id = crypto.randomUUID();
  const slug = `aud-${id.slice(0, 8)}`;
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [id, slug, name],
  );
  return id;
}

async function registerStudentInGroup(prefix, groupId) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Aud${stamp}`,
      email: `${prefix.toLowerCase()}_${stamp}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
  await setStudentPrimaryRole(res.body.id, 'eleve_novice');
  await execute(
    "INSERT IGNORE INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [groupId, res.body.id],
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: res.body.email, password: 'pass1234' })
    .expect(200);
  return { id: res.body.id, token: login.body.authToken };
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  const map = await fx.createMap({ label: 'Carte audience groupes' });
  mapId = map.id;
  groupA = await createGroup('Classe A');
  groupB = await createGroup('Classe B');
  studentA = await registerStudentInGroup('Aline', groupA);
  studentB = await registerStudentInGroup('Bruno', groupB);
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test('lieu restreint à une classe : absent pour l’élève de l’autre classe', async () => {
  const zone = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Parcelle de la classe A',
      points: POLYGON,
      map_id: mapId,
      visible_group_ids: [groupA],
    })
    .expect(201);
  assert.deepEqual(zone.body.visible_group_ids, [groupA]);

  const seenByA = await asStudent(request(app).get(`/api/zones?map_id=${mapId}`), studentA.token)
    .expect(200)
    .then((r) => r.body.map((z) => z.id));
  assert.ok(seenByA.includes(zone.body.id), 'l’élève de la classe A voit sa parcelle');

  const seenByB = await asStudent(request(app).get(`/api/zones?map_id=${mapId}`), studentB.token)
    .expect(200)
    .then((r) => r.body.map((z) => z.id));
  assert.ok(!seenByB.includes(zone.body.id), 'l’élève de la classe B ne la voit pas');

  const anon = await request(app).get(`/api/zones?map_id=${mapId}`).expect(200);
  assert.ok(!anon.body.some((z) => z.id === zone.body.id), 'l’anonyme non plus');
});

test('union : un rôle coché suffit, même sans appartenance au groupe', async () => {
  const zone = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Union rôle ou groupe',
      points: POLYGON,
      map_id: mapId,
      visible_role_slugs: ['eleve_novice'],
      visible_group_ids: [groupA],
    })
    .expect(201);
  // Bruno n'est pas dans la classe A, mais il a le rôle : l'union suffit.
  const seenByB = await asStudent(request(app).get(`/api/zones?map_id=${mapId}`), studentB.token)
    .expect(200)
    .then((r) => r.body.map((z) => z.id));
  assert.ok(seenByB.includes(zone.body.id));
});

test('héritage : un lieu sans audience prend celle de sa catégorie', async () => {
  const category = await auth(request(app).post('/api/map-categories'))
    .send({
      label: 'Locaux classe A',
      map_id: mapId,
      applies_to: 'both',
      visible_group_ids: [groupA],
    })
    .expect(201);
  assert.deepEqual(category.body.visible_group_ids, [groupA]);

  const zone = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Local hérité',
      points: POLYGON,
      map_id: mapId,
      category_ids: [category.body.id],
    })
    .expect(201);
  assert.deepEqual(zone.body.visible_group_ids, [], 'le lieu ne déclare rien lui-même');

  const seenByA = await asStudent(request(app).get(`/api/zones?map_id=${mapId}`), studentA.token)
    .expect(200)
    .then((r) => r.body.map((z) => z.id));
  const seenByB = await asStudent(request(app).get(`/api/zones?map_id=${mapId}`), studentB.token)
    .expect(200)
    .then((r) => r.body.map((z) => z.id));
  assert.ok(seenByA.includes(zone.body.id), 'hérite bien de la restriction pour la classe A');
  assert.ok(!seenByB.includes(zone.body.id), 'et la classe B ne le voit pas');
});

test('héritage : une catégorie neutre ne rouvre pas un lieu restreint par une autre', async () => {
  const restricted = await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Réservée A', map_id: mapId, visible_group_ids: [groupA] })
    .expect(201);
  const neutral = await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Ordinaire', map_id: mapId })
    .expect(201);

  const zone = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Deux catégories',
      points: POLYGON,
      map_id: mapId,
      category_ids: [restricted.body.id, neutral.body.id],
    })
    .expect(201);

  const seenByB = await asStudent(request(app).get(`/api/zones?map_id=${mapId}`), studentB.token)
    .expect(200)
    .then((r) => r.body.map((z) => z.id));
  assert.ok(!seenByB.includes(zone.body.id), 'la catégorie neutre ne doit rien rouvrir');
});

test('héritage : l’audience du lieu l’emporte sur celle de sa catégorie', async () => {
  const category = await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Réservée A bis', map_id: mapId, visible_group_ids: [groupA] })
    .expect(201);
  const zone = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Lieu qui se déclare',
      points: POLYGON,
      map_id: mapId,
      category_ids: [category.body.id],
      visible_group_ids: [groupB],
    })
    .expect(201);

  const seenByA = await asStudent(request(app).get(`/api/zones?map_id=${mapId}`), studentA.token)
    .expect(200)
    .then((r) => r.body.map((z) => z.id));
  const seenByB = await asStudent(request(app).get(`/api/zones?map_id=${mapId}`), studentB.token)
    .expect(200)
    .then((r) => r.body.map((z) => z.id));
  assert.ok(!seenByA.includes(zone.body.id), 'le réglage du lieu remplace celui de la catégorie');
  assert.ok(seenByB.includes(zone.body.id));
});

test('le catalogue public de catégories ne révèle pas l’audience', async () => {
  await auth(request(app).post('/api/map-categories'))
    .send({ label: 'Confidentielle', map_id: mapId, visible_group_ids: [groupA] })
    .expect(201);

  const catalog = await asStudent(
    request(app).get(`/api/map-categories?map_id=${mapId}`),
    studentB.token,
  ).expect(200);
  for (const category of catalog.body) {
    assert.equal(category.visible_role_slugs, undefined, category.label);
    assert.equal(category.visible_group_ids, undefined, category.label);
  }

  // L'écran de gestion, lui, en a besoin.
  const manage = await auth(request(app).get(`/api/map-categories/manage?map_id=${mapId}`)).expect(
    200,
  );
  const confidential = manage.body.find((c) => c.label === 'Confidentielle');
  assert.deepEqual(confidential.visible_group_ids, [groupA]);
});

test('groupe inconnu refusé à l’écriture, sur le lieu, le complément et les liens', async () => {
  const bad = 'groupe-qui-nexiste-pas';
  const zoneRes = await auth(request(app).post('/api/zones'))
    .send({ name: 'Zone coquille', points: POLYGON, map_id: mapId, visible_group_ids: [bad] })
    .expect(400);
  assert.match(zoneRes.body.error, /groupe inconnu/i);

  const noteRes = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Zone coquille 2',
      points: POLYGON,
      map_id: mapId,
      notes: [{ body: 'x', audience_group_ids: [bad] }],
    })
    .expect(400);
  assert.match(noteRes.body.error, /groupe inconnu/i);

  const linkRes = await auth(request(app).post('/api/map/markers'))
    .send({
      label: 'Repère coquille',
      x_pct: 10,
      y_pct: 10,
      map_id: mapId,
      links: [{ label: 'Doc', url: 'https://exemple.org/d', audience_group_ids: [bad] }],
    })
    .expect(400);
  assert.match(linkRes.body.error, /groupe inconnu/i);
});

test('lien réservé à une classe : absent pour l’élève d’une autre classe', async () => {
  const marker = await auth(request(app).post('/api/map/markers'))
    .send({
      label: 'Repère à liens',
      x_pct: 20,
      y_pct: 20,
      map_id: mapId,
      links: [
        { label: 'Public', url: 'https://exemple.org/public' },
        { label: 'Classe A', url: 'https://exemple.org/a', audience_group_ids: [groupA] },
      ],
    })
    .expect(201);

  const forA = await asStudent(request(app).get(`/api/map/markers?map_id=${mapId}`), studentA.token)
    .expect(200)
    .then((r) => r.body.find((m) => m.id === marker.body.id));
  assert.deepEqual(
    forA.links.map((l) => l.label),
    ['Public', 'Classe A'],
  );

  const forB = await asStudent(request(app).get(`/api/map/markers?map_id=${mapId}`), studentB.token)
    .expect(200)
    .then((r) => r.body.find((m) => m.id === marker.body.id));
  assert.deepEqual(
    forB.links.map((l) => l.label),
    ['Public'],
  );
});

test('sync carte → visite : la restriction par groupe survit au report', async () => {
  // Trou trouvé en relisant le diff : la synchronisation recopie les colonnes d'audience une
  // par une (liste blanche, pas de SELECT *). Sans les colonnes de groupes, un report ou un
  // « rebuild » aurait rendu publique, sur la Visite, une zone réservée à une classe — la
  // carte restant correcte, le trou serait passé inaperçu.
  const zone = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Zone visite classe A',
      points: POLYGON,
      map_id: mapId,
      visible_group_ids: [groupA],
      notes: [{ title: 'Classe A', body: 'Consigne classe A', audience_group_ids: [groupA] }],
    })
    .expect(201);

  await auth(request(app).post('/api/visit/sync'))
    .send({ map_id: mapId, direction: 'map_to_visit', zone_ids: [zone.body.id] })
    .expect(200);

  const { queryOne } = require('../database');
  const mirrored = await queryOne('SELECT visible_group_ids FROM visit_zones WHERE id = ?', [
    zone.body.id,
  ]);
  assert.ok(mirrored, 'la zone a bien été reportée sur la visite');
  assert.deepEqual(JSON.parse(mirrored.visible_group_ids), [groupA]);
  // Les compléments ne sont plus recopiés : ils vivent dans `location_notes`, clé sur
  // l'identifiant que la visite partage avec la carte. Il n'y a donc plus de copie à
  // synchroniser — ni à oublier de synchroniser, ce qui était le trou de la migration 262.
  const noteRow = await queryOne(
    'SELECT body, audience_group_ids FROM location_notes WHERE location_kind = ? AND location_id = ?',
    ['zone', zone.body.id],
  );
  assert.equal(noteRow.body, 'Consigne classe A');
  assert.deepEqual(JSON.parse(noteRow.audience_group_ids), [groupA]);

  // Et le filtrage tient sur la charge de visite servie à l'élève de l'autre classe.
  const { visitContentCache } = require('../routes/visit');
  if (visitContentCache?.clear) visitContentCache.clear();
  const forB = await asStudent(
    request(app).get(`/api/visit/content?map_id=${mapId}`),
    studentB.token,
  ).expect(200);
  assert.ok(
    !(forB.body.zones || []).some((z) => z.id === zone.body.id),
    'la classe B ne voit pas la zone sur la visite non plus',
  );
});

test('mise à jour : omettre les groupes les conserve, [] les efface', async () => {
  const zone = await auth(request(app).post('/api/zones'))
    .send({ name: 'Zone évolutive', points: POLYGON, map_id: mapId, visible_group_ids: [groupA] })
    .expect(201);

  const renamed = await auth(request(app).put(`/api/zones/${zone.body.id}`))
    .send({ name: 'Zone évolutive bis' })
    .expect(200);
  assert.deepEqual(
    renamed.body.visible_group_ids,
    [groupA],
    'un PUT sans le champ ne l’efface pas',
  );

  const cleared = await auth(request(app).put(`/api/zones/${zone.body.id}`))
    .send({ visible_group_ids: [] })
    .expect(200);
  assert.deepEqual(cleared.body.visible_group_ids, []);
  const anon = await request(app).get(`/api/zones?map_id=${mapId}`).expect(200);
  assert.ok(
    anon.body.some((z) => z.id === zone.body.id),
    'redevenue publique',
  );
});
