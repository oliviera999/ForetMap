'use strict';

// Lot 1 : fixtures métier ForetMap (`tests/helpers/fmFixtures.js`) et journal d'audit sorti
// du routeur (`lib/auditLog.js`, ré-exporté par `routes/audit.js`) — avec base de données.

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { app } = require('../server');
const { initSchema, queryOne } = require('../database');
const fixtures = require('./helpers/fmFixtures');
const auditLog = require('../lib/auditLog');
const auditRouter = require('../routes/audit');

before(async () => {
  await initSchema();
});

test('routes/audit ré-exporte exactement les fonctions de lib/auditLog', () => {
  assert.strictEqual(auditRouter.logAudit, auditLog.logAudit);
  assert.strictEqual(auditRouter.logSecurityEvent, auditLog.logSecurityEvent);
  assert.strictEqual(typeof auditLog.resolveCanonicalActorId, 'function');
});

test('logAudit écrit dans audit_log et security_events sans acteur', async () => {
  const targetId = `lot1-${Date.now()}`;
  await auditLog.logAudit('test.lot1', 'test', targetId, 'détail', { payload: { a: 1 } });
  const row = await queryOne(
    'SELECT action, target_id, payload_json FROM audit_log WHERE target_id = ?',
    [targetId],
  );
  assert.ok(row, 'ligne audit_log présente');
  assert.strictEqual(row.action, 'test.lot1');
  const security = await queryOne(
    'SELECT action FROM security_events WHERE target_id = ? ORDER BY id DESC LIMIT 1',
    [targetId],
  );
  assert.ok(security, 'ligne security_events présente');
});

test('fixtures : carte, zone, repère, catégorie et plante visibles par les API publiques', async () => {
  const map = await fixtures.createMap({ label: 'Carte fixtures' });
  const zone = await fixtures.createZone({ mapId: map.id, name: 'Bâtiment F' });
  const marker = await fixtures.createMarker({ mapId: map.id, label: 'Infirmerie' });
  const category = await fixtures.createLocationCategory({
    mapId: map.id,
    label: 'Salles',
    zoneIds: [zone.id],
    markerIds: [marker.id],
  });
  const plant = await fixtures.createPlant({ name: `Plante fixtures ${Date.now()}` });
  assert.ok(plant.id);

  const zones = await request(app).get('/api/zones').query({ map_id: map.id }).expect(200);
  const zoneRow = zones.body.find((z) => z.id === zone.id);
  assert.ok(zoneRow, 'zone servie');
  assert.ok(zoneRow.category_ids.includes(category.id));

  const markers = await request(app).get('/api/map/markers').query({ map_id: map.id }).expect(200);
  const markerRow = markers.body.find((m) => m.id === marker.id);
  assert.ok(markerRow, 'repère servi');
  assert.ok(markerRow.category_ids.includes(category.id));

  const categories = await request(app)
    .get('/api/map-categories')
    .query({ map_id: map.id })
    .expect(200);
  assert.ok(categories.body.some((c) => c.id === category.id));
});
