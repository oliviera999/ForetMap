require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');

let teacherToken;

test.before(async () => {
  await initSchema();
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  teacherToken = auth.body.token;
});

test('GET /api/students/import/template retourne un modèle CSV', async () => {
  const res = await request(app)
    .get('/api/students/import/template?format=csv')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  assert.ok((res.headers['content-type'] || '').includes('text/csv'));
  assert.ok((res.text || '').includes('Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both)'));
  assert.ok((res.text || '').includes('eleve;Exemple;Eleve;azerty123;both'));
});

test('POST /api/students/import dryRun valide un CSV avec erreurs', async () => {
  const unique = Date.now();
  const csv = [
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both);Pseudo (optionnel);Email (optionnel);Description (optionnel)',
    `eleve;Import;Eleve-${unique};pass123;n3;import_${unique};import_${unique}@example.com;Test import`,
    `prof;Import;SansMdp-${unique};;wrong;;;`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'eleves.csv',
      fileDataBase64,
      dryRun: true,
    })
    .expect(200);

  assert.ok(res.body.report);
  assert.strictEqual(res.body.report.totals.received, 2);
  assert.strictEqual(res.body.report.totals.valid, 1);
  assert.strictEqual(res.body.report.totals.skipped_invalid, 1);
  assert.strictEqual(res.body.report.totals.created, 0);
  assert.ok(Array.isArray(res.body.report.errors));
  assert.ok(res.body.report.errors.length >= 1);
});

test('POST /api/students/import crée les élèves valides', async () => {
  const unique = Date.now();
  const csv = [
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both);Pseudo (optionnel);Email (optionnel);Description (optionnel)',
    `eleve;Mass;Create-${unique};pass123;foret;mass_${unique};mass_${unique}@example.com;Import réel`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'eleves.csv',
      fileDataBase64,
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.created, 1);
  const inserted = await queryOne(
    "SELECT * FROM users WHERE user_type = 'student' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
    ['Mass', `Create-${unique}`]
  );
  assert.ok(inserted);
  assert.strictEqual(String(inserted.affiliation || '').toLowerCase(), 'foret');
});

test('POST /api/students/import crée un professeur si rôle=prof', async () => {
  const unique = Date.now();
  const csv = [
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both);Pseudo (optionnel);Email (optionnel);Description (optionnel)',
    `prof;Prof;Import-${unique};pass123;both;prof_${unique};prof_${unique}@example.com;Import prof`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'eleves.csv',
      fileDataBase64,
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.created, 1);
  const inserted = await queryOne(
    "SELECT * FROM users WHERE user_type = 'teacher' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
    ['Prof', `Import-${unique}`]
  );
  assert.ok(inserted);
});
