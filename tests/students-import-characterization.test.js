'use strict';

/**
 * Caractérisation de `POST /api/students/import` (piste B, étape B6 ; ligne 14 du § 3.3 de
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`), écrite **avant** l'extraction du handler vers
 * `lib/students/studentImportService.js`.
 *
 * Un fichier d'import « type » couvre en une fois : doublons fusionnés, classes et
 * sous-groupes (existants, à créer, hors périmètre), lignes en erreur (prénom, profil,
 * mot de passe, pseudo, e-mail déjà pris), mise à jour contre création, profil conservé ou
 * relevé, homonyme sous l'autre type de compte. Le **rapport entier** est comparé (aperçu
 * puis import réel), ainsi que les effets en base et la ligne d'audit. Comptes fictifs.
 *
 * Les rapports sont comparés à `tests/fixtures/students-import-characterization.golden.json`,
 * après une seule normalisation : l'identifiant unique du run devient `<U>`. Régénérer la
 * référence (changement de comportement VOULU, à justifier dans la PR) :
 *   B6_CHAR_RECORD=1 node --test tests/students-import-characterization.test.js
 *   npx prettier --write tests/fixtures/students-import-characterization.golden.json
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { TEMPLATE_COLUMNS, csvEscape } = require('../lib/studentRouteHelpers');
const { setAssignedRole } = require('../lib/effectiveRole');
const { setSetting, getSettingValue } = require('../lib/settings');

const HEADER = TEMPLATE_COLUMNS.map(csvEscape).join(';');
const U = crypto.randomUUID().slice(0, 8);
const SETTING_KEYS = [
  'students.import.existing_strategy',
  'students.import.allow_weak_passwords',
  'security.password_min_length',
];
const savedSettings = {};
let adminToken;
let adminId;
const GOLDEN_PATH = path.join(
  __dirname,
  'fixtures',
  'students-import-characterization.golden.json',
);
const RECORD = process.env.B6_CHAR_RECORD === '1';
const recorded = {};

/** Remplace l'identifiant unique du run par `<U>` pour comparer à un instantané stable. */
function normalize(value) {
  return JSON.parse(JSON.stringify(value).split(U).join('<U>'));
}

/** Compare à la référence (ou l'enregistre en mode B6_CHAR_RECORD=1) ; rend la référence. */
function expectGolden(name, actual) {
  const normalized = normalize(actual);
  if (RECORD) {
    recorded[name] = normalized;
    return normalized;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.ok(Object.hasOwn(golden, name), `référence absente : ${name}`);
  assert.deepStrictEqual(normalized, golden[name], name);
  return golden[name];
}

async function roleId(slug) {
  const row = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(row?.id, `profil ${slug} absent`);
  return row.id;
}

async function createAccount({
  userType = 'student',
  firstName,
  lastName,
  roleSlug,
  email = null,
  pseudo = null,
  description = null,
}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, first_name, last_name, display_name, email, pseudo, description, password_hash,
       auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [
      id,
      userType,
      firstName,
      lastName,
      `${firstName} ${lastName}`,
      email,
      pseudo,
      description,
      await bcrypt.hash('ancien-mdp-123', 4),
    ],
  );
  if (roleSlug) await setAssignedRole(id, await roleId(roleSlug));
  return id;
}

async function createGroup(name, parentId = null) {
  const id = crypto.randomUUID();
  await execute(
    'INSERT INTO `groups` (id, name, slug, kind, parent_group_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [id, name, `g-${crypto.randomUUID().slice(0, 12)}`, 'class', parentId],
  );
  return id;
}

function postImport(token, csvLines, extra = {}) {
  return request(app)
    .post('/api/students/import')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'import-type.csv',
      fileDataBase64: Buffer.from([HEADER, ...csvLines].join('\n'), 'utf8').toString('base64'),
      ...extra,
    });
}

