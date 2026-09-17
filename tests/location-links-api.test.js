'use strict';

/**
 * Liens documentaires d'un lieu — parcours HTTP complet (migration 261).
 *
 * Ce que ce test protège :
 * - un lien réservé ne quitte **jamais** le serveur pour un lecteur hors audience, sur aucune
 *   des surfaces (carte de travail, Plan public) ;
 * - `audience_role_slugs` n'est servi qu'aux gestionnaires — sinon la simple lecture d'une
 *   fiche révélerait la cartographie des rôles du lieu ;
 * - omettre `links` conserve les liens, `[]` les efface (l'interface envoie `[]` quand on
 *   retire la dernière ligne : confondre les deux rendrait la suppression impossible) ;
 * - la suppression d'un lieu emporte ses liens — la cible est polymorphe, donc aucune clé
 *   étrangère ne peut s'en charger.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, queryAll } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const fx = require('./helpers/fmFixtures');

let teacherToken;
let mapId;

function auth(req) {
  return req.set('Authorization', 'Bearer ' + teacherToken);
}

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 40, yp: 10 },
  { xp: 40, yp: 40 },
  { xp: 10, yp: 40 },
];

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  const map = await fx.createMap({ label: 'Carte liens' });
  mapId = map.id;
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test('zone : les liens sont créés, ordonnés et rendus avec is_external', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Verger',
      points: POLYGON,
      map_id: mapId,
      links: [
        { label: 'Fiche entretien', url: 'https://exemple.org/verger.pdf' },
        { label: 'Le tutoriel', url: '/tutoriels/3' },
        { label: 'Écrire', url: 'mailto:jardin@exemple.org' },
      ],
    })
    .expect(201);

  assert.deepEqual(
    created.body.links.map((l) => [l.label, l.sort_order, l.is_external]),
    [
      ['Fiche entretien', 0, true],
      ['Le tutoriel', 1, false],
      ['Écrire', 2, false],
    ],
  );

  const detail = await auth(request(app).get(`/api/zones/${created.body.id}`)).expect(200);
  assert.equal(detail.body.links.length, 3);
});

test('zone : URL hors politique → 400, et rien n’est enregistré', async () => {
  const res = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Zone piégée',
      points: POLYGON,
      map_id: mapId,
      links: [{ label: 'Piège', url: 'javascript:alert(1)' }],
    })
    .expect(400);
  assert.match(res.body.error, /adresse non reconnue/i);

  const protoRelative = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Zone piégée 2',
      points: POLYGON,
      map_id: mapId,
      links: [{ label: 'Piège', url: '//exemple.org' }],
    })
    .expect(400);
  assert.match(protoRelative.body.error, /adresse non reconnue/i);
});

test('lien réservé : absent pour l’anonyme, présent pour le gestionnaire', async () => {
  const created = await auth(request(app).post('/api/map/markers'))
    .send({
      label: 'Cabane',
      x_pct: 30,
      y_pct: 40,
      map_id: mapId,
      visible_role_slugs: [],
      links: [
        { label: 'Horaires', url: 'https://exemple.org/horaires' },
        { label: 'Procédure clés', url: '/interne/cles', audience_role_slugs: ['prof'] },
      ],
    })
    .expect(201);

  const anon = await request(app).get(`/api/map/markers?map_id=${mapId}`).expect(200);
  const anonRow = anon.body.find((m) => m.id === created.body.id);
  assert.ok(anonRow, 'le repère lui-même reste public');
  assert.deepEqual(
    anonRow.links.map((l) => l.label),
    ['Horaires'],
  );
  // La cartographie des rôles ne fuit pas avec le lien public.
  assert.equal(anonRow.links[0].audience_role_slugs, undefined);

  const manager = await auth(request(app).get(`/api/map/markers?map_id=${mapId}`)).expect(200);
  const managerRow = manager.body.find((m) => m.id === created.body.id);
  assert.deepEqual(
    managerRow.links.map((l) => l.label),
    ['Horaires', 'Procédure clés'],
  );
  assert.deepEqual(managerRow.links[1].audience_role_slugs, ['prof']);
});

test('mise à jour : omettre links conserve, [] efface', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Mare',
      points: POLYGON,
      map_id: mapId,
      links: [{ label: 'Protocole', url: 'https://exemple.org/mare' }],
    })
    .expect(201);
  const zoneId = created.body.id;

  const renamed = await auth(request(app).put(`/api/zones/${zoneId}`))
    .send({ name: 'Mare pédagogique' })
    .expect(200);
  assert.deepEqual(
    renamed.body.links.map((l) => l.label),
    ['Protocole'],
    'un PUT sans `links` ne doit pas effacer les liens',
  );

  const cleared = await auth(request(app).put(`/api/zones/${zoneId}`))
    .send({ links: [] })
    .expect(200);
  assert.deepEqual(cleared.body.links, []);

  const rows = await queryAll(
    'SELECT id FROM location_links WHERE location_kind = ? AND location_id = ?',
    ['zone', zoneId],
  );
  assert.equal(rows.length, 0);
});

test('mise à jour : le remplacement réordonne sans laisser d’orphelin', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Serre',
      points: POLYGON,
      map_id: mapId,
      links: [
        { label: 'A', url: 'https://a.exemple.org' },
        { label: 'B', url: 'https://b.exemple.org' },
      ],
    })
    .expect(201);

  const reordered = await auth(request(app).put(`/api/zones/${created.body.id}`))
    .send({
      links: [
        { label: 'B', url: 'https://b.exemple.org' },
        { label: 'A', url: 'https://a.exemple.org' },
      ],
    })
    .expect(200);
  assert.deepEqual(
    reordered.body.links.map((l) => l.label),
    ['B', 'A'],
  );
  const rows = await queryAll(
    'SELECT id FROM location_links WHERE location_kind = ? AND location_id = ?',
    ['zone', created.body.id],
  );
  assert.equal(rows.length, 2, 'remplacement complet : pas de ligne orpheline');
});

test('suppression du lieu : les liens partent avec (aucune clé étrangère ne le ferait)', async () => {
  const zone = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Zone éphémère',
      points: POLYGON,
      map_id: mapId,
      links: [{ label: 'Doc', url: 'https://exemple.org/doc' }],
    })
    .expect(201);
  const marker = await auth(request(app).post('/api/map/markers'))
    .send({
      label: 'Repère éphémère',
      x_pct: 50,
      y_pct: 50,
      map_id: mapId,
      links: [{ label: 'Doc', url: 'https://exemple.org/doc' }],
    })
    .expect(201);

  await auth(request(app).delete(`/api/zones/${zone.body.id}`)).expect(200);
  await auth(request(app).delete(`/api/map/markers/${marker.body.id}`)).expect(200);

  const rows = await queryAll('SELECT id FROM location_links WHERE location_id IN (?, ?)', [
    zone.body.id,
    marker.body.id,
  ]);
  assert.equal(rows.length, 0);
});
