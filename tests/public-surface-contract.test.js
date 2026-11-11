'use strict';

/**
 * Contrat des surfaces publiques (exploitation, lot 7) : les réponses **anonymes** de la carte,
 * de la visite et du plan public ne contiennent jamais un champ ni un texte réservé, quel que
 * soit le contenu en base.
 *
 * Fixtures « pleines » : une zone et un repère portant des compléments réservés (audience vide
 * = encadrement, audience `personnel`), un lien à audience restreinte, et des textes réservés
 * marqués d'un jeton unique. On vérifie, sur le corps entier de chaque réponse :
 * - aucun jeton réservé, nulle part (clé, valeur, sous-objet) ;
 * - aucune clé héritée `restricted_note*` (colonnes retirées par la migration 263, remplacées
 *   par `location_notes`) ni d'audience d'un complément ou d'un lien
 *   (`audience_role_slugs`, `audience_group_ids`) ;
 * - les lieux restent publiés (le test ne passerait pas « à vide »).
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, initDatabase, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { visitContentCache } = require('../routes/visit');
const { planContentCache } = require('../routes/plan');
const fx = require('./helpers/fmFixtures');

const SECRET = `RESERVE_${Date.now().toString(36)}`;
const RESERVED_KEY_RE = /^(?:restricted_note.*|audience_role_slugs|audience_group_ids)$/;
const POLYGON = [
  { xp: 10, yp: 10 },
  { xp: 30, yp: 10 },
  { xp: 30, yp: 30 },
];

let teacherToken;
/** Carte de la visite et de la carte publique. */
let mapId;
/** Carte désignée pour le plan public (`ui.plan.map_id`), retirée des autres surfaces. */
let planMapId;
let zoneId;
let markerId;
let planZoneId;
let planSnapshot;
const createdMaps = [];

const auth = (req) => req.set('Authorization', `Bearer ${teacherToken}`);

/** Toutes les clés d'un objet JSON, à toute profondeur. */
function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

function assertNoReserved(body, surface) {
  const text = JSON.stringify(body);
  assert.ok(!text.includes(SECRET), `${surface} : un texte réservé est sorti`);
  const leaked = [...allKeys(body)].filter((k) => RESERVED_KEY_RE.test(k));
  assert.deepEqual(leaked, [], `${surface} : clé réservée exposée`);
}

const reservedNotes = (label) => [
  { title: `Consigne ${label}`, body: `${SECRET} encadrement ${label}` },
  {
    title: `Accès ${label}`,
    body: `${SECRET} personnel ${label}`,
    audience_role_slugs: ['personnel'],
  },
];

/** Zone et repère porteurs de réservés sur une carte ; renvoie leurs identifiants. */
async function seedReserved(targetMapId, label) {
  const zone = await auth(request(app).post('/api/zones'))
    .send({
      name: `Serre ${label}`,
      points: POLYGON,
      map_id: targetMapId,
      description: 'Texte public de la serre',
      notes: reservedNotes(`zone ${label}`),
      links: [
        { label: 'Fiche publique', url: 'https://exemple.org/serre' },
        { label: `${SECRET} lien interne`, url: '/interne/serre', audience_role_slugs: ['prof'] },
      ],
    })
    .expect(201);
  const marker = await auth(request(app).post('/api/map/markers'))
    .send({
      label: `Composteur ${label}`,
      x_pct: 50,
      y_pct: 50,
      map_id: targetMapId,
      notes: reservedNotes(`repère ${label}`),
    })
    .expect(201);
  return { zoneId: zone.body.id, markerId: marker.body.id };
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  mapId = (await fx.createMap({ label: 'Carte contrat public' })).id;
  planMapId = (await fx.createMap({ label: 'Plan contrat public' })).id;
  createdMaps.push(mapId, planMapId);
  planSnapshot = await snapshotSetting('ui.plan.map_id');
  await setSetting('ui.plan.map_id', planMapId, { userType: 'teacher', userId: 'test' });
  invalidateSettingsCache();

  ({ zoneId, markerId } = await seedReserved(mapId, 'carte'));
  ({ zoneId: planZoneId } = await seedReserved(planMapId, 'plan'));

  await auth(request(app).post('/api/visit/sync'))
    .send({ map_id: mapId, direction: 'map_to_visit', zone_ids: [zoneId], marker_ids: [markerId] })
    .expect(200);
});

test.beforeEach(async () => {
  teacherToken = await ensureAdminTeacherAuthToken({ elevated: true });
  visitContentCache?.clear?.();
  planContentCache?.clear?.();
});

test.after(async () => {
  for (const id of createdMaps) {
    await execute(
      `DELETE FROM location_notes WHERE location_id IN (
         SELECT id FROM zones WHERE map_id = ? UNION SELECT id FROM map_markers WHERE map_id = ?)`,
      [id, id],
    );
    await execute('DELETE FROM visit_zones WHERE map_id = ?', [id]);
    await execute('DELETE FROM visit_markers WHERE map_id = ?', [id]);
    await execute('DELETE FROM zones WHERE map_id = ?', [id]);
    await execute('DELETE FROM map_markers WHERE map_id = ?', [id]);
    await execute('DELETE FROM maps WHERE id = ?', [id]);
  }
  await restoreSetting(planSnapshot);
});

test('les fixtures portent bien des réservés (côté gestionnaire)', async () => {
  const res = await auth(request(app).get(`/api/zones/${zoneId}`)).expect(200);
  assert.ok(JSON.stringify(res.body).includes(SECRET), 'fixture réservée présente');
});

test('visite anonyme : aucun champ ni texte réservé', async () => {
  const res = await request(app).get(`/api/visit/content?map_id=${mapId}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(
    (res.body.zones || []).some((z) => z.id === zoneId),
    'zone publiée en visite',
  );
  assertNoReserved(res.body, 'visite');
});

test('plan public : aucun champ ni texte réservé', async () => {
  const res = await request(app).get('/api/plan/content').expect(200);
  assert.ok(
    (res.body.zones || []).some((z) => z.id === planZoneId),
    'zone publiée sur le plan',
  );
  const zone = res.body.zones.find((z) => z.id === planZoneId);
  assert.deepEqual(
    (zone.links || []).map((l) => l.label),
    ['Fiche publique'],
  );
  assertNoReserved(res.body, 'plan public');
});

test('carte anonyme : refusée, ou servie sans aucun réservé', async () => {
  for (const path of [
    `/api/zones?map_id=${mapId}`,
    `/api/zones/${zoneId}`,
    `/api/map/markers?map_id=${mapId}`,
  ]) {
    const res = await request(app).get(path);
    if (res.status === 200) assertNoReserved(res.body, `carte ${path}`);
    else assert.ok([401, 403, 404].includes(res.status), `${path} : ${res.status}`);
  }
});