async function primaryRoleSlug(userId) {
  const row = await queryOne(
    `SELECT r.slug FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [userId],
  );
  return row?.slug || null;
}

async function userByName(firstName, lastName, userType = 'student') {
  return queryOne(
    'SELECT * FROM users WHERE user_type = ? AND first_name = ? AND last_name = ? LIMIT 1',
    [userType, firstName, lastName],
  );
}

async function groupNamesOf(userId) {
  const rows = await queryAll(
    'SELECT g.name FROM group_members gm INNER JOIN `groups` g ON g.id = gm.group_id WHERE gm.user_id = ? ORDER BY g.name',
    [userId],
  );
  return rows.map((r) => r.name.split(U).join('<U>'));
}

test.before(async () => {
  await initSchema();
  for (const key of SETTING_KEYS) savedSettings[key] = await getSettingValue(key, undefined);
  await setSetting('students.import.existing_strategy', 'update', {});
  await setSetting('students.import.allow_weak_passwords', false, {});
  await setSetting('security.password_min_length', 8, {});
  const admin = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [String(process.env.TEACHER_ADMIN_EMAIL || '').trim()],
  );
  assert.ok(admin?.id);
  adminId = admin.id;
  adminToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: admin.id,
      canonicalUserId: admin.id,
      roleId: await roleId('admin'),
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
});

test.after(async () => {
  if (RECORD) fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
  for (const key of SETTING_KEYS) {
    if (savedSettings[key] !== undefined) await setSetting(key, savedSettings[key], {});
  }
});

test('import type (administrateur) : aperçu puis import réel, rapport et effets en base', async () => {
  const existing = await createAccount({
    firstName: `Exist ${U}`,
    lastName: 'Eleve',
    roleSlug: 'eleve_novice',
    email: `exist.${U}@example.com`,
    pseudo: `exist_${U}`,
    description: 'ancienne description',
  });
  const high = await createAccount({
    firstName: `Haut ${U}`,
    lastName: 'Eleve',
    roleSlug: 'eleve_chevronne',
  });
  const rising = await createAccount({
    firstName: `Montee ${U}`,
    lastName: 'Eleve',
    roleSlug: 'eleve_novice',
  });
  await createAccount({
    userType: 'teacher',
    firstName: `Homo ${U}`,
    lastName: 'Nyme',
    roleSlug: 'prof',
  });
  await createAccount({
    firstName: `Email ${U}`,
    lastName: 'Pris',
    email: `pris.${U}@example.com`,
  });
  await createGroup(`Groupe Existant ${U}`);
  const epochBefore = (await queryOne('SELECT token_epoch FROM users WHERE id = ?', [rising]))
    .token_epoch;

  const lines = [
    `eleve;Nouveau ${U};Alpha;pass1234;Classe ${U} > Atelier ${U};;;`,
    `eleve;Nouveau ${U};Alpha;;Club ${U};nv_${U};;`,
    `eleve;;SansPrenom;pass1234;;;;`,
    `sorcier;Role ${U};Inconnu;pass1234;;;;`,
    `eleve;Court ${U};Mdp;ab;;;;`,
    `prof;Prof ${U};Nouveau;MotDePasse12!;;prof_${U};prof.${U}@example.com;Enseignant importé`,
    `;Exist ${U};Eleve;;;;nouvel.exist.${U}@example.com;nouvelle description`,
    `eleve;Doublon ${U};Email;pass1234;;;pris.${U}@example.com;`,
    `eleve;Homo ${U};Nyme;pass1234;;;;`,
    `eleve;Haut ${U};Eleve;;;;;`,
    `eleve;SansMdp ${U};Nouveau;;;;;`,
    `eleve;Pseudo ${U};Invalide;pass1234;;pseudo invalide!;;`,
    `eleve_avance;Montee ${U};Eleve;nouveau123;;;;`,
    `eleve;Groupe ${U};Existant;pass1234;Groupe Existant ${U};;;`,
  ];

  const dry = await postImport(adminToken, lines, { dryRun: true }).expect(200);
  expectGolden('admin_dry_run', dry.body);
  assert.equal(await userByName(`Nouveau ${U}`, 'Alpha'), undefined, 'aperçu sans écriture');
  assert.equal(
    await queryOne('SELECT id FROM `groups` WHERE name = ?', [`Classe ${U}`]),
    undefined,
  );

  const real = await postImport(adminToken, lines).expect(200);
  const realGolden = expectGolden('admin_import', real.body);

  // Créations : champs, profil, mot de passe, groupes (créés et existants).
  const created = await userByName(`Nouveau ${U}`, 'Alpha');
  assert.ok(created);
  assert.equal(created.display_name, `Nouveau ${U} Alpha`);
  assert.equal(created.pseudo, `nv_${U}`);
  assert.equal(created.email, null);
  assert.equal(created.auth_provider, 'local');
  assert.equal(Number(created.is_active), 1);
  assert.ok(created.last_seen);
  assert.equal(await bcrypt.compare('pass1234', created.password_hash), true);
  assert.equal(created.assigned_role_id, await roleId('eleve_novice'));
  assert.equal(await primaryRoleSlug(created.id), 'eleve_novice');
  assert.deepEqual(await groupNamesOf(created.id), ['Atelier <U>', 'Club <U>']);
  const atelier = await queryOne('SELECT parent_group_id FROM `groups` WHERE name = ?', [
    `Atelier ${U}`,
  ]);
  const classe = await queryOne('SELECT id FROM `groups` WHERE name = ?', [`Classe ${U}`]);
  assert.equal(atelier.parent_group_id, classe.id);

  const prof = await userByName(`Prof ${U}`, 'Nouveau', 'teacher');
  assert.ok(prof);
  assert.equal(prof.email, `prof.${U}@example.com`);
  assert.equal(prof.description, 'Enseignant importé');
  assert.equal(await primaryRoleSlug(prof.id), 'prof');

  const homonym = await userByName(`Homo ${U}`, 'Nyme', 'student');
  assert.ok(homonym, 'homonyme créé sous le type élève');
  const withGroup = await userByName(`Groupe ${U}`, 'Existant');
  assert.deepEqual(await groupNamesOf(withGroup.id), ['Groupe Existant <U>']);

  // Mises à jour : e-mail et description remplacés, profil conservé ou relevé.
  const updated = await queryOne('SELECT * FROM users WHERE id = ?', [existing]);
  assert.equal(updated.email, `nouvel.exist.${U}@example.com`);
  assert.equal(updated.description, 'nouvelle description');
  assert.equal(updated.pseudo, `exist_${U}`);
  assert.equal(await bcrypt.compare('ancien-mdp-123', updated.password_hash), true);
  assert.equal(await primaryRoleSlug(existing), 'eleve_novice');
  assert.equal(await primaryRoleSlug(high), 'eleve_chevronne');
  assert.equal(await primaryRoleSlug(rising), 'eleve_avance');
  const risingRow = await queryOne('SELECT password_hash, token_epoch FROM users WHERE id = ?', [
    rising,
  ]);
  assert.equal(await bcrypt.compare('nouveau123', risingRow.password_hash), true);
  assert.equal(Number(risingRow.token_epoch), Number(epochBefore) + 1);

  // Lignes refusées : rien d'écrit.
  assert.equal(await userByName(`Court ${U}`, 'Mdp'), undefined);
  assert.equal(await userByName(`SansMdp ${U}`, 'Nouveau'), undefined);
  assert.equal(await userByName(`Doublon ${U}`, 'Email'), undefined);

  // Journal : une ligne d'audit `students_import` portant les totaux et les options.
  const audit = await queryOne(
    `SELECT action, target_type, target_id, details, payload_json, actor_user_type, actor_user_id
       FROM audit_log WHERE action = 'students_import' ORDER BY id DESC LIMIT 1`,
  );
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.deepEqual(
    {
      ...audit,
      payload_json: payload,
    },
    {
      action: 'students_import',
      target_type: 'user',
      target_id: null,
      details: 'Import de 4 compte(s) créé(s), 3 mis à jour',
      payload_json: {
        report: realGolden.report.totals,
        options: realGolden.report.options,
      },
      actor_user_type: 'teacher',
      actor_user_id: adminId,
    },
  );

  // Ré-import du même fichier en « skip » : tout existe, rien n'est écrit, rien n'est audité.
  const auditCount = (
    await queryOne("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'students_import'")
  ).c;
  const skip = await postImport(adminToken, lines, { existingStrategy: 'skip' }).expect(200);
  expectGolden('admin_reimport_skip', skip.body);
  assert.equal(
    (await queryOne("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'students_import'")).c,
    auditCount,
  );
});

test('import type (acteur à périmètre de classe) : périmètre, comptes protégés, profils', async () => {
  const scopedRoleSlug = `carac_import_${U}`;
  const insertRole = await execute(
    'INSERT INTO roles (slug, display_name, `rank`, is_system) VALUES (?, ?, 360, 0)',
    [scopedRoleSlug, `Profil import ${U}`],
  );
  const scopedRoleId = insertRole.insertId;
  await execute('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
    scopedRoleId,
    'students.import',
  ]);
  const actorId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, email, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', 'Acteur', ?, ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [actorId, `Scope ${U}`, `Acteur Scope ${U}`, `acteur.${U}@example.com`, 'x'],
  );
  try {
    await setAssignedRole(actorId, scopedRoleId);
    const myClass = await createGroup(`Ma Classe ${U}`);
    const otherClass = await createGroup(`Autre Classe ${U}`);
    await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
      myClass,
      actorId,
      'teacher',
    ]);
    const inScope = await createAccount({
      firstName: `InScope ${U}`,
      lastName: 'Eleve',
      roleSlug: 'eleve_novice',
    });
    await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
      myClass,
      inScope,
      'student',
    ]);
    const outScope = await createAccount({
      firstName: `OutScope ${U}`,
      lastName: 'Eleve',
      roleSlug: 'eleve_novice',
    });
    await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
      otherClass,
      outScope,
      'student',
    ]);
    await createAccount({
      userType: 'teacher',
      firstName: `ProfCible ${U}`,
      lastName: 'Prof',
      roleSlug: 'prof',
    });
    const token = await signAuthToken(
      {
        userType: 'teacher',
        userId: actorId,
        canonicalUserId: actorId,
        roleId: scopedRoleId,
        roleSlug: scopedRoleSlug,
        roleDisplayName: `Profil import ${U}`,
        elevated: false,
      },
      false,
    );
    const lines = [
      `eleve;InScope ${U};Eleve;;;;;description en portée`,
      `eleve;OutScope ${U};Eleve;;;;;hors portée`,
      `prof;ProfCible ${U};Prof;MotDePasse12!;;;;`,
      `prof_classe;ProfCible ${U};Prof;;;;;`,
      `admin;Grant ${U};Refuse;MotDePasse12!;;;;`,
      `eleve;Nouveau Scope ${U};Eleve;pass1234;Ma Classe ${U};;;`,
      `eleve;Hors Groupe ${U};Eleve;pass1234;Autre Classe ${U};;;`,
    ];
    const dry = await postImport(token, lines, { dryRun: true }).expect(200);
    expectGolden('scoped_dry_run', dry.body);
    const real = await postImport(token, lines).expect(200);
    expectGolden('scoped_import', real.body);
    assert.equal(
      (await queryOne('SELECT description FROM users WHERE id = ?', [inScope])).description,
      'description en portée',
    );
    assert.equal(
      (await queryOne('SELECT description FROM users WHERE id = ?', [outScope])).description,
      null,
    );
    const created = await userByName(`Nouveau Scope ${U}`, 'Eleve');
    assert.deepEqual(await groupNamesOf(created.id), ['Ma Classe <U>']);
    const outside = await userByName(`Hors Groupe ${U}`, 'Eleve');
    assert.ok(outside, 'le compte est créé même si le groupe est refusé');
    assert.deepEqual(await groupNamesOf(outside.id), []);
  } finally {
    await execute('DELETE FROM user_roles WHERE role_id = ?', [scopedRoleId]);
    await execute('UPDATE users SET assigned_role_id = NULL WHERE assigned_role_id = ?', [
      scopedRoleId,
    ]);
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [scopedRoleId]);
    await execute('DELETE FROM roles WHERE id = ?', [scopedRoleId]);
  }
});

test('refus d’entrée : fichier absent, vide, trop de lignes, stratégie inconnue', async () => {
  const missing = await request(app)
    .post('/api/students/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ dryRun: true });
  // Fichier absent : l'erreur « Fichier requis » remonte au gestionnaire central (500 masqué).
  assert.deepEqual(
    { status: missing.status, body: missing.body },
    { status: 500, body: { error: 'Erreur serveur' } },
  );

  const empty = await postImport(adminToken, [], { dryRun: true });
  assert.deepEqual(
    { status: empty.status, body: empty.body },
    { status: 400, body: { error: 'Aucune ligne importable détectée' } },
  );

  const many = Array.from({ length: 1001 }, (_, i) => `eleve;Masse${i};${U};pass1234;;;;`);
  const tooMany = await postImport(adminToken, many, { dryRun: true });
  assert.deepEqual(
    { status: tooMany.status, body: tooMany.body },
    { status: 400, body: { error: 'Import limité à 1000 lignes' } },
  );

  const badStrategy = await postImport(adminToken, [`eleve;A;${U};pass1234;;;;`], {
    existingStrategy: 'merge',
  });
  assert.deepEqual(
    { status: badStrategy.status, body: badStrategy.body },
    { status: 400, body: { error: 'existingStrategy invalide (update, fill ou skip attendu)' } },
  );
});
