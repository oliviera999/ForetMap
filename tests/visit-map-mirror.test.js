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

test('migration 309 : une zone sans forme (points NULL) ne bloque pas le démarrage', async () => {
  const created = async (label) =>
    auth(request(app).post('/api/zones'))
      .send({
        name: `${label} ${stamp}`,
        map_id: 'foret',
        points: [
          { xp: 10, yp: 10 },
          { xp: 20, yp: 10 },
          { xp: 15, yp: 20 },
        ],
        stage: 'empty',
      })
      .expect(201);
  const missing = (await created('Sans forme manquante')).body.id;
  const drifted = (await created('Sans forme dérivée')).body.id;
  await execute('UPDATE zones SET points = NULL WHERE id IN (?, ?)', [missing, drifted]);
  await execute('DELETE FROM visit_zones WHERE id = ?', [missing]);

  await runMigration();

  for (const id of [missing, drifted]) {
    const row = await queryOne('SELECT points FROM visit_zones WHERE id = ?', [id]);
    assert.ok(row, 'ligne visite présente');
    assert.strictEqual(row.points, '[]');
  }
  await runMigration();

  for (const id of [missing, drifted]) {
    await auth(request(app).delete(`/api/zones/${id}`)).expect(200);
  }
});

test('un texte de visite ne réécrit pas un renommage fait sur la carte', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: `Avant visite ${stamp}`,
      map_id: 'foret',
      points: [
        { xp: 40, yp: 40 },
        { xp: 50, yp: 40 },
        { xp: 45, yp: 55 },
      ],
      stage: 'empty',
    })
    .expect(201);
  const id = created.body.id;
  const opened = await queryOne('SELECT edit_revision FROM zones WHERE id = ?', [id]);
  await auth(request(app).put(`/api/zones/${id}`))
    .send({ name: `Après carte ${stamp}`, expected_revision: Number(opened.edit_revision) })
    .expect(200);

  const refused = await auth(request(app).put(`/api/visit/zones/${id}`))
    .send({ name: `Avant visite ${stamp}`, subtitle: `ne doit pas s'écrire ${stamp}` })
    .expect(409);
  assert.strictEqual(refused.body.code, 'edit_conflict');

  const zone = await queryOne('SELECT name FROM zones WHERE id = ?', [id]);
  const visit = await queryOne('SELECT name, subtitle FROM visit_zones WHERE id = ?', [id]);
  assert.strictEqual(zone.name, `Après carte ${stamp}`);
  assert.strictEqual(visit.name, `Après carte ${stamp}`);
  assert.notStrictEqual(visit.subtitle, `ne doit pas s'écrire ${stamp}`);

  const current = await queryOne('SELECT edit_revision FROM zones WHERE id = ?', [id]);
  const renamed = await auth(request(app).put(`/api/visit/zones/${id}`))
    .send({
      name: `Depuis la visite ${stamp}`,
      expected_revision: Number(current.edit_revision),
    })
    .expect(200);
  assert.strictEqual(Number(renamed.body.edit_revision), Number(current.edit_revision) + 1);
  const after = await queryOne('SELECT name FROM zones WHERE id = ?', [id]);
  assert.strictEqual(after.name, `Depuis la visite ${stamp}`);

  await auth(request(app).delete(`/api/zones/${id}`)).expect(200);
});

test('un texte de visite s’enregistre sans avancer la révision si le nom est inchangé', async () => {
  const created = await auth(request(app).post('/api/zones'))
    .send({
      name: `Stable ${stamp}`,
      map_id: 'foret',
      points: [
        { xp: 60, yp: 10 },
        { xp: 70, yp: 10 },
        { xp: 65, yp: 20 },
      ],
      stage: 'empty',
    })
    .expect(201);
  const id = created.body.id;
  const before = await queryOne('SELECT edit_revision FROM zones WHERE id = ?', [id]);
  const saved = await auth(request(app).put(`/api/visit/zones/${id}`))
    .send({ name: `Stable ${stamp}`, subtitle: `accroche stable ${stamp}` })
    .expect(200);
  assert.strictEqual(Number(saved.body.edit_revision), Number(before.edit_revision));
  const after = await queryOne('SELECT name, edit_revision FROM zones WHERE id = ?', [id]);
  const visit = await queryOne('SELECT subtitle FROM visit_zones WHERE id = ?', [id]);
  assert.strictEqual(after.name, `Stable ${stamp}`);
  assert.strictEqual(Number(after.edit_revision), Number(before.edit_revision));
  assert.strictEqual(visit.subtitle, `accroche stable ${stamp}`);

  const content = await request(app).get('/api/visit/content?map_id=foret').expect(200);
  const listed = (content.body.zones || []).find((z) => z.id === id);
  assert.ok(listed, 'la zone figure dans le contenu de visite');
  assert.strictEqual(Number(listed.edit_revision), Number(before.edit_revision));

  await auth(request(app).delete(`/api/zones/${id}`)).expect(200);
});

test('un emoji de repère périmé n’est pas recopié sur la carte', async () => {
  const created = await auth(request(app).post('/api/map/markers'))
    .send({ map_id: 'foret', x_pct: 12, y_pct: 18, label: `Repère emoji ${stamp}`, emoji: '📍' })
    .expect(201);
  const id = created.body.id;
  const opened = await queryOne('SELECT edit_revision FROM map_markers WHERE id = ?', [id]);
  await auth(request(app).put(`/api/map/markers/${id}`))
    .send({ emoji: '🍎', expected_revision: Number(opened.edit_revision) })
    .expect(200);

  const refused = await auth(request(app).put(`/api/visit/markers/${id}`))
    .send({ label: `Repère emoji ${stamp}`, emoji: '📍', subtitle: `perdu ${stamp}` })
    .expect(409);
  assert.strictEqual(refused.body.code, 'edit_conflict');
  const marker = await queryOne('SELECT emoji FROM map_markers WHERE id = ?', [id]);
  const visit = await queryOne('SELECT subtitle FROM visit_markers WHERE id = ?', [id]);
  assert.strictEqual(marker.emoji, '🍎');
  assert.notStrictEqual(visit.subtitle, `perdu ${stamp}`);

  await auth(request(app).delete(`/api/map/markers/${id}`)).expect(200);
});
