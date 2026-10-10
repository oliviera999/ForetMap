'use strict';

/**
 * Profil par défaut d'un groupe borné aux profils élèves (`lib/groupDefaultRolePolicy.js`).
 *
 * Un groupe ne confère qu'un profil élève : `visiteur` ou un palier n3beur (`eleve_*`, profil
 * sur mesure de rang < 400 sans `teacher.access`). Deux gardes :
 *   - à l'écriture : formulaire, import, synchronisation Moodle refusent un autre profil,
 *     administrateur compris ;
 *   - à l'application : un profil par défaut non élève déjà en base (donnée antérieure) n'est
 *     conféré à personne — ni par rattachement, ni par code de classe, ni par recalcul.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');

const { initSchema, initDatabase, queryOne, execute } = require('../database');
const { app } = require('../server');
const { ensureRbacBootstrap, getPrimaryRoleForUser, setPrimaryRole } = require('../lib/rbac');
const {
  pickEffectiveRole,
  recomputeUserRole,
  recomputeGroupMembersRoles,
} = require('../lib/effectiveRole');
const { isGroupConferrableRole } = require('../lib/groupDefaultRolePolicy');
const { isStudentProfileRole } = require('../lib/shared/n3beurRolesCore');
const { validatePoliciesSetting } = require('../lib/moodle/policies');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const createdUserIds = [];
const createdRoleIds = [];
const createdGroupIds = [];
let adminToken;

async function roleBySlug(slug) {
  const role = await queryOne('SELECT id, slug, `rank` FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, `profil ${slug} absent`);
  return role;
}

async function createRole({ slug, rank, permissions = [] }) {
  await execute(
    'INSERT INTO roles (slug, display_name, `rank`, is_system, display_order) VALUES (?, ?, ?, 0, 900)',
    [slug, slug, rank],
  );
  const role = await queryOne('SELECT * FROM roles WHERE slug = ? LIMIT 1', [slug]);
  createdRoleIds.push(role.id);
  for (const key of permissions) {
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [
      role.id,
      key,
    ]);
  }
  return role;
}

async function createStudent() {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
       (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash,
        auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Eleve', ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [
      id,
      `e${id.slice(0, 8)}.${stamp}@groupe.test`,
      `e${id.slice(0, 10)}`,
      `Groupe${id.slice(0, 8)}`,
      `Eleve ${id.slice(0, 8)}`,
    ],
  );
  createdUserIds.push(id);
  await recomputeUserRole(id); // visiteur
  return id;
}

/** Groupe posé directement en base : reproduit une donnée antérieure à la garde d'écriture. */
async function insertGroup(defaultRoleId, { force = false } = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, force_default_role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, ?, 1, NOW(), NOW())`,
    [id, `eleve-${id.slice(0, 8)}`, `Eleve ${id.slice(0, 8)}`, defaultRoleId, force ? 1 : 0],
  );
  createdGroupIds.push(id);
  return id;
}

async function effectiveSlug(userId) {
  return (await getPrimaryRoleForUser('student', userId))?.slug ?? null;
}

function createGroupViaApi(body) {
  return request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ kind: 'class', ...body });
}

test.before(async () => {
  await initSchema();
  await initDatabase();
  await ensureRbacBootstrap();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
});

test.after(async () => {
  for (const id of createdGroupIds) {
    await execute('DELETE FROM group_members WHERE group_id = ?', [id]);
    await execute('DELETE FROM `groups` WHERE id = ?', [id]);
  }
  for (const id of createdUserIds) {
    await execute('DELETE FROM group_members WHERE user_id = ?', [id]);
    await execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
  for (const id of createdRoleIds) {
    await execute('UPDATE `groups` SET default_role_id = NULL WHERE default_role_id = ?', [id]);
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
    await execute('DELETE FROM roles WHERE id = ?', [id]);
  }
});

// --- Règle pure ------------------------------------------------------------------------------

test('profil élève : visiteur et paliers n3beur, jamais l’encadrement ni personnel', () => {
  for (const slug of ['visiteur', 'eleve_novice', 'eleve_avance', 'eleve_chevronne']) {
    assert.equal(isStudentProfileRole(slug), true, slug);
  }
  for (const slug of ['admin', 'prof', 'prof_classe', 'personnel', 'gl_player', 'gl_mj']) {
    assert.equal(isStudentProfileRole({ slug, rank: 100 }), false, slug);
  }
  assert.equal(isStudentProfileRole({ slug: 'jardinier', rank: 150 }), true);
  assert.equal(isStudentProfileRole({ slug: 'jardinier', rank: 400 }), false);
  assert.equal(isStudentProfileRole({ slug: 'jardinier' }), false, 'sans rang : refusé');

  assert.equal(isGroupConferrableRole({ slug: 'jardinier', rank: 150 }), true);
  assert.equal(
    isGroupConferrableRole({ slug: 'jardinier', rank: 150, opens_teacher_access: 1 }),
    false,
  );
  assert.equal(
    isGroupConferrableRole({
      slug: 'jardinier',
      rank: 150,
      permissions: [{ key: 'teacher.access' }],
    }),
    false,
  );
});

test('pickEffectiveRole : un profil par défaut non élève n’est conféré à personne', () => {
  const visiteur = { id: 1, slug: 'visiteur', rank: 50 };
  const conferred = (role, forced) => ({
    ...role,
    group_id: 'g',
    group_name: 'G',
    force_default_role: forced ? 1 : 0,
  });
  for (const forced of [false, true]) {
    const out = pickEffectiveRole({
      userType: 'student',
      assigned: visiteur,
      conferred: [conferred({ id: 9, slug: 'prof', rank: 400 }, forced)],
    });
    assert.equal(out.role.slug, 'visiteur', `imposé : ${forced}`);
    assert.equal(out.source, 'assigned');
  }
  const viaPermission = pickEffectiveRole({
    userType: 'student',
    assigned: visiteur,
    conferred: [conferred({ id: 8, slug: 'assistant', rank: 300, opens_teacher_access: 1 })],
  });
  assert.equal(viaPermission.role.slug, 'visiteur');
});

// --- Garde à l'écriture ------------------------------------------------------------------------

test('écriture : l’administrateur ne pose qu’un profil élève comme profil par défaut', async () => {
  const opener = await createRole({
    slug: `groupe-ouvre-n3boss-${stamp}`,
    rank: 200,
    permissions: ['teacher.access'],
  });
  for (const ref of [
    (await roleBySlug('prof')).id,
    (await roleBySlug('admin')).id,
    (await roleBySlug('prof_classe')).id,
    (await roleBySlug('personnel')).id,
    opener.id,
  ]) {
    const res = await createGroupViaApi({
      name: `Refus ${ref} ${stamp}`,
      slug: `refus-${ref}-${stamp}`,
      default_role_id: ref,
    });
    assert.equal(res.status, 400, `profil ${ref} : ${JSON.stringify(res.body)}`);
    assert.match(String(res.body.error), /profil élève/);
  }

  const ok = await createGroupViaApi({
    name: `Classe novice ${stamp}`,
    slug: `classe-novice-${stamp}`,
    default_role_id: (await roleBySlug('eleve_novice')).id,
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  createdGroupIds.push(ok.body.id);
  assert.equal(ok.body.default_role_conferrable, true);

  const patched = await request(app)
    .patch(`/api/groups/${ok.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ default_role_id: (await roleBySlug('prof')).id });
  assert.equal(patched.status, 400, JSON.stringify(patched.body));
  const row = await queryOne('SELECT default_role_id FROM `groups` WHERE id = ?', [ok.body.id]);
  assert.equal(Number(row.default_role_id), Number((await roleBySlug('eleve_novice')).id));
});

