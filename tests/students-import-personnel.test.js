'use strict';

/**
 * Import des personnels — réalignement des profils du 22/09/2026.
 *
 * Les 148 personnels du lycée avaient été créés par l'import d'élèves, puis basculés en
 * `user_type = 'teacher'`. Or la clé d'appariement de l'import est `type|prénom|nom`
 * (`routes/students.js`) et le profil « Personnel » était déclaré `student`
 * (`IMPORT_ROLE_DEFINITIONS`) : un ré-import du même fichier ne retrouvait plus aucun de ces
 * comptes et repartait en **création**. Selon que la ligne portait ou non un e-mail, cela
 * donnait un doublon silencieux ou un rejet « Email déjà utilisé » — jamais la mise à jour
 * attendue.
 *
 * Ce fichier fixe les trois points du correctif :
 *   1. « Personnel » importe un compte enseignant ;
 *   2. un ré-import retrouve le compte existant et le met à jour (pas de doublon) ;
 *   3. un homonyme sous l'autre type de compte est signalé au lieu d'être créé en silence.
 *
 * Et le point qui n'a **pas** changé : le `user_type` d'un compte existant n'est jamais
 * réécrit par un import.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { TEMPLATE_COLUMNS, csvEscape } = require('../lib/studentRouteHelpers');

const IMPORT_CSV_HEADER = TEMPLATE_COLUMNS.map(csvEscape).join(';');
const STAFF_PWD = 'MotDePasse12!';

let adminToken;

test.before(async () => {
  await initSchema();
  const { setSetting } = require('../lib/settings');
  await setSetting('students.import.existing_strategy', 'update', {
    userType: 'teacher',
    userId: 'test',
  });
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [adminRole.id, teacher.id]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id],
  );
  adminToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
});

async function runImport(rows, { dryRun = false } = {}) {
  const csv = [IMPORT_CSV_HEADER, ...rows].join('\n');
  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + adminToken)
    .send({
      fileName: 'personnels.csv',
      fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
      dryRun,
    })
    .expect(200);
  return res.body.report;
}

function staffRow({ firstName, lastName, email, pseudo, description = '' }) {
  return `Personnel;${firstName};${lastName};${STAFF_PWD};;${pseudo};${email};${description}`;
}

test('import : « Personnel » crée un compte enseignant', async () => {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const lastName = `Agent${unique}`;
  const report = await runImport([
    staffRow({
      firstName: 'Paul',
      lastName,
      email: `paul.${unique}@etablissement.example`,
      pseudo: `paul_${unique}`,
    }),
  ]);
  assert.strictEqual(report.totals.created, 1, JSON.stringify(report.errors));

  const created = await queryOne(
    'SELECT id, user_type, assigned_role_id FROM users WHERE last_name = ? LIMIT 1',
    [lastName],
  );
  assert.ok(created?.id);
  assert.strictEqual(created.user_type, 'teacher');
  const role = await queryOne('SELECT slug FROM roles WHERE id = ? LIMIT 1', [
    created.assigned_role_id,
  ]);
  assert.strictEqual(role?.slug, 'personnel');
});

test('import : un ré-import du fichier des personnels met à jour, sans doublon', async () => {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const lastName = `Vie${unique}`;
  const email = `sofia.${unique}@etablissement.example`;
  const pseudo = `sofia_${unique}`;

  const first = await runImport([
    staffRow({ firstName: 'Sofia', lastName, email, pseudo, description: 'Vie scolaire' }),
  ]);
  assert.strictEqual(first.totals.created, 1, JSON.stringify(first.errors));

  // Exactement le même fichier, relancé — le geste d'exploitation qui créait des doublons.
  const second = await runImport([
    staffRow({ firstName: 'Sofia', lastName, email, pseudo, description: 'Vie scolaire (MAJ)' }),
  ]);
  assert.strictEqual(second.totals.created, 0, JSON.stringify(second.errors));
  assert.strictEqual(second.totals.updated, 1, JSON.stringify(second.errors));

  const rows = await queryAll('SELECT id, user_type, description FROM users WHERE last_name = ?', [
    lastName,
  ]);
  assert.strictEqual(rows.length, 1, 'un doublon a été créé');
  assert.strictEqual(rows[0].user_type, 'teacher');
  assert.strictEqual(rows[0].description, 'Vie scolaire (MAJ)');
});

test('import : le user_type d’un compte existant n’est jamais réécrit', async () => {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const lastName = `Herite${unique}`;
  const email = `herite.${unique}@etablissement.example`;

  // Compte historique : un personnel resté de type élève (créé avant la bascule).
  await runImport([
    `eleve_novice;Lea;${lastName};azerty123;;lea_${unique};${email};Compte historique`,
  ]);
  const before = await queryOne('SELECT id, user_type FROM users WHERE last_name = ? LIMIT 1', [
    lastName,
  ]);
  assert.strictEqual(before?.user_type, 'student');

  // Une ligne « Personnel » vise désormais le type enseignant : elle ne retrouve pas ce
  // compte-là, et ne le convertit surtout pas en silence.
  const report = await runImport([
    staffRow({ firstName: 'Lea', lastName, email, pseudo: `lea2_${unique}` }),
  ]);
  const after = await queryOne('SELECT user_type FROM users WHERE id = ? LIMIT 1', [before.id]);
  assert.strictEqual(after.user_type, 'student', 'le type de compte a été réécrit');
  // L'e-mail déjà pris protège du doublon, et le rapport le dit.
  assert.ok(
    report.errors.some((e) => String(e.error || '').includes('Email déjà utilisé')),
    JSON.stringify(report.errors),
  );
});

test('import : un homonyme sous l’autre type de compte est signalé', async () => {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const lastName = `Homonyme${unique}`;

  await runImport([
    `eleve_novice;Camille;${lastName};azerty123;;cam1_${unique};cam1.${unique}@example.org;`,
  ]);

  const report = await runImport([
    staffRow({
      firstName: 'Camille',
      lastName,
      email: `cam2.${unique}@etablissement.example`,
      pseudo: `cam2_${unique}`,
    }),
  ]);
  // Création acceptée (deux personnes peuvent être homonymes), mais signalée au rapport :
  // c'est le seul filet contre le doublon silencieux quand rien d'autre ne collisionne.
  assert.strictEqual(report.totals.created, 1, JSON.stringify(report.errors));
  const info = report.infos.find((i) => i.code === 'cross_type_homonym');
  assert.ok(info, JSON.stringify(report.infos));
  assert.ok(info.message.includes('Rôle'));
});

/**
 * Tenir le fichier des personnels ne demande pas les droits d'administrateur. La garde
 * « seul un admin modifie un compte enseignant existant » (CDG-03) protège l'encadrement ;
 * l'appliquer à un agent d'entretien revenait à le protéger comme un n3boss.
 */
