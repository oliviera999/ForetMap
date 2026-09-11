require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let teacherToken;

test.before(async () => {
  await initSchema();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
      'teacher',
      teacher.id,
    ]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id],
    );
  }
  teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher?.id || null,
      canonicalUserId: teacher?.id || null,
      roleId: adminRole?.id || null,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
});

test('GET /api/students/import/template retourne un modèle CSV multi-rôles', async () => {
  const res = await request(app)
    .get('/api/students/import/template?format=csv')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  assert.ok((res.headers['content-type'] || '').includes('text/csv'));
  assert.ok((res.text || '').includes('Rôle;Prénom;Nom;Mot de passe'));
  assert.ok((res.text || '').toLowerCase().includes('groupes'));
  for (const slug of [
    'visiteur',
    'eleve_novice',
    'eleve_avance',
    'eleve_chevronne',
    'prof_classe',
    'prof',
    'admin',
  ]) {
    assert.ok((res.text || '').includes(slug), `modèle sans ligne ${slug}`);
  }
  assert.ok((res.text || '').includes('@gmail.com'));
});

test('POST /api/students/import dryRun valide un CSV avec erreurs', async () => {
  const unique = Date.now();
  const csv = [
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both|id_carte);Groupes (noms/slugs, | ou ; ; chemin Parent>Enfant);Pseudo (optionnel);Email (optionnel);Description (optionnel)',
    `eleve;Import;Eleve-${unique};pass123;n3;Classe Import ${unique};import_${unique};import_${unique}@gmail.com;Test import hors domaine`,
    `prof;Import;SansMdp-${unique};;wrong;;;;`,
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
  assert.strictEqual(res.body.report.emailDomainRestrictionsApplied, false);
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
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both|id_carte);Groupes (noms/slugs, | ou ; ; chemin Parent>Enfant);Pseudo (optionnel);Email (optionnel);Description (optionnel)',
    `eleve;Mass;Create-${unique};pass123;foret;Classe Mass ${unique};mass_${unique};mass_${unique}@example.com;Import réel`,
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
  assert.ok(res.body.report.totals.groups_attached >= 1);
  const inserted = await queryOne(
    "SELECT * FROM users WHERE user_type = 'student' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
    ['Mass', `Create-${unique}`],
  );
  assert.ok(inserted);
  assert.strictEqual(String(inserted.affiliation || '').toLowerCase(), 'foret');
  const role = await queryOne(
    `SELECT r.slug FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [inserted.id],
  );
  assert.strictEqual(role?.slug, 'eleve_novice');
  const membership = await queryOne(
    'SELECT group_id FROM group_members WHERE user_id = ? LIMIT 1',
    [inserted.id],
  );
  assert.ok(membership?.group_id);
});

test('POST /api/students/import crée un professeur si rôle=prof', async () => {
  const unique = Date.now();
  const csv = [
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both|id_carte);Groupes (noms/slugs, | ou ; ; chemin Parent>Enfant);Pseudo (optionnel);Email (optionnel);Description (optionnel)',
    `prof;Prof;Import-${unique};MotDePasse12!;both;;prof_${unique};prof_${unique}@gmail.com;Import prof hors domaine`,
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
  assert.strictEqual(res.body.report.emailDomainRestrictionsApplied, false);
  const inserted = await queryOne(
    "SELECT * FROM users WHERE user_type = 'teacher' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
    ['Prof', `Import-${unique}`],
  );
  assert.ok(inserted);
  assert.strictEqual(String(inserted.email || '').toLowerCase(), `prof_${unique}@gmail.com`);
  const role = await queryOne(
    `SELECT r.slug FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_type = 'teacher' AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [inserted.id],
  );
  assert.strictEqual(role?.slug, 'prof');
});

