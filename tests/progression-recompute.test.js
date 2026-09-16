require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initSchema, queryOne, execute } = require('../database');
const { syncStudentRoleFromGroups } = require('../lib/groupRole');
const { getPrimaryRoleForUser } = require('../lib/rbac');
const { recomputeStudentProfilesFromValidatedTasks } = require('../lib/studentProgressionSync');
const { setSetting } = require('../lib/settings');
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
    [id, `${unique}@example.com`, `prg_${unique}`, 'Test', label, `Test ${label}`],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     SELECT 'student', ?, id, 1 FROM roles WHERE slug = 'visiteur' LIMIT 1`,
    [id],
  );
  return id;
}

async function createN3beurGroup(label) {
  const id = crypto.randomUUID();
  const slug = `prg-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, grants_n3beur_access, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', NULL, 1, 1, NOW(), NOW())`,
    [id, slug, slug],
  );
  return id;
}

async function joinGroup(groupId, studentId) {
  await execute(
    `INSERT IGNORE INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')`,
    [groupId, studentId],
  );
}

/** Crée `count` tâches validées assignées à l'élève (compteur de progression). */
async function giveValidatedTasks(studentId, count) {
  for (let i = 0; i < count; i += 1) {
    const taskId = crypto.randomUUID();
    await execute(
      `INSERT INTO tasks (id, title, description, map_id, required_students, status, created_at)
       VALUES (?, ?, '', 'foret', 1, 'validated', NOW())`,
      [taskId, `Tâche progression ${i}`],
    );
    await execute(
      `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [taskId, studentId, 'Test', `prg_${String(studentId).slice(0, 8)}`],
    );
  }
}

async function primarySlug(studentId) {
  const role = await getPrimaryRoleForUser('student', studentId);
  return String(role?.slug || '');
}

test('rattachement à un groupe n3beur : le palier suit les tâches déjà validées', async () => {
  const studentId = await createStudent('join_with_history');
  await giveValidatedTasks(studentId, 12);
  const groupId = await createN3beurGroup('join');
  await joinGroup(groupId, studentId);

  const sync = await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(sync.changed, true);
  // 12 tâches validées ≥ seuil chevronné (10) : le profil par défaut du groupe (novice)
  // n'est qu'un plancher.
  assert.strictEqual(await primarySlug(studentId), 'eleve_chevronne');
});

test('rattachement d’un visiteur sans tâche : palier d’entrée de l’échelle', async () => {
  const studentId = await createStudent('join_fresh');
  const groupId = await createN3beurGroup('fresh');
  await joinGroup(groupId, studentId);

  await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(await primarySlug(studentId), 'eleve_novice');
});

test('rattachement : un palier attribué à la main au-dessus du compteur n’est pas perdu', async () => {
  const studentId = await createStudent('join_keep_manual');
  const groupId = await createN3beurGroup('keepmanual');
  await joinGroup(groupId, studentId);
  const chevronne = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_chevronne' LIMIT 1");
  await execute(
    "UPDATE user_roles SET is_primary = 0 WHERE user_type = 'student' AND user_id = ?",
    [studentId],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE is_primary = 1`,
    [studentId, chevronne.id],
  );

  await syncStudentRoleFromGroups(studentId);
  assert.strictEqual(await primarySlug(studentId), 'eleve_chevronne');
});

test('réglage désactivé : le rattachement applique seulement le profil par défaut du groupe', async () => {
  await setSetting('rbac.progression_align_on_group_join', false, {});
  try {
    const studentId = await createStudent('join_setting_off');
    await giveValidatedTasks(studentId, 12);
    const groupId = await createN3beurGroup('settingoff');
    await joinGroup(groupId, studentId);

    await syncStudentRoleFromGroups(studentId);
    assert.strictEqual(await primarySlug(studentId), 'eleve_novice');
  } finally {
    await setSetting('rbac.progression_align_on_group_join', true, {});
  }
});

test('recalcul individuel : aligne le profil sur les tâches validées', async () => {
  const studentId = await createStudent('recompute_one');
  const groupId = await createN3beurGroup('one');
  await joinGroup(groupId, studentId);
  await syncStudentRoleFromGroups(studentId);
  await giveValidatedTasks(studentId, 7);

  const result = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'user',
    userId: studentId,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.scanned, 1);
  assert.strictEqual(result.changed, 1);
  assert.strictEqual(result.results[0].done, 7);
  assert.strictEqual(result.results[0].roleSlug, 'eleve_avance');
  assert.strictEqual(await primarySlug(studentId), 'eleve_avance');
});

