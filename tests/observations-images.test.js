'use strict';

/**
 * Photos de l'ancien carnet (`observation_logs`) après le retrait des routes
 * `/api/observations` (temps 1 et 2, migration 307).
 *
 * Ce qui doit rester vrai jusqu'au `DROP` (temps 3) :
 * - la famille `uploads/observations/` reste privée (audit B2 : le nom de fichier
 *   `<élève>_<observation>.jpg` est prédictible) ;
 * - la photo d'une ancienne observation reste lisible par son auteur **via le carnet**, qui l'a
 *   recopiée (`user_journal_article_assets` pointe sur le même fichier) ;
 * - l'ancienne route d'image répond 410 Gone, sans lire la table.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { saveBase64ToDisk, deleteFile } = require('../lib/uploads');

const SAMPLE_IMAGE_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';

let student;
let obsId;
let relativePath;

test.before(async () => {
  await initSchema();
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Obs', lastName: `Image${Date.now()}`, password: 'pass1234' })
    .expect(201);
  student = reg.body;
  // Observation héritée posée AVANT toute lecture du carnet : la reprise est mémoïsée par
  // processus (`migrateObservationLogsOnce`).
  const created = await execute(
    'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
    [student.id, null, 'Observation image', null, new Date()],
  );
  obsId = created.insertId;
  relativePath = `observations/${student.id}_${obsId}.jpg`;
  await saveBase64ToDisk(relativePath, SAMPLE_IMAGE_DATA);
  await execute('UPDATE observation_logs SET image_path = ? WHERE id = ?', [relativePath, obsId]);
});

test.after(() => {
  deleteFile(relativePath);
});

test('la famille uploads/observations/ reste privée', async () => {
  const direct = await request(app).get(`/uploads/${relativePath}`).expect(403);
  assert.strictEqual(direct.body.code, 'PRIVATE_UPLOAD');
});

test('l’ancienne route d’image répond 410 Gone', async () => {
  const res = await request(app)
    .get(`/api/observations/${obsId}/image`)
    .set('Authorization', `Bearer ${student.authToken}`)
    .expect(410);
  assert.strictEqual(res.body.code, 'OBSERVATIONS_LEGACY_GONE');
});

test('la photo héritée reste lisible par son auteur via le carnet (recopie)', async () => {
  await request(app)
    .get('/api/user-journal/me')
    .set('Authorization', `Bearer ${student.authToken}`)
    .expect(200);
  const mapped = await queryOne(
    'SELECT article_id FROM user_journal_observation_map WHERE observation_id = ?',
    [obsId],
  );
  assert.ok(mapped?.article_id, 'l’observation est recopiée dans le carnet');
  const asset = await queryOne(
    'SELECT id FROM user_journal_article_assets WHERE article_id = ? AND asset_path = ?',
    [mapped.article_id, relativePath],
  );
  assert.ok(asset?.id, 'la pièce jointe pointe sur le même fichier');
  const res = await request(app)
    .get(`/api/user-journal/assets/${asset.id}/file`)
    .set('Authorization', `Bearer ${student.authToken}`)
    .expect(200);
  assert.ok((res.headers['content-type'] || '').toLowerCase().includes('image'));
});
