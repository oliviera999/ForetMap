require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, queryOne, execute } = require('../database');
const {
  isN3beurGroup,
  resolveDefaultRoleForStudent,
  syncStudentRoleFromGroups,
} = require('../lib/groupRole');
const {
  getForcedRoleGroupForStudent,
  getAllowedGroupDefaultRole,
} = require('../lib/groupDefaultRole');
const { getPrimaryRoleForUser, syncStudentPrimaryRoleFromProgress } = require('../lib/rbac');
const { restoreDefaultProgressionThresholds } = require('./helpers/progressionThresholds');

test.before(async () => {
  await initSchema();
  // Seuils de paliers remis à l'état de référence : d'autres fichiers de la suite les
  // déplacent sur la base partagée (cf. helpers/progressionThresholds.js).
  await restoreDefaultProgressionThresholds();
});

async function createStudent(label) {
  const id = crypto.randomUUID();
  const unique = `${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await execute(
    `INSERT INTO users
      (id, user_type, email, pseudo, first_name, last_name, display_name, affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, ?, ?, 'both', NULL, 'local', 1, NOW(), NOW())`,
    [id, `${unique}@example.com`, `grp_${unique}`, 'Test', label, `Test ${label}`],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     SELECT 'student', ?, id, 1 FROM roles WHERE slug = 'visiteur' LIMIT 1`,
    [id],
  );
  return id;
}

async function createGroup({
  slug,
  grantsN3beur = false,
  defaultRoleSlug = null,
  forceDefaultRole = false,
}) {
  const id = crypto.randomUUID();
  let defaultRoleId = null;
  if (defaultRoleSlug) {
    const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [defaultRoleSlug]);
    defaultRoleId = role?.id ?? null;
  }
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, grants_n3beur_access, force_default_role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, ?, ?, 1, NOW(), NOW())`,
    [id, slug, slug, defaultRoleId, grantsN3beur ? 1 : 0, forceDefaultRole ? 1 : 0],
  );
  return id;
}

async function addMember(groupId, studentId) {
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );
}

async function setPrimaryRoleSlug(studentId, slug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(role?.id, `profil ${slug} absent`);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'student',
    studentId,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', studentId, role.id],
  );
}

test('isN3beurGroup via flag ou profil eleve_*', () => {
  assert.strictEqual(isN3beurGroup({ grants_n3beur_access: 1 }), true);
  assert.strictEqual(isN3beurGroup({ default_role_slug: 'eleve_novice' }), true);
  assert.strictEqual(isN3beurGroup({ default_role_slug: 'visiteur' }), false);
});

test('élève sans groupe n3beur reste visiteur après sync', async () => {
  const studentId = await createStudent('visitor_only');
  const resolved = await resolveDefaultRoleForStudent(studentId);
  assert.strictEqual(resolved.roleSlug, 'visiteur');
  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, false);
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'visiteur');
});

test('membre groupe n3beur reçoit eleve_novice par défaut', async () => {
  const studentId = await createStudent('n3_member');
  const groupId = await createGroup({
    slug: `n3-${Date.now()}`,
    grantsN3beur: true,
  });
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );
  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, true);
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'eleve_novice');
});

test('profil par défaut du groupe est appliqué en force', async () => {
  const studentId = await createStudent('forced_role');
  const groupId = await createGroup({
    slug: `forced-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'eleve_avance',
  });
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );
  const sync = await syncStudentRoleFromGroups(studentId, { force: true, groupId });
  assert.strictEqual(sync.changed, true);
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'eleve_avance');
});

test('profil élève n’est pas rétrogradé en visiteur sans force', async () => {
  const studentId = await createStudent('keep_novice');
  const novice = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(novice?.id);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'student',
    studentId,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', studentId, novice.id],
  );
  const groupId = await createGroup({
    slug: `no-n3-${Date.now()}`,
    grantsN3beur: false,
  });
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );
  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, false);
  assert.strictEqual(sync.reason, 'eleve_preserved_over_visitor');
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'eleve_novice');
});

