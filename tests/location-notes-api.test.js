'use strict';

/**
 * Compléments réservés **multiples** d'un lieu — parcours HTTP complet (migration 263).
 *
 * Ce que ce test protège :
 * - plusieurs compléments par lieu, chacun avec son audience : un lecteur reçoit exactement
 *   ceux qui le visent, jamais « tout ou rien » ;
 * - l'audience d'un complément n'est servie qu'aux gestionnaires — sinon la lecture d'une
 *   fiche révélerait à qui s'adressent les consignes ;
 * - omettre `notes` conserve les compléments, `[]` les efface ;
 * - le plafond par lieu est refusé côté serveur, pas seulement grisé côté interface ;
 * - **la carte et la Visite partagent les mêmes compléments** : c'est l'invariant du lot, et
 *   ce qui supprime la recopie de colonnes que la synchronisation traînait depuis la 240 ;
 * - la suppression d'un lieu emporte ses compléments (cible polymorphe : pas de clé étrangère).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('node:crypto');

const { initSchema, initDatabase, queryAll, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { LOCATION_NOTES_MAX } = require('../lib/locationNotes');
const { visitContentCache } = require('../routes/visit');
const fx = require('./helpers/fmFixtures');

let teacherToken;
let mapId;
let groupA;
let studentA;

function auth(req) {
  return req.set('Authorization', 'Bearer ' + teacherToken);
}
function asUser(req, token) {
  return req.set('Authorization', 'Bearer ' + token);
}

const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 40, yp: 10 },
  { xp: 40, yp: 40 },
];

async function createGroup(name) {
  const id = crypto.randomUUID();
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [id, `notes-${id.slice(0, 8)}`, name],
  );
  return id;
}

async function registerStudentInGroup(prefix, groupId) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Note${stamp}`,
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
  const map = await fx.createMap({ label: 'Carte compléments' });
  mapId = map.id;
  groupA = await createGroup('Classe compléments');
  studentA = await registerStudentInGroup('Nora', groupA);
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  if (visitContentCache && typeof visitContentCache.clear === 'function') {
    visitContentCache.clear();
  }
});

test('zone : plusieurs compléments, ordonnés, avec intitulé facultatif', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: 'Serre',
      points: POLYGON,
      map_id: mapId,
      notes: [
        { title: 'Arrosage', body: 'Tous les deux jours.' },
        { body: 'Sans intitulé' },
        { title: 'Clé', body: 'Au bureau des agents.', audience_role_slugs: ['personnel'] },
      ],
    })
    .expect(201);

  assert.deepEqual(
    created.body.notes.map((n) => [n.title, n.body, n.sort_order]),
    [
      ['Arrosage', 'Tous les deux jours.', 0],
      ['', 'Sans intitulé', 1],
      ['Clé', 'Au bureau des agents.', 2],
    ],
  );
  // Le gestionnaire édite : il lui faut l'audience de chaque complément.
  assert.deepEqual(created.body.notes[2].audience_role_slugs, ['personnel']);
});

test('chaque complément a sa propre audience : le lecteur reçoit exactement les siens', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: `Atelier ${Date.now()}`,
      points: POLYGON,
      map_id: mapId,
      notes: [
        { title: 'Pour la classe', body: 'Relevé hebdomadaire.', audience_group_ids: [groupA] },
        { title: 'Pour l’encadrement', body: 'Code du cadenas : 4417.' },
        {
          title: 'Pour le personnel',
          body: 'Benne vidée le mardi.',
          audience_role_slugs: ['personnel'],
        },
      ],
    })
    .expect(201);

  const seen = await asUser(request(app).get(`/api/zones?map_id=${mapId}`), studentA.token)
    .expect(200)
    .then((r) => r.body.find((z) => z.id === created.body.id));
  assert.ok(seen, 'la zone elle-même reste visible');
  assert.deepEqual(
    seen.notes.map((n) => n.title),
    ['Pour la classe'],
    'l’élève ne reçoit que le complément qui vise sa classe',
  );
  // Et surtout : l'audience du complément ne part pas avec lui.
  assert.equal(seen.notes[0].audience_group_ids, undefined);
  assert.equal(seen.notes[0].audience_role_slugs, undefined);

  const anon = await request(app)
    .get(`/api/zones?map_id=${mapId}`)
    .expect(200)
    .then((r) => r.body.find((z) => z.id === created.body.id));
  assert.deepEqual(anon.notes, [], 'aucun complément pour un lecteur anonyme');
});

test('mise à jour : omettre `notes` conserve, `[]` efface', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: `Mare ${Date.now()}`,
      points: POLYGON,
      map_id: mapId,
      notes: [{ body: 'Bottes obligatoires.' }],
    })
    .expect(201);
  const zoneId = created.body.id;

  const renamed = await auth(request(app).put(`/api/zones/${zoneId}`))
    .send({ name: 'Mare pédagogique' })
    .expect(200);
  assert.equal(renamed.body.notes.length, 1, 'champ absent = compléments inchangés');

  const cleared = await auth(request(app).put(`/api/zones/${zoneId}`))
    .send({ notes: [] })
    .expect(200);
  assert.deepEqual(cleared.body.notes, [], 'liste vide = tout retirer');
  const rows = await queryAll(
    'SELECT id FROM location_notes WHERE location_kind = ? AND location_id = ?',
    ['zone', zoneId],
  );
  assert.equal(rows.length, 0, 'et les lignes disparaissent vraiment');
});

test('écriture : plafond, texte requis, groupe inconnu → 400', async () => {
  const base = { name: `Refus ${Date.now()}`, points: POLYGON, map_id: mapId };
  const tooMany = Array.from({ length: LOCATION_NOTES_MAX + 1 }, (_, i) => ({ body: `n${i}` }));
  await auth(request(app).post('/api/zones'))
    .send({ ...base, notes: tooMany })
    .expect(400);
  await auth(request(app).post('/api/zones'))
    .send({ ...base, notes: [{ title: 'Intitulé seul' }] })
    .expect(400);
  await auth(request(app).post('/api/zones'))
    .send({ ...base, notes: [{ body: 'x', audience_group_ids: ['groupe-inexistant'] }] })
    .expect(400);
});

test('repère : les compléments suivent le lieu et disparaissent avec lui', async () => {
  const created = await auth(request(app).post('/api/map/markers'))
    .send({
      label: `Composteur ${Date.now()}`,
      x_pct: 21,
      y_pct: 34,
      map_id: mapId,
      notes: [{ title: 'Entretien', body: 'Retourner le tas en avril.' }],
    })
    .expect(201);
  assert.equal(created.body.notes[0].title, 'Entretien');

  await auth(request(app).delete(`/api/map/markers/${created.body.id}`)).expect(200);
  const rows = await queryAll(
    'SELECT id FROM location_notes WHERE location_kind = ? AND location_id = ?',
    ['marker', created.body.id],
  );
  assert.equal(rows.length, 0, 'cible polymorphe : le nettoyage est explicite, pas une FK');
});

test('carte et Visite partagent les mêmes compléments, sans aucune recopie', async () => {
  const secret = `PARTAGE_${Date.now()}`;
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: `Local technique ${Date.now()}`,
      points: POLYGON,
      map_id: mapId,
      description: 'Texte public',
      notes: [{ title: 'Accès', body: secret, audience_role_slugs: ['personnel'] }],
    })
    .expect(201);

  await auth(request(app).post('/api/visit/sync'))
    .send({ map_id: mapId, direction: 'map_to_visit', zone_ids: [created.body.id] })
    .expect(200);

  // Une seule ligne : la visite n'a rien dupliqué, elle lit la même.
  const rows = await queryAll('SELECT id FROM location_notes WHERE location_id = ?', [
    created.body.id,
  ]);
  assert.equal(rows.length, 1);

  // Éditer depuis la Visite édite bien ce même complément.
  await auth(request(app).put(`/api/visit/zones/${created.body.id}`))
    .send({ notes: [{ title: 'Accès', body: `${secret}_V2`, audience_role_slugs: ['personnel'] }] })
    .expect(200);
  const onMap = await auth(request(app).get(`/api/zones/${created.body.id}`)).expect(200);
  assert.equal(onMap.body.notes[0].body, `${secret}_V2`, 'la carte voit l’édition faite en visite');

  const anon = await request(app).get(`/api/visit/content?map_id=${mapId}`).expect(200);
  const anonZone = (anon.body.zones || []).find((z) => z.id === created.body.id);
  assert.ok(anonZone, 'la zone reste publique');
  assert.deepEqual(anonZone.notes, [], 'mais pas son complément');
});
