'use strict';

// La Visite reflète exactement les zones et repères des cartes : chaque écriture sur la
// carte tient la ligne visite à jour (`lib/visitMapMirror.js`), et la migration 309
// réaligne l'existant (orphelins supprimés, manquants ajoutés, identité recopiée).

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, execute, queryOne, splitSqlStatements } = require('../database');
const { app } = require('../server');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  'migrations',
  '309_visit_mirror_map_locations.sql',
);

let token;
const stamp = String(Date.now());

async function runMigration() {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  for (const stmt of splitSqlStatements(sql)) await execute(stmt);
}

function auth(req) {
  return req.set('Authorization', 'Bearer ' + token);
}

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken({ elevated: true });
});

test('une zone créée puis renommée sur la carte est tenue à jour en visite', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: `Miroir zone ${stamp}`,
      map_id: 'foret',
      points: [
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 15, yp: 20 },
      ],
      stage: 'empty',
    })
    .expect(201);
  const id = created.body.id;

  let row = await queryOne('SELECT name, map_id, is_active FROM visit_zones WHERE id = ?', [id]);
  assert.ok(row, 'ligne visite créée avec la zone');
  assert.strictEqual(row.name, `Miroir zone ${stamp}`);
  assert.strictEqual(Number(row.is_active), 1);

  await auth(request(app).put(`/api/visit/zones/${id}`))
    .send({ subtitle: `Accroche ${stamp}` })
    .expect(200);
  await auth(request(app).put(`/api/zones/${id}`))
    .send({ name: `Miroir zone renommée ${stamp}` })
    .expect(200);

  row = await queryOne('SELECT name, subtitle FROM visit_zones WHERE id = ?', [id]);
  assert.strictEqual(row.name, `Miroir zone renommée ${stamp}`);
  assert.strictEqual(row.subtitle, `Accroche ${stamp}`, 'le texte de visite est conservé');

  await auth(request(app).delete(`/api/zones/${id}`)).expect(200);
});

test('un repère créé puis déplacé sur la carte est tenu à jour en visite', async () => {
  const created = await auth(request(app).post('/api/map/markers'))
    .send({ map_id: 'foret', x_pct: 30, y_pct: 30, label: `Miroir repère ${stamp}`, emoji: '📍' })
    .expect(201);
  const id = created.body.id;

  let row = await queryOne('SELECT label, x_pct FROM visit_markers WHERE id = ?', [id]);
  assert.ok(row, 'ligne visite créée avec le repère');
  assert.strictEqual(row.label, `Miroir repère ${stamp}`);

  await auth(request(app).put(`/api/map/markers/${id}`))
    .send({ x_pct: 55, emoji: '🌳' })
    .expect(200);
  row = await queryOne('SELECT x_pct, emoji FROM visit_markers WHERE id = ?', [id]);
  assert.strictEqual(Number(row.x_pct), 55);
  assert.strictEqual(row.emoji, '🌳');

  await auth(request(app).delete(`/api/map/markers/${id}`)).expect(200);
});

test('migration 309 : orphelins supprimés, manquants ajoutés, identité réalignée, idempotente', async () => {
  const orphanId = `mk-orph-${stamp.slice(-6)}`;
  await execute(
    `INSERT INTO visit_markers (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
     VALUES (?, 'foret', 5, 5, ?, '🐍', '', '', 'Détails', '', 1, 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
    [orphanId, `permanence essai ${stamp}`],
  );
  await execute(
    "INSERT INTO location_notes (location_kind, location_id, body) VALUES ('marker', ?, 'note orpheline')",
    [orphanId],
  );

  const missing = await auth(request(app).post('/api/map/markers'))
    .send({
      map_id: 'foret',
      x_pct: 40,
      y_pct: 40,
      label: `Manquant ${stamp}`,
      emoji: '📍',
      note: 'Note carte',
    })
    .expect(201);
  await execute('DELETE FROM visit_markers WHERE id = ?', [missing.body.id]);

  const drifted = await auth(request(app).post('/api/map/markers'))
    .send({ map_id: 'foret', x_pct: 60, y_pct: 60, label: `Dérivé ${stamp}`, emoji: '📍' })
    .expect(201);
  await execute("UPDATE visit_markers SET label = 'ancien nom', x_pct = 1 WHERE id = ?", [
    drifted.body.id,
  ]);

  await runMigration();

  assert.ok(!(await queryOne('SELECT id FROM visit_markers WHERE id = ?', [orphanId])));
  const notes = await queryOne(
    "SELECT COUNT(*) AS n FROM location_notes WHERE location_kind = 'marker' AND location_id = ?",
    [orphanId],
  );
  assert.strictEqual(Number(notes.n), 0);

  const added = await queryOne(
    'SELECT label, short_description, is_active FROM visit_markers WHERE id = ?',
    [missing.body.id],
  );
  assert.ok(added, 'repère manquant ajouté à la visite');
  assert.strictEqual(added.label, `Manquant ${stamp}`);
  assert.strictEqual(added.short_description, 'Note carte');
  assert.strictEqual(Number(added.is_active), 1);

  const realigned = await queryOne('SELECT label, x_pct FROM visit_markers WHERE id = ?', [
    drifted.body.id,
  ]);
  assert.strictEqual(realigned.label, `Dérivé ${stamp}`);
  assert.strictEqual(Number(realigned.x_pct), 60);

  await runMigration();
  const again = await queryOne('SELECT label FROM visit_markers WHERE id = ?', [missing.body.id]);
  assert.strictEqual(again.label, `Manquant ${stamp}`);

  for (const id of [missing.body.id, drifted.body.id]) {
    await auth(request(app).delete(`/api/map/markers/${id}`)).expect(200);
  }
});
