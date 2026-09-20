'use strict';

/**
 * Profil effectif (`lib/effectiveRole.js`) — règle « le plus élevé l'emporte ».
 *
 * Décision pure d'abord (`pickEffectiveRole`, sans base), puis recalcul persistant sur la
 * base de test : profil attribué, profils conférés par les groupes, groupe imposant,
 * défaut par type de compte, et interaction avec la progression automatique.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, queryOne, execute } = require('../database');
const {
  pickEffectiveRole,
  resolveEffectiveRole,
  recomputeUserRole,
  recomputeGroupMembersRoles,
  setAssignedRole,
  describeUserRoles,
} = require('../lib/effectiveRole');
const { getPrimaryRoleForUser, syncStudentPrimaryRoleFromProgress } = require('../lib/rbac');
const { restoreDefaultProgressionThresholds } = require('./helpers/progressionThresholds');

test.before(async () => {
  await initSchema();
  await restoreDefaultProgressionThresholds();
});

const ROLES = {};
async function roleBySlug(slug) {
  if (!ROLES[slug]) {
    ROLES[slug] = await queryOne(
      'SELECT id, slug, display_name, `rank` FROM roles WHERE slug = ?',
      [slug],
    );
    assert.ok(ROLES[slug]?.id, `profil ${slug} absent`);
  }
  return ROLES[slug];
}

async function createUser(label, userType = 'student') {
  const id = crypto.randomUUID();
  const unique = `${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await execute(
    `INSERT INTO users
      (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, userType, `${unique}@example.com`, `eff_${unique}`, 'Test', label, `Test ${label}`],
  );
  return id;
}

async function createGroup({ defaultRoleSlug = null, forceDefaultRole = false, isActive = true }) {
  const id = crypto.randomUUID();
  const slug = `eff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const defaultRoleId = defaultRoleSlug ? (await roleBySlug(defaultRoleSlug)).id : null;
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, force_default_role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, ?, ?, NOW(), NOW())`,
    [id, slug, slug, defaultRoleId, forceDefaultRole ? 1 : 0, isActive ? 1 : 0],
  );
  return id;
}

async function addMember(groupId, userId, userType = 'student') {
  await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
    groupId,
    userId,
    userType,
  ]);
}

async function effectiveSlug(userType, userId) {
  return (await getPrimaryRoleForUser(userType, userId))?.slug ?? null;
}

// ---------------------------------------------------------------------------------------
// Décision pure
// ---------------------------------------------------------------------------------------

const r = (id, slug, rank, extra = {}) => ({ id, slug, display_name: slug, rank, ...extra });
const conferredBy = (groupId, role, forced = false) => ({
  ...role,
  group_id: groupId,
  group_name: `G ${groupId}`,
  force_default_role: forced ? 1 : 0,
});

test('pickEffectiveRole : sans rien, le défaut du type (source « default »)', () => {
  const out = pickEffectiveRole({
    userType: 'student',
    assigned: null,
    conferred: [],
    defaultRole: r(1, 'visiteur', 50),
  });
  assert.strictEqual(out.source, 'default');
  assert.strictEqual(out.role.slug, 'visiteur');
  assert.strictEqual(
    pickEffectiveRole({ userType: 'student', assigned: null, conferred: [] }),
    null,
  );
});

test('pickEffectiveRole : le plus élevé entre attribué et groupes ; à rang égal, l’attribué', () => {
  const assigned = r(2, 'eleve_novice', 100);
  const higher = conferredBy('g1', r(3, 'eleve_avance', 200));
  const lower = conferredBy('g2', r(1, 'visiteur', 50));
  const out = pickEffectiveRole({ userType: 'student', assigned, conferred: [lower, higher] });
  assert.strictEqual(out.source, 'group');
  assert.strictEqual(out.groupId, 'g1');
  assert.strictEqual(out.role.slug, 'eleve_avance');

  const same = pickEffectiveRole({
    userType: 'student',
    assigned,
    conferred: [conferredBy('g3', r(9, 'novice_bis', 100))],
  });
  assert.strictEqual(same.source, 'assigned');
  assert.strictEqual(same.role.slug, 'eleve_novice');
});

test('pickEffectiveRole : un groupe imposant l’emporte pour un élève, pas pour un enseignant', () => {
  const assigned = r(3, 'eleve_avance', 200);
  const forced = conferredBy('g1', r(1, 'visiteur', 50), true);
  const student = pickEffectiveRole({ userType: 'student', assigned, conferred: [forced] });
  assert.strictEqual(student.source, 'forced');
  assert.strictEqual(student.role.slug, 'visiteur');
  const teacher = pickEffectiveRole({ userType: 'teacher', assigned, conferred: [forced] });
  assert.strictEqual(teacher.source, 'assigned');
  assert.strictEqual(teacher.role.slug, 'eleve_avance');
});

test('pickEffectiveRole : entre deux groupes imposants, le plus élevé ; les profils gl_* sont ignorés', () => {
  const out = pickEffectiveRole({
    userType: 'student',
    assigned: null,
    conferred: [
      conferredBy('g1', r(1, 'visiteur', 50), true),
      conferredBy('g2', r(3, 'eleve_avance', 200), true),
      conferredBy('g3', r(7, 'gl_admin', 390), true),
    ],
  });
  assert.strictEqual(out.groupId, 'g2');
  assert.strictEqual(out.role.slug, 'eleve_avance');
  const onlyGl = pickEffectiveRole({
    userType: 'student',
    assigned: r(2, 'eleve_novice', 100),
    conferred: [conferredBy('g3', r(7, 'gl_admin', 390))],
  });
  assert.strictEqual(onlyGl.source, 'assigned');
});

// ---------------------------------------------------------------------------------------
// Recalcul persistant
// ---------------------------------------------------------------------------------------

test('compte sans profil : le défaut du type est posé comme profil attribué (élève → visiteur, enseignant → prof de classe)', async () => {
  const studentId = await createUser('default_student');
  const out = await recomputeUserRole(studentId);
  assert.strictEqual(out.changed, true);
  assert.strictEqual(out.roleSlug, 'visiteur');
  assert.strictEqual(out.source, 'assigned');
  assert.strictEqual(await effectiveSlug('student', studentId), 'visiteur');
  const row = await queryOne('SELECT assigned_role_id FROM users WHERE id = ?', [studentId]);
  assert.strictEqual(Number(row.assigned_role_id), Number((await roleBySlug('visiteur')).id));

  const teacherId = await createUser('default_teacher', 'teacher');
  const t = await recomputeUserRole(teacherId);
  assert.strictEqual(t.roleSlug, 'prof_classe');
  assert.strictEqual(await effectiveSlug('teacher', teacherId), 'prof_classe');
});

test('données antérieures : un profil principal sans profil attribué est adopté, pas remplacé par le défaut', async () => {
  const teacherId = await createUser('legacy_teacher', 'teacher');
  const prof = await roleBySlug('prof');
  await execute(
    "INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('teacher', ?, ?, 1)",
    [teacherId, prof.id],
  );
  const out = await recomputeUserRole(teacherId);
  assert.strictEqual(out.changed, false);
  assert.strictEqual(out.roleSlug, 'prof');
  const row = await queryOne('SELECT assigned_role_id FROM users WHERE id = ?', [teacherId]);
  assert.strictEqual(Number(row.assigned_role_id), Number(prof.id));
});

test('le recalcul est idempotent et ne réécrit pas le profil attribué', async () => {
  const studentId = await createUser('idempotent');
  await setAssignedRole(studentId, (await roleBySlug('eleve_novice')).id);
  const first = await recomputeUserRole(studentId);
  assert.strictEqual(first.changed, false);
  assert.strictEqual(first.roleSlug, 'eleve_novice');
  const row = await queryOne('SELECT assigned_role_id FROM users WHERE id = ?', [studentId]);
  assert.strictEqual(Number(row.assigned_role_id), Number((await roleBySlug('eleve_novice')).id));
});

test('un groupe confère un profil plus élevé que l’attribué ; le quitter le retire', async () => {
  const studentId = await createUser('conferred');
  await recomputeUserRole(studentId); // visiteur attribué
  const groupId = await createGroup({ defaultRoleSlug: 'eleve_avance' });
  await addMember(groupId, studentId);
  const out = await recomputeUserRole(studentId);
  assert.strictEqual(out.changed, true);
  assert.strictEqual(out.source, 'group');
  assert.strictEqual(out.groupId, groupId);
  assert.strictEqual(await effectiveSlug('student', studentId), 'eleve_avance');

  await execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
    groupId,
    studentId,
  ]);
  const back = await recomputeUserRole(studentId);
  assert.strictEqual(back.changed, true);
  assert.strictEqual(back.roleSlug, 'visiteur');
  assert.strictEqual(back.source, 'assigned');
});

test('un groupe ne rétrograde jamais un profil attribué plus élevé (sans imposition)', async () => {
  const studentId = await createUser('keeps_assigned');
  await setAssignedRole(studentId, (await roleBySlug('eleve_avance')).id);
  const groupId = await createGroup({ defaultRoleSlug: 'visiteur' });
  await addMember(groupId, studentId);
  const out = await recomputeUserRole(studentId);
  assert.strictEqual(out.changed, false);
  assert.strictEqual(out.source, 'assigned');
  assert.strictEqual(await effectiveSlug('student', studentId), 'eleve_avance');
});

test('un groupe inactif ne confère rien ; un groupe sans profil par défaut non plus', async () => {
  const studentId = await createUser('inactive_group');
  await recomputeUserRole(studentId);
  const inactive = await createGroup({ defaultRoleSlug: 'eleve_avance', isActive: false });
  const noRole = await createGroup({ defaultRoleSlug: null });
  await addMember(inactive, studentId);
  await addMember(noRole, studentId);
  const out = await recomputeUserRole(studentId);
  assert.strictEqual(out.roleSlug, 'visiteur');
  assert.strictEqual(out.source, 'assigned');
  const resolved = await resolveEffectiveRole(studentId);
  assert.strictEqual(resolved.conferred.length, 0);
});

test('groupe imposant : le profil du groupe s’applique même en baisse, et la progression est gelée', async () => {
  const studentId = await createUser('forced_down');
  await setAssignedRole(studentId, (await roleBySlug('eleve_avance')).id);
  const groupId = await createGroup({ defaultRoleSlug: 'eleve_novice', forceDefaultRole: true });
  await addMember(groupId, studentId);
  const out = await recomputeUserRole(studentId);
  assert.strictEqual(out.changed, true);
  assert.strictEqual(out.source, 'forced');
  assert.strictEqual(await effectiveSlug('student', studentId), 'eleve_novice');

  const progression = await syncStudentPrimaryRoleFromProgress(studentId, 999, null, {
    manual: true,
    allowDemotion: true,
  });
  assert.strictEqual(progression.changed, false);
  assert.strictEqual(progression.reason, 'group_forced_role');
  assert.strictEqual(progression.forcedByGroupId, groupId);

  // Le profil attribué reste intact : à la sortie du groupe, l'élève retrouve eleve_avance.
  await execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [
    groupId,
    studentId,
  ]);
  await recomputeUserRole(studentId);
  assert.strictEqual(await effectiveSlug('student', studentId), 'eleve_avance');
});

test('groupe imposant : ne concerne pas un enseignant membre du groupe', async () => {
  const teacherId = await createUser('forced_teacher', 'teacher');
  await recomputeUserRole(teacherId); // prof_classe
  const groupId = await createGroup({ defaultRoleSlug: 'visiteur', forceDefaultRole: true });
  await addMember(groupId, teacherId, 'teacher');
  const out = await recomputeUserRole(teacherId);
  assert.strictEqual(out.source, 'assigned');
  assert.strictEqual(await effectiveSlug('teacher', teacherId), 'prof_classe');
});

test('recomputeGroupMembersRoles : un changement de profil par défaut se propage aux membres', async () => {
  const a = await createUser('members_a');
  const b = await createUser('members_b');
  const groupId = await createGroup({ defaultRoleSlug: null });
  await addMember(groupId, a);
  await addMember(groupId, b);
  await recomputeGroupMembersRoles(groupId);
  assert.strictEqual(await effectiveSlug('student', a), 'visiteur');
  await execute('UPDATE `groups` SET default_role_id = ? WHERE id = ?', [
    (await roleBySlug('eleve_novice')).id,
    groupId,
  ]);
  const results = await recomputeGroupMembersRoles(groupId);
  assert.strictEqual(results.filter((x) => x.changed).length, 2);
  assert.strictEqual(await effectiveSlug('student', a), 'eleve_novice');
  assert.strictEqual(await effectiveSlug('student', b), 'eleve_novice');
});

test('progression automatique : relève le profil attribué, le groupe conféré reste comparé', async () => {
  const studentId = await createUser('progress');
  await setAssignedRole(studentId, (await roleBySlug('eleve_novice')).id);
  const groupId = await createGroup({ defaultRoleSlug: 'eleve_novice' });
  await addMember(groupId, studentId);
  await recomputeUserRole(studentId);
  const out = await syncStudentPrimaryRoleFromProgress(studentId, 999, null, { manual: true });
  assert.strictEqual(out.changed, true);
  assert.strictEqual(out.reason, 'promoted');
  assert.notStrictEqual(out.assignedRoleSlug, 'eleve_novice');
  const desc = await describeUserRoles(studentId);
  assert.strictEqual(desc.assigned.slug, out.assignedRoleSlug);
  assert.strictEqual(desc.effective.slug, out.assignedRoleSlug);
  assert.strictEqual(desc.effective.source, 'assigned');
  assert.strictEqual(desc.conferring.length, 1);
  assert.strictEqual(desc.conferring[0].groupId, groupId);
});

test('progression automatique : un profil attribué hors échelle (personnel) n’est jamais réécrit', async () => {
  const studentId = await createUser('staff_kept');
  await setAssignedRole(studentId, (await roleBySlug('personnel')).id);
  const out = await syncStudentPrimaryRoleFromProgress(studentId, 999, null, {
    manual: true,
    allowDemotion: true,
  });
  assert.strictEqual(out.changed, false);
  assert.ok(
    ['visitor_like_skipped', 'role_out_of_ladder', 'assigned_out_of_ladder'].includes(out.reason),
    out.reason,
  );
  assert.strictEqual(await effectiveSlug('student', studentId), 'personnel');
});

test('setAssignedRole(null) : le compte retombe sur le défaut de son type', async () => {
  const studentId = await createUser('unassign');
  await setAssignedRole(studentId, (await roleBySlug('eleve_avance')).id);
  const out = await setAssignedRole(studentId, null);
  assert.strictEqual(out.roleSlug, 'visiteur');
  assert.strictEqual(await effectiveSlug('student', studentId), 'visiteur');
});
