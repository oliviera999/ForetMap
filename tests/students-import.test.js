require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { TEMPLATE_COLUMNS, csvEscape } = require('../lib/studentRouteHelpers');
const { setAssignedRole } = require('../lib/effectiveRole');
const { checkRoleAssignmentAllowed } = require('../lib/rbacRoleAssignment');

/** En-tête CSV aligné sur le modèle officiel (`csvEscape` pour les cellules à « ; »). */
const IMPORT_CSV_HEADER = TEMPLATE_COLUMNS.map(csvEscape).join(';');

let teacherToken;

test.before(async () => {
  await initSchema();
  const { setSetting } = require('../lib/settings');
  await setSetting('students.import.existing_strategy', 'update', {
    userType: 'teacher',
    userId: 'test',
  });
  await setSetting('students.import.allow_weak_passwords', false, {
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
    await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [adminRole.id, teacher.id]);
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
    'personnel',
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
    IMPORT_CSV_HEADER,
    `eleve;Import;Eleve-${unique};pass123;Classe Import ${unique};import_${unique};import_${unique}@gmail.com;Test import hors domaine`,
    `prof;Import;SansMdp-${unique};;;;;`,
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
    IMPORT_CSV_HEADER,
    `eleve;Mass;Create-${unique};pass123;Classe Mass ${unique};mass_${unique};mass_${unique}@example.com;Import réel`,
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
    IMPORT_CSV_HEADER,
    `prof;Prof;Import-${unique};MotDePasse12!;;prof_${unique};prof_${unique}@gmail.com;Import prof hors domaine`,
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
    IMPORT_CSV_HEADER,
    `prof_classe;Tuteur;Classe-${unique};MotDePasse12!;Classe Tuteur ${unique}|Autre Classe ${unique};tuteur_${unique};tuteur_${unique}@outlook.com;Import tuteur`,
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
  const header = IMPORT_CSV_HEADER;
  const createCsv = [
    header,
    `eleve;Maj;User-${unique};pass123;;maj_${unique};maj_${unique}@example.com;Avant`,
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
    `eleve_avance;Maj;User-${unique};;Classe Maj ${unique};maj_${unique}_v2;maj_v2_${unique}@example.com;Après`,
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
  const header = IMPORT_CSV_HEADER;
  const createCsv = [
    header,
    `eleve;Skip;User-${unique};pass123;;skip_${unique};skip_${unique}@example.com;Origine`,
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
    `eleve;Skip;User-${unique};pass123;;skip_${unique}_x;skip_x_${unique}@example.com;Changé`,
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
    "SELECT description FROM users WHERE user_type = 'student' AND LOWER(last_name)=LOWER(?)",
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
    IMPORT_CSV_HEADER,
    `eleve;Weak;Pwd-${unique};ab;;weak_${unique};weak_${unique}@example.com;Court`,
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

async function createTeacherWithRole({ firstName, lastName, roleSlug, email, password }) {
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password || 'MotDePasse12!', 10);
  const pseudo = `imp_${id.slice(0, 8)}`;
  await execute(
    `INSERT INTO users
      (id, user_type, first_name, last_name, display_name, email, pseudo, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [id, firstName, lastName, `${firstName} ${lastName}`, email, pseudo, hash],
  );
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `rôle ${roleSlug} introuvable`);
  await setAssignedRole(id, role.id);
  return { id, roleId: role.id, email, firstName, lastName, passwordHash: hash };
}

test('POST /api/students/import : un n3boss ne peut pas modifier un administrateur', async () => {
  const unique = Date.now();
  const adminUser = await createTeacherWithRole({
    firstName: 'Cible',
    lastName: `Admin-${unique}`,
    roleSlug: 'admin',
    email: `cible.admin.${unique}@example.com`,
  });
  const n3boss = await createTeacherWithRole({
    firstName: 'N3',
    lastName: `Boss-${unique}`,
    roleSlug: 'prof',
    email: `n3boss.import.${unique}@example.com`,
  });
  const n3bossToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: n3boss.id,
      canonicalUserId: n3boss.id,
      roleId: n3boss.roleId,
      roleSlug: 'prof',
      roleDisplayName: 'n3boss',
      elevated: false,
    },
    false,
  );
  const csv = [
    IMPORT_CSV_HEADER,
    `prof;Cible;Admin-${unique};NouveauMdp12!;;hacked_${unique};hacked_${unique}@example.com;Prise de controle`,
  ].join('\n');
  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + n3bossToken)
    .send({
      fileName: 'takeover.csv',
      fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.updated, 0);
  assert.strictEqual(res.body.report.totals.created, 0);
  assert.ok(res.body.report.errors.some((e) => /administrateur/i.test(e.error)));
  const row = await queryOne('SELECT email, password_hash FROM users WHERE id = ?', [adminUser.id]);
  assert.strictEqual(String(row.email).toLowerCase(), adminUser.email);
  assert.strictEqual(row.password_hash, adminUser.passwordHash);
  const role = await queryOne(
    `SELECT r.slug FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_type = 'teacher' AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [adminUser.id],
  );
  assert.strictEqual(role?.slug, 'admin');
});

test('POST /api/students/import : propre compte refusé, dernier admin protégé par la garde', async () => {
  const seed = await queryOne(
    "SELECT id, first_name, last_name FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [String(process.env.TEACHER_ADMIN_EMAIL || '').trim()],
  );
  assert.ok(seed?.id);
  const unique = Date.now();
  const firstName = 'Seed';
  const lastName = `AdminLast-${unique}`;
  await execute('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?', [
    firstName,
    lastName,
    seed.id,
  ]);
  const otherAdmins = await queryAll(
    `SELECT ur.user_id
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.is_primary = 1 AND ur.user_type = 'teacher' AND r.slug = 'admin' AND ur.user_id <> ?`,
    [seed.id],
  );
  const profRole = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  for (const row of otherAdmins) {
    await setAssignedRole(row.user_id, profRole.id);
  }
  try {
    const csv = [IMPORT_CSV_HEADER, `prof;${firstName};${lastName};AutreMdp123!;;;;`].join('\n');
    const res = await request(app)
      .post('/api/students/import')
      .set('Authorization', 'Bearer ' + teacherToken)
      .send({
        fileName: 'last-admin.csv',
        fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
        dryRun: false,
      })
      .expect(200);

    assert.strictEqual(res.body.report.totals.updated, 0);
    // Un acteur ne modifie jamais son propre compte par import (la ligne est signalée).
    assert.ok(res.body.report.errors.some((e) => /propre compte/i.test(e.error)));
    // La garde partagée refuse quant à elle de rétrograder le dernier administrateur actif,
    // même pour le système (`actor = null`).
    const guard = await checkRoleAssignmentAllowed({
      actor: null,
      userType: 'teacher',
      userId: seed.id,
      roleId: profRole.id,
    });
    assert.strictEqual(guard.ok, false);
    assert.strictEqual(guard.status, 409);
    assert.match(String(guard.error), /dernier administrateur/i);
    const role = await queryOne(
      `SELECT r.slug FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_type = 'teacher' AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
      [seed.id],
    );
    assert.strictEqual(role?.slug, 'admin');
  } finally {
    for (const row of otherAdmins) {
      await setAssignedRole(row.user_id, adminRole.id);
    }
    await execute('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?', [
      seed.first_name,
      seed.last_name,
      seed.id,
    ]);
  }
});

test('POST /api/students/import : cellules vides ne transent pas e-mail / pseudo / description', async () => {
  const unique = Date.now();
  const header = IMPORT_CSV_HEADER;
  const createCsv = [
    header,
    `eleve;Garde;Champs-${unique};pass123;;garde_${unique};garde_${unique}@example.com;A conserver`,
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

  const updateCsv = [header, `eleve;Garde;Champs-${unique};;;;;`].join('\n');
  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'update-empty.csv',
      fileDataBase64: Buffer.from(updateCsv, 'utf8').toString('base64'),
      dryRun: false,
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.updated, 1);
  const row = await queryOne(
    "SELECT email, pseudo, description FROM users WHERE user_type = 'student' AND LOWER(last_name)=LOWER(?)",
    [`Champs-${unique}`],
  );
  assert.strictEqual(String(row.email).toLowerCase(), `garde_${unique}@example.com`);
  assert.strictEqual(String(row.pseudo), `garde_${unique}`);
  assert.strictEqual(String(row.description), 'A conserver');
});

test('POST /api/students/import : la colonne Rôle accepte les noms affichés des profils', async () => {
  const unique = Date.now();
  const csv = [
    IMPORT_CSV_HEADER,
    `n3beur novice;Libelle;Novice-${unique};pass123;;lib_nov_${unique};lib_nov_${unique}@example.com;`,
    `Élève avancé;Libelle;Avance-${unique};pass123;;lib_av_${unique};lib_av_${unique}@example.com;`,
    `n3beur chevronné 🏆;Libelle;Chevron-${unique};pass123;;lib_chev_${unique};lib_chev_${unique}@example.com;`,
    `Prof de classe;Libelle;Tuteur-${unique};MotDePasse12!;;lib_tut_${unique};lib_tut_${unique}@example.com;`,
  ].join('\n');

  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'libelles.csv',
      fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
      dryRun: true,
    })
    .expect(200);

  assert.strictEqual(
    res.body.report.totals.skipped_invalid,
    0,
    JSON.stringify(res.body.report.errors),
  );
  assert.strictEqual(res.body.report.totals.valid, 4);
  assert.deepEqual(
    res.body.report.preview.map((p) => p.role_slug),
    ['eleve_novice', 'eleve_avance', 'eleve_chevronne', 'prof_classe'],
  );
});

test('POST /api/students/import : un profil renommé en base reste reconnu', async () => {
  const unique = Date.now();
  const previous = await queryOne("SELECT display_name FROM roles WHERE slug = 'eleve_avance'");
  await execute("UPDATE roles SET display_name = ? WHERE slug = 'eleve_avance'", [
    'Jardinier confirmé',
  ]);
  try {
    const csv = [
      IMPORT_CSV_HEADER,
      `Jardinier confirmé;Renomme;Profil-${unique};pass123;;ren_${unique};ren_${unique}@example.com;`,
    ].join('\n');
    const res = await request(app)
      .post('/api/students/import')
      .set('Authorization', 'Bearer ' + teacherToken)
      .send({
        fileName: 'renomme.csv',
        fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
        dryRun: true,
      })
      .expect(200);
    assert.strictEqual(res.body.report.totals.valid, 1, JSON.stringify(res.body.report.errors));
    assert.strictEqual(res.body.report.preview[0].role_slug, 'eleve_avance');
  } finally {
    await execute("UPDATE roles SET display_name = ? WHERE slug = 'eleve_avance'", [
      previous?.display_name || 'n3beur avancé',
    ]);
  }
});

test('POST /api/students/import : rôle inconnu → message explicite, colonne vide → info', async () => {
  const unique = Date.now();
  const csv = [
    IMPORT_CSV_HEADER,
    `;Defaut;Role-${unique};pass123;;def_${unique};def_${unique}@example.com;`,
    `Terminale S;Inconnu;Role-${unique};pass123;;inc_${unique};inc_${unique}@example.com;`,
    `gl_mj;Gl;Role-${unique};MotDePasse12!;;gl_${unique};gl_${unique}@example.com;`,
  ].join('\n');

  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'roles.csv',
      fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
      dryRun: true,
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.valid, 1);
  assert.strictEqual(res.body.report.totals.skipped_invalid, 2);
  const roleErrors = res.body.report.errors.filter((e) => e.field === 'role');
  assert.ok(
    roleErrors.some((e) => /« Terminale S » inconnu/.test(e.error)),
    JSON.stringify(roleErrors),
  );
  assert.ok(
    roleErrors.some((e) => /G&L/.test(e.error)),
    JSON.stringify(roleErrors),
  );
  const info = (res.body.report.infos || []).find((i) => i.code === 'role_defaulted');
  assert.ok(info, 'aucune info sur la colonne Rôle vide');
  assert.deepEqual(info.rows, [2]);
});

test('POST /api/students/import : « Type » ne prime pas sur « Rôle », « E-mail » reconnu', async () => {
  const unique = Date.now();
  const header = ['Type', 'Rôle', 'Prénom', 'Nom', 'Mot de passe', 'E-mail'].join(';');
  const csv = [
    header,
    `eleve;prof_classe;Entete;Priorite-${unique};MotDePasse12!;entete_${unique}@example.com`,
  ].join('\n');

  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'entetes.csv',
      fileDataBase64: Buffer.from(csv, 'utf8').toString('base64'),
      dryRun: true,
    })
    .expect(200);

  assert.strictEqual(res.body.report.totals.valid, 1, JSON.stringify(res.body.report.errors));
  assert.strictEqual(res.body.report.preview[0].role_slug, 'prof_classe');
  assert.strictEqual(res.body.report.preview[0].user_type, 'teacher');
});

test('POST /api/students/import : le modèle téléchargé est importable tel quel', async () => {
  const template = await request(app)
    .get('/api/students/import/template?format=csv')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  const res = await request(app)
    .post('/api/students/import')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      fileName: 'modele.csv',
      fileDataBase64: Buffer.from(template.text, 'utf8').toString('base64'),
      dryRun: true,
    })
    .expect(200);

  assert.strictEqual(
    res.body.report.totals.skipped_invalid,
    0,
    JSON.stringify(res.body.report.errors),
  );
  assert.strictEqual(res.body.report.totals.merged_duplicates, 1);
  assert.strictEqual(res.body.report.totals.valid, res.body.report.totals.received - 1);
  const slugs = new Set(res.body.report.preview.map((p) => p.role_slug));
  for (const slug of [
    'visiteur',
    'personnel',
    'eleve_novice',
    'eleve_avance',
    'eleve_chevronne',
    'prof_classe',
    'prof',
    'admin',
  ]) {
    assert.ok(slugs.has(slug), `modèle sans exemple ${slug}`);
  }
});