test('profil par défaut dangereux ignoré lors de la synchronisation de groupe', async () => {
  const studentId = await createStudent('unsafe_default');
  const groupId = await createGroup({
    slug: `unsafe-default-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'admin',
  });
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );

  const sync = await syncStudentRoleFromGroups(studentId, { force: true, groupId });
  assert.strictEqual(sync.changed, true);
  const primary = await getPrimaryRoleForUser('student', studentId);
  assert.strictEqual(primary.slug, 'eleve_novice');
});

// --- Profil de groupe imposé (`force_default_role`, migration 265) -----------------------

test('groupe imposant : le profil du groupe s’applique même en baisse', async () => {
  const studentId = await createStudent('forced_down');
  await setPrimaryRoleSlug(studentId, 'eleve_chevronne');
  const groupId = await createGroup({
    slug: `force-down-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'eleve_novice',
    forceDefaultRole: true,
  });
  await addMember(groupId, studentId);

  const resolved = await resolveDefaultRoleForStudent(studentId);
  assert.strictEqual(resolved.roleSlug, 'eleve_novice');
  assert.strictEqual(resolved.source, 'group_forced');
  assert.strictEqual(resolved.forced, true);

  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, true);
  assert.strictEqual(sync.forced, true);
  // Sans forçage, `progression_preserved` aurait conservé le palier chevronné.
  assert.strictEqual((await getPrimaryRoleForUser('student', studentId)).slug, 'eleve_novice');
});

test('groupe imposant « visiteur » : un palier n3beur acquis est bien retiré', async () => {
  const studentId = await createStudent('forced_visitor');
  await setPrimaryRoleSlug(studentId, 'eleve_avance');
  const groupId = await createGroup({
    slug: `force-visitor-${Date.now()}`,
    defaultRoleSlug: 'visiteur',
    forceDefaultRole: true,
  });
  await addMember(groupId, studentId);

  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, true);
  // Sans forçage : `eleve_preserved_over_visitor`.
  assert.strictEqual((await getPrimaryRoleForUser('student', studentId)).slug, 'visiteur');
});

test('groupe imposant : la montée automatique par tâches validées ne s’applique plus', async () => {
  const studentId = await createStudent('forced_no_progression');
  const groupId = await createGroup({
    slug: `force-freeze-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'eleve_novice',
    forceDefaultRole: true,
  });
  await addMember(groupId, studentId);
  await syncStudentRoleFromGroups(studentId);

  const progression = await syncStudentPrimaryRoleFromProgress(studentId, 999, null, {
    manual: true,
    allowDemotion: true,
  });
  assert.strictEqual(progression.changed, false);
  assert.strictEqual(progression.reason, 'group_forced_role');
  assert.strictEqual(progression.forcedByGroupId, groupId);
  assert.strictEqual((await getPrimaryRoleForUser('student', studentId)).slug, 'eleve_novice');
});

test('groupe imposant : un profil hors échelle n3beur reste intact', async () => {
  const studentId = await createStudent('forced_keeps_staff');
  await setPrimaryRoleSlug(studentId, 'prof_classe');
  const groupId = await createGroup({
    slug: `force-staff-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'eleve_novice',
    forceDefaultRole: true,
  });
  await addMember(groupId, studentId);

  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, false);
  assert.strictEqual(sync.reason, 'custom_role_preserved');
  assert.strictEqual((await getPrimaryRoleForUser('student', studentId)).slug, 'prof_classe');
});

test('groupe imposant sans profil par défaut : aucun forçage', async () => {
  const studentId = await createStudent('forced_without_role');
  const groupId = await createGroup({
    slug: `force-norole-${Date.now()}`,
    grantsN3beur: true,
    forceDefaultRole: true,
  });
  await addMember(groupId, studentId);

  assert.strictEqual(await getForcedRoleGroupForStudent(studentId), null);
  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.forced, false);
  assert.strictEqual((await getPrimaryRoleForUser('student', studentId)).slug, 'eleve_novice');
});