test('écriture : `group_default_allowed` ne propose que les profils élèves', async () => {
  const res = await request(app)
    .get('/api/rbac/profiles')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const bySlug = new Map(res.body.roles.map((r) => [r.slug, r]));
  for (const slug of ['visiteur', 'eleve_novice', 'eleve_avance', 'eleve_chevronne']) {
    assert.equal(bySlug.get(slug)?.group_default_allowed, true, slug);
  }
  for (const slug of ['admin', 'prof', 'prof_classe', 'personnel']) {
    assert.equal(bySlug.get(slug)?.group_default_allowed, false, slug);
  }
});

test('écriture : une politique Moodle ne nomme pas un profil d’encadrement', () => {
  const policy = (role) => [{ key: 'p', pattern: '^x$', group_kind: 'class', role }];
  for (const role of ['prof', 'admin', 'prof_classe', 'personnel']) {
    assert.match(String(validatePoliciesSetting(policy(role))), /profil élève/, role);
  }
  assert.equal(validatePoliciesSetting(policy('eleve_novice')), null);
  assert.equal(validatePoliciesSetting(policy('visiteur')), null);
});

// --- Garde à l'application ---------------------------------------------------------------------

test('application : un groupe au profil par défaut non élève ne le transmet par aucune voie', async () => {
  const prof = await roleBySlug('prof');
  const groupId = await insertGroup(prof.id);

  // Rattachement unitaire (par l'administrateur, que la garde de rang laisse passer).
  const pupil = await createStudent();
  await request(app)
    .post(`/api/groups/${groupId}/members/${pupil}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
  assert.equal(await effectiveSlug(pupil), 'visiteur');

  // Inscription avec le code de classe du groupe.
  const gen = await request(app)
    .post(`/api/groups/${groupId}/class-code`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ action: 'generate' })
    .expect(200);
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Code',
      lastName: `NonEleve${stamp}`,
      password: 'mot-de-passe-code',
      classCode: gen.body.class_code,
    })
    .expect(201);
  createdUserIds.push(reg.body.id);
  assert.ok(
    await queryOne('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', [
      groupId,
      reg.body.id,
    ]),
    'l’inscrit rejoint bien le groupe',
  );
  assert.equal(await effectiveSlug(reg.body.id), 'visiteur');
  assert.equal(reg.body.auth?.roleSlug ?? 'visiteur', 'visiteur');

  // Synchronisation / recalcul : un profil déjà transmis avant la garde est retiré.
  await setPrimaryRole('student', pupil, prof.id);
  assert.equal(await effectiveSlug(pupil), 'prof');
  await recomputeGroupMembersRoles(groupId);
  assert.equal(await effectiveSlug(pupil), 'visiteur');

  // La liste des groupes le signale.
  const list = await request(app)
    .get('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const listed = list.body.groups.find((g) => g.id === groupId);
  assert.equal(listed?.default_role_conferrable, false);
});

test('application : un groupe imposant un profil non élève n’impose rien', async () => {
  const groupId = await insertGroup((await roleBySlug('prof_classe')).id, { force: true });
  const pupil = await createStudent();
  await request(app)
    .post(`/api/groups/${groupId}/members/${pupil}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
  assert.equal(await effectiveSlug(pupil), 'visiteur');
});

test('application : un profil sur mesure qui ouvre l’interface n3boss n’est pas conféré', async () => {
  const opener = await createRole({
    slug: `groupe-assistant-${stamp}`,
    rank: 300,
    permissions: ['teacher.access'],
  });
  const groupId = await insertGroup(opener.id);
  const pupil = await createStudent();
  await request(app)
    .post(`/api/groups/${groupId}/members/${pupil}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
  assert.equal(await effectiveSlug(pupil), 'visiteur');

  // Un palier n3beur, lui, se transmet toujours.
  const novice = await insertGroup((await roleBySlug('eleve_novice')).id);
  await request(app)
    .post(`/api/groups/${novice}/members/${pupil}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
  assert.equal(await effectiveSlug(pupil), 'eleve_novice');
});
