'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken;
let className;

const stamp = Date.now();
const adminEmail = `players.import.${stamp}@ecole.local`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Import', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [adminEmail]
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.players.manage'],
  });
  className = `Classe Import ${stamp}`;
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [className, admin.id]
  );
});

test('GET /api/gl/admin/players/import/template?format=csv retourne un modèle CSV', async () => {
  const res = await request(app)
    .get('/api/gl/admin/players/import/template?format=csv')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok((res.headers['content-type'] || '').includes('text/csv'));
  assert.ok((res.text || '').includes('Prénom;Nom;Email;Pseudo;Mot de passe;Classe'));
});

test('GET /api/gl/admin/players/import/template?format=xlsx retourne un binaire xlsx', async () => {
  // supertest n'expose pas un Buffer dans `res.body` pour un Content-Type binaire ;
  // on force le parser pour collecter le binaire dans un Buffer.
  const res = await request(app)
    .get('/api/gl/admin/players/import/template?format=xlsx')
    .set('Authorization', `Bearer ${adminToken}`)
    .buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.ok((res.headers['content-type'] || '').includes('openxmlformats'));
  assert.ok((res.headers['content-disposition'] || '').includes('foretmap-gl-modele-joueurs.xlsx'));
  const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
  assert.ok(buf.length > 100, `binaire trop court (${buf.length} octets)`);
  // En-tête ZIP/OOXML : "PK\x03\x04"
  assert.strictEqual(buf.slice(0, 2).toString('latin1'), 'PK');
});

test('POST /api/gl/admin/players/import dryRun signale lignes invalides sans création', async () => {
  const csv = [
    'Prénom;Nom;Email;Pseudo;Mot de passe;Classe',
    `Ok;Eleve-${stamp};ok_${stamp};motdepasse123;${className}`,
    `;Sans-Prenom-${stamp};err1_${stamp};motdepasse123;${className}`,
    `Sans;Classe-${stamp};err2_${stamp};motdepasse123;Classe-Inconnue`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/gl/admin/players/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileName: 'joueurs.csv', fileDataBase64, dryRun: true })
    .expect(200);
  assert.strictEqual(res.body?.report?.totals?.received, 3);
  assert.strictEqual(res.body?.report?.totals?.valid, 1);
  assert.strictEqual(res.body?.report?.totals?.skipped_invalid, 2);
  assert.strictEqual(res.body?.report?.totals?.created, 0);
});

test('POST /api/gl/admin/players/import crée les lignes valides (must_reset selon mot de passe)', async () => {
  const csv = [
    'Prénom;Nom;Email;Pseudo;Mot de passe;Classe',
    `Avec;Mdp-${stamp};avec_${stamp};motdepasse123;${className}`,
    `Sans;Mdp-${stamp};sans_${stamp};;${className}`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/gl/admin/players/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileName: 'joueurs.csv', fileDataBase64, dryRun: false })
    .expect(200);
  assert.strictEqual(res.body?.report?.totals?.created, 2);

  const withPwd = await queryOne(
    'SELECT password_must_reset FROM gl_players WHERE pseudo = ? LIMIT 1',
    [`avec_${stamp}`]
  );
  assert.strictEqual(Number(withPwd.password_must_reset), 0);

  const withoutPwd = await queryOne(
    'SELECT password_must_reset FROM gl_players WHERE pseudo = ? LIMIT 1',
    [`sans_${stamp}`]
  );
  assert.strictEqual(Number(withoutPwd.password_must_reset), 1);

  // Le joueur "avec" peut se connecter immédiatement
  await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: `avec_${stamp}`, password: 'motdepasse123' })
    .expect(200);
});

test('POST /api/gl/admin/players/import refuse un pseudo déjà importé (rapport d\'erreur)', async () => {
  const pseudo = `dup_imp_${stamp}`;
  // Crée d'abord via API
  await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId: Number((await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [className])).id),
      firstName: 'Pre', lastName: 'Existant', pseudo, password: 'motdepasse123' })
    .expect(201);

  const csv = [
    'Prénom;Nom;Email;Pseudo;Mot de passe;Classe',
    `Autre;Nom-${stamp};${pseudo};motdepasse123;${className}`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/gl/admin/players/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileName: 'joueurs.csv', fileDataBase64, dryRun: true })
    .expect(200);
  assert.strictEqual(res.body?.report?.totals?.skipped_invalid, 1);
  assert.ok(res.body?.report?.errors?.[0]?.error?.toLowerCase().includes('pseudo'));

  const rows = await queryAll('SELECT id FROM gl_players WHERE pseudo = ?', [pseudo]);
  assert.strictEqual(rows.length, 1, 'aucune ligne supplémentaire ne doit être créée pendant le dryRun');
});