test('import : un n3boss peut mettre à jour un compte « Personnel » existant', async () => {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const lastName = `Profmaj${unique}`;
  const email = `pm.${unique}@etablissement.example`;

  await runImport([
    staffRow({ firstName: 'Remi', lastName, email, pseudo: `pm_${unique}`, description: 'v1' }),
  ]);

  const profRole = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  const profToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: 'test-prof-import',
      canonicalUserId: 'test-prof-import',
      roleId: profRole.id,
      roleSlug: 'prof',
      roleDisplayName: 'n3boss',
      elevated: false,
    },
    false,
  );
  // Compte porteur du jeton : l'hydratation relit `users` à chaque requête.
  await execute(
    `INSERT IGNORE INTO users
      (id, user_type, assigned_role_id, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, 'Test', 'ProfImport', 'Test ProfImport', NULL, 'local', 1, NOW(), NOW())`,
    ['test-prof-import', profRole.id],
  );
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', 'test-prof-import', profRole.id],
  );

  const csv = [
    IMPORT_CSV_HEADER,
    staffRow({ firstName: 'Remi', lastName, email, pseudo: `pm_${unique}`, description: 'v2' }),
  ].join('\n');
  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + profToken)
    .send({
      fileName: 'personnels.csv',
      fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.updated, 1, JSON.stringify(res.body.report.errors));
  const row = await queryOne('SELECT description FROM users WHERE last_name = ? LIMIT 1', [
    lastName,
  ]);
  assert.strictEqual(row?.description, 'v2');
});