test('POST /api/students/import crée un prof_classe avec le bon profil', async () => {
  const unique = Date.now();
  const csv = [
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both|id_carte);Groupes (noms/slugs, | ou ; ; chemin Parent>Enfant);Pseudo (optionnel);Email (optionnel);Description (optionnel)',
    `prof_classe;Tuteur;Classe-${unique};MotDePasse12!;both;Classe Tuteur ${unique}|Autre Classe ${unique};tuteur_${unique};tuteur_${unique}@outlook.com;Import tuteur`,
  ].join('\n');
  const fileDataBase64 = Buffer.from(csv, 'utf8').toString('base64');

  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'profs.csv',
      fileDataBase64,
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.created, 1);
  assert.ok(res.body.report.totals.groups_attached >= 2);
  const inserted = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
    ['Tuteur', `Classe-${unique}`],
  );
  assert.ok(inserted);
  const role = await queryOne(
    `SELECT r.slug FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_type = 'teacher' AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [inserted.id],
  );
  assert.strictEqual(role?.slug, 'prof_classe');
});

test('POST /api/students/import met à jour un compte déjà présent (défaut)', async () => {
  const { setSetting } = require('../lib/settings');
  await setSetting('students.import.existing_strategy', 'update', {
    userType: 'teacher',
    userId: 'test',
  });
  const unique = Date.now();
  const header =
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both|id_carte);Groupes (noms/slugs, | ou ; ; chemin Parent>Enfant);Pseudo (optionnel);Email (optionnel);Description (optionnel)';
  const createCsv = [
    header,
    `eleve;Maj;User-${unique};pass123;n3;;maj_${unique};maj_${unique}@example.com;Avant`,
  ].join('\n');
  await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'create.csv',
      fileDataBase64: Buffer.from(createCsv, 'utf8').toString('base64'),
      dryRun: false,
    })
    .expect(200);

  const updateCsv = [
    header,
    `eleve_avance;Maj;User-${unique};;foret;Classe Maj ${unique};maj_${unique}_v2;maj_v2_${unique}@example.com;Après`,
  ].join('\n');
  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'update.csv',
      fileDataBase64: Buffer.from(updateCsv, 'utf8').toString('base64'),
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.options.existingStrategy, 'update');
  assert.strictEqual(res.body.report.totals.updated, 1);
  assert.strictEqual(res.body.report.totals.created, 0);
  const row = await queryOne(
    "SELECT * FROM users WHERE user_type = 'student' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
    ['Maj', `User-${unique}`],
  );
  assert.ok(row);
  assert.strictEqual(String(row.pseudo), `maj_${unique}_v2`);
  assert.strictEqual(String(row.email).toLowerCase(), `maj_v2_${unique}@example.com`);
  assert.strictEqual(String(row.description), 'Après');
  assert.strictEqual(String(row.affiliation).toLowerCase(), 'foret');
  const role = await queryOne(
    `SELECT r.slug FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [row.id],
  );
  assert.strictEqual(role?.slug, 'eleve_avance');
});

test('POST /api/students/import ignore les existants si strategy=skip', async () => {
  const { setSetting } = require('../lib/settings');
  await setSetting('students.import.existing_strategy', 'skip', {
    userType: 'teacher',
    userId: 'test',
  });
  const unique = Date.now();
  const header =
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both|id_carte);Groupes (noms/slugs, | ou ; ; chemin Parent>Enfant);Pseudo (optionnel);Email (optionnel);Description (optionnel)';
  const createCsv = [
    header,
    `eleve;Skip;User-${unique};pass123;n3;;skip_${unique};skip_${unique}@example.com;Origine`,
  ].join('\n');
  await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'create.csv',
      fileDataBase64: Buffer.from(createCsv, 'utf8').toString('base64'),
      dryRun: false,
    })
    .expect(200);

  const againCsv = [
    header,
    `eleve;Skip;User-${unique};pass123;foret;;skip_${unique}_x;skip_x_${unique}@example.com;Changé`,
  ].join('\n');
  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'again.csv',
      fileDataBase64: Buffer.from(againCsv, 'utf8').toString('base64'),
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.options.existingStrategy, 'skip');
  assert.strictEqual(res.body.report.totals.skipped_existing, 1);
  assert.strictEqual(res.body.report.totals.updated, 0);
  const row = await queryOne(
    "SELECT description, affiliation FROM users WHERE user_type = 'student' AND LOWER(last_name)=LOWER(?)",
    [`User-${unique}`],
  );
  assert.strictEqual(String(row.description), 'Origine');
  // Remettre le défaut pour les autres tests / l'environnement local.
  await setSetting('students.import.existing_strategy', 'update', {
    userType: 'teacher',
    userId: 'test',
  });
});

test('POST /api/students/import accepte un MDP court si allow_weak_passwords', async () => {
  const { setSetting } = require('../lib/settings');
  await setSetting('students.import.allow_weak_passwords', true, {
    userType: 'teacher',
    userId: 'test',
  });
  const unique = Date.now();
  const csv = [
    'Rôle;Prénom;Nom;Mot de passe;Affiliation (n3|foret|both|id_carte);Groupes (noms/slugs, | ou ; ; chemin Parent>Enfant);Pseudo (optionnel);Email (optionnel);Description (optionnel)',
    `eleve;Weak;Pwd-${unique};ab;n3;;weak_${unique};weak_${unique}@example.com;Court`,
  ].join('\n');
  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'weak.csv',
      fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.options.allowWeakPasswords, true);
  assert.strictEqual(res.body.report.totals.created, 1);
  await setSetting('students.import.allow_weak_passwords', false, {
    userType: 'teacher',
    userId: 'test',
  });
});