test('groupe imposant un profil dangereux : forçage ignoré', async () => {
  const studentId = await createStudent('forced_unsafe');
  const groupId = await createGroup({
    slug: `force-unsafe-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'admin',
    forceDefaultRole: true,
  });
  await addMember(groupId, studentId);

  assert.strictEqual(await getForcedRoleGroupForStudent(studentId), null);
  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.forced, false);
  assert.strictEqual((await getPrimaryRoleForUser('student', studentId)).slug, 'eleve_novice');
});

test('deux groupes imposants : le profil le plus élevé l’emporte', async () => {
  const studentId = await createStudent('forced_two_groups');
  const low = await createGroup({
    slug: `force-low-${Date.now()}`,
    defaultRoleSlug: 'visiteur',
    forceDefaultRole: true,
  });
  const high = await createGroup({
    slug: `force-high-${Date.now()}`,
    grantsN3beur: true,
    defaultRoleSlug: 'eleve_avance',
    forceDefaultRole: true,
  });
  await addMember(low, studentId);
  await addMember(high, studentId);

  const forced = await getForcedRoleGroupForStudent(studentId);
  assert.strictEqual(forced.groupId, high);
  await syncStudentRoleFromGroups(studentId);
  assert.strictEqual((await getPrimaryRoleForUser('student', studentId)).slug, 'eleve_avance');
});

test('syncStudentRoleFromGroups : un compte « personnel » n’est pas rétrogradé en visiteur', async () => {
  const studentId = await createStudent('PersonnelStay');
  await setPrimaryRoleSlug(studentId, 'personnel');
  const groupId = await createGroup({ slug: `personnel-stay-${Date.now()}` });
  await addMember(groupId, studentId);

  const result = await syncStudentRoleFromGroups(studentId);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'visitor_like_preserved');
  const role = await getPrimaryRoleForUser('student', studentId);
  assert.equal(role.slug, 'personnel');
});

test('syncStudentRoleFromGroups : « personnel » monte quand même dans un groupe n3beur', async () => {
  const studentId = await createStudent('PersonnelPromo');
  await setPrimaryRoleSlug(studentId, 'personnel');
  const groupId = await createGroup({ slug: `personnel-promo-${Date.now()}`, grantsN3beur: true });
  await addMember(groupId, studentId);

  await syncStudentRoleFromGroups(studentId);
  const role = await getPrimaryRoleForUser('student', studentId);
  assert.ok(role.slug.startsWith('eleve_'), `attendu un palier n3beur, obtenu ${role.slug}`);
});

test('syncStudentRoleFromGroups : un groupe imposant « visiteur » l’emporte sur « personnel »', async () => {
  const studentId = await createStudent('PersonnelForced');
  await setPrimaryRoleSlug(studentId, 'personnel');
  const groupId = await createGroup({
    slug: `personnel-forced-${Date.now()}`,
    defaultRoleSlug: 'visiteur',
    forceDefaultRole: true,
  });
  await addMember(groupId, studentId);

  const result = await syncStudentRoleFromGroups(studentId);
  assert.equal(result.changed, true);
  assert.equal((await getPrimaryRoleForUser('student', studentId)).slug, 'visiteur');
});

test('syncStudentRoleFromGroups : le geste explicite (force) applique quand même le profil', async () => {
  const studentId = await createStudent('PersonnelForceBtn');
  await setPrimaryRoleSlug(studentId, 'personnel');
  const groupId = await createGroup({
    slug: `personnel-forcebtn-${Date.now()}`,
    defaultRoleSlug: 'visiteur',
  });
  await addMember(groupId, studentId);

  await syncStudentRoleFromGroups(studentId, { force: true, groupId });
  assert.equal((await getPrimaryRoleForUser('student', studentId)).slug, 'visiteur');
});

test('un groupe peut conférer le profil « personnel » (staff_plan.access reste sûr)', async () => {
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'personnel' LIMIT 1");
  const allowed = await getAllowedGroupDefaultRole(role.id);
  assert.ok(allowed, 'le profil Personnel doit être attribuable comme profil par défaut');
  assert.equal(allowed.slug, 'personnel');

  // Un profil d'encadrement reste exclu.
  const profClasse = await queryOne("SELECT id FROM roles WHERE slug = 'prof_classe' LIMIT 1");
  assert.equal(await getAllowedGroupDefaultRole(profClasse.id), null);
});