test('aperçu (dry run) : n’écrit rien', async () => {
  const studentId = await createStudent('recompute_dry');
  const groupId = await createN3beurGroup('dry');
  await joinGroup(groupId, studentId);
  await syncStudentRoleFromGroups(studentId);
  await giveValidatedTasks(studentId, 11);

  const preview = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'user',
    userId: studentId,
    dryRun: true,
  });
  assert.strictEqual(preview.changed, 1);
  assert.strictEqual(preview.results[0].roleSlug, 'eleve_chevronne');
  assert.strictEqual(preview.dryRun, true);
  assert.strictEqual(await primarySlug(studentId), 'eleve_novice');
});

test('recalcul en masse par groupe : chacun reçoit son palier', async () => {
  const groupId = await createN3beurGroup('bulk');
  const rookie = await createStudent('bulk_rookie');
  const veteran = await createStudent('bulk_veteran');
  await joinGroup(groupId, rookie);
  await joinGroup(groupId, veteran);
  await syncStudentRoleFromGroups(rookie);
  await syncStudentRoleFromGroups(veteran);
  await giveValidatedTasks(veteran, 60);

  const result = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'group',
    groupId,
  });
  assert.strictEqual(result.scanned, 2);
  assert.strictEqual(result.changed, 1);
  assert.strictEqual(await primarySlug(rookie), 'eleve_novice');
  assert.strictEqual(await primarySlug(veteran), 'eleve_chevronne');
});

test('montée seule par défaut, rétrogradation avec allowDemotion', async () => {
  const studentId = await createStudent('recompute_demote');
  const groupId = await createN3beurGroup('demote');
  await joinGroup(groupId, studentId);
  const chevronne = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_chevronne' LIMIT 1");
  await execute(
    "UPDATE user_roles SET is_primary = 0 WHERE user_type = 'student' AND user_id = ?",
    [studentId],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE is_primary = 1`,
    [studentId, chevronne.id],
  );

  const keep = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'user',
    userId: studentId,
  });
  assert.strictEqual(keep.changed, 0);
  assert.strictEqual(keep.results[0].reason, 'demotion_not_allowed');
  assert.strictEqual(await primarySlug(studentId), 'eleve_chevronne');

  const strict = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'user',
    userId: studentId,
    allowDemotion: true,
  });
  assert.strictEqual(strict.changed, 1);
  assert.strictEqual(await primarySlug(studentId), 'eleve_novice');
});

test('compte hors groupe n3beur : hors périmètre, profil inchangé', async () => {
  const studentId = await createStudent('recompute_outside');
  await giveValidatedTasks(studentId, 30);

  const result = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'user',
    userId: studentId,
  });
  assert.strictEqual(result.changed, 0);
  assert.strictEqual(result.results[0].reason, 'not_n3beur_member');
  assert.strictEqual(await primarySlug(studentId), 'visiteur');
});

test('profil hors échelle n3beur jamais modifié par le recalcul', async () => {
  const studentId = await createStudent('recompute_staff');
  const groupId = await createN3beurGroup('staff');
  await joinGroup(groupId, studentId);
  await giveValidatedTasks(studentId, 40);
  const prof = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  await execute(
    "UPDATE user_roles SET is_primary = 0 WHERE user_type = 'student' AND user_id = ?",
    [studentId],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE is_primary = 1`,
    [studentId, prof.id],
  );

  const result = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'user',
    userId: studentId,
    allowDemotion: true,
  });
  assert.strictEqual(result.changed, 0);
  assert.strictEqual(result.results[0].reason, 'role_out_of_ladder');
  assert.strictEqual(await primarySlug(studentId), 'prof');
});

test('périmètre invalide et identifiants manquants sont refusés', async () => {
  const badScope = await recomputeStudentProfilesFromValidatedTasks({ scope: 'wat' });
  assert.strictEqual(badScope.ok, false);
  assert.strictEqual(badScope.status, 400);

  const noGroup = await recomputeStudentProfilesFromValidatedTasks({ scope: 'group' });
  assert.strictEqual(noGroup.status, 400);

  const unknownGroup = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'group',
    groupId: crypto.randomUUID(),
  });
  assert.strictEqual(unknownGroup.status, 404);

  const unknownUser = await recomputeStudentProfilesFromValidatedTasks({
    scope: 'user',
    userId: crypto.randomUUID(),
  });
  assert.strictEqual(unknownUser.status, 404);
});
