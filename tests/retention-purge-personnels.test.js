'use strict';

/**
 * Purge planifiée — catégorie `personnels` : comptes des personnels conservés jusqu'au départ
 * (désactivation) + 1 an.
 *   - départ déclaré depuis plus de 12 mois et aucune activité depuis 12 mois → supprimé par le
 *     chemin de la route d'administration (`deleteTeacherById`) ;
 *   - jamais un administrateur, jamais le dernier administrateur, jamais un compte lié à un
 *     maître du jeu ; un enseignant simplement inactif est « à revoir », pas supprimé ;
 *   - simulation sans effet, sortie sans donnée nominative.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initSchema, queryAll, queryOne, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { dbFingerprint } = require('./helpers/dbFingerprint');
const {
  STAMP,
  createDatedAccount,
  grantRole,
  userExists,
  captureLog,
  leakedPersonalData,
} = require('./helpers/retentionFixtures');
const { UPLOADS_DIR, getAbsolutePath } = require('../lib/uploads');

const APPLY_ENV = { RETENTION_PURGE_APPLY: '1' };
const SCRATCH = `_test-retention-${STAMP}`;

test.before(async () => {
  await initSchema();
  await ensureAdminTeacherAuthToken();
});

test.after(() => {
  fs.rmSync(path.join(UPLOADS_DIR, SCRATCH), { recursive: true, force: true });
});

async function staff(options) {
  const account = await createDatedAccount({ userType: 'teacher', ...options });
  await grantRole(account.id, 'teacher', options.role || 'prof');
  return account;
}

async function staffCounts() {
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  const r = await runRetentionPurge({ argv: ['--only=personnels'], env: {}, log: () => {} });
  return r.counts.personnels;
}

test('dernier administrateur : jamais supprimé ; la purge refuse tout administrateur', async () => {
  const { deleteTeacherById } = require('../lib/teacherDeletion');
  const lastAdmin = await staff({ label: 'DernierAdmin', role: 'admin', lastSeenDaysAgo: 2 });
  const others = await queryAll(
    `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = 1 AND ur.user_type = 'teacher'
       JOIN roles r ON r.id = ur.role_id AND r.slug = 'admin'
      WHERE u.is_active = 1 AND u.id <> ?`,
    [lastAdmin.id],
  );
  const otherIds = others.map((r) => r.id);
  try {
    if (otherIds.length) {
      await execute(
        `UPDATE users SET is_active = 0 WHERE id IN (${otherIds.map(() => '?').join(', ')})`,
        otherIds,
      );
    }
    assert.deepEqual(await deleteTeacherById(lastAdmin.id), { ok: false, reason: 'last_admin' });
    assert.deepEqual(await deleteTeacherById(lastAdmin.id, { allowAdmin: false }), {
      ok: false,
      reason: 'admin',
    });
    assert.equal(await userExists(lastAdmin.id), true);
  } finally {
    if (otherIds.length) {
      await execute(
        `UPDATE users SET is_active = 1 WHERE id IN (${otherIds.map(() => '?').join(', ')})`,
        otherIds,
      );
    }
  }
  // Avec d'autres administrateurs actifs, la route peut le supprimer ; la purge, jamais.
  assert.deepEqual(await deleteTeacherById(lastAdmin.id, { allowAdmin: false }), {
    ok: false,
    reason: 'admin',
  });
  assert.equal((await deleteTeacherById(lastAdmin.id)).ok, true);
});

test('personnels : simulation sans effet, puis suppression un an après le départ', async () => {
  const { runRetentionPurge } = require('../lib/retention/retentionPurge');
  const baseline = await staffCounts();

  const avatarRel = `${SCRATCH}/avatar-parti.webp`;
  fs.mkdirSync(path.dirname(getAbsolutePath(avatarRel)), { recursive: true });
  fs.writeFileSync(getAbsolutePath(avatarRel), 'x');
  const departed = await staff({
    label: 'ProfParti',
    isActive: 0,
    deactivatedDaysAgo: 400,
    lastSeenDaysAgo: 420,
    avatarPath: avatarRel,
  });
  const recentlyLeft = await staff({
    label: 'ProfPartiRecent',
    isActive: 0,
    deactivatedDaysAgo: 100,
    lastSeenDaysAgo: 420,
  });
  const idle = await staff({ label: 'ProfInactif', lastSeenDaysAgo: 800 });
  const oldAdmin = await staff({
    label: 'AdminParti',
    role: 'admin',
    isActive: 0,
    deactivatedDaysAgo: 400,
    lastSeenDaysAgo: 420,
  });
  const gameMaster = await staff({
    label: 'ProfMJ',
    isActive: 0,
    deactivatedDaysAgo: 400,
    lastSeenDaysAgo: 420,
  });
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, foretmap_user_id, created_at, updated_at)
     VALUES (?, 'MJ', 'admin', 1, ?, NOW(), NOW())`,
    [`mj.${STAMP}@ecole.local`, gameMaster.id],
  );
  const lateActivity = await staff({
    label: 'ProfRevenu',
    isActive: 0,
    deactivatedDaysAgo: 400,
    lastSeenDaysAgo: 30,
  });
  await execute(
    `INSERT INTO security_events (occurred_at, actor_user_id, actor_user_type, action, ip_address, user_agent)
     VALUES (NOW() - INTERVAL 20 DAY, ?, 'teacher', 'login', '198.51.100.77', 'Nav/2')`,
    [departed.id],
  );

  const all = [departed, recentlyLeft, idle, oldAdmin, gameMaster, lateActivity];
  const ids = all.map((a) => a.id);
  const ph = ids.map(() => '?').join(', ');
  const tables = {
    users: {
      sql: `SELECT id, is_active, deactivated_at, last_seen, updated_at FROM users WHERE id IN (${ph}) ORDER BY id`,
      params: ids,
    },
    roles: {
      sql: `SELECT user_id, role_id FROM user_roles WHERE user_id IN (${ph}) ORDER BY user_id`,
      params: ids,
    },
    events: {
      sql: "SELECT ip_address, user_agent FROM security_events WHERE ip_address = '198.51.100.77'",
      params: [],
    },
  };
  const before = await dbFingerprint(tables);

  const out = captureLog();
  const sim = await runRetentionPurge({
    argv: ['--apply', '--only=personnels'],
    env: {},
    log: out.log,
  });
  assert.equal(sim.exitCode, 0);
  assert.equal(sim.mode, 'simulation', '--apply sans la variable : simulation');
  assert.deepEqual(await dbFingerprint(tables), before, 'simulation : aucune modification');
  assert.equal(sim.counts.personnels.candidats, baseline.candidats + 2, 'parti, maître du jeu');
  assert.equal(sim.counts.personnels.a_revoir, baseline.a_revoir + 1, 'inactif non désactivé');
  assert.deepEqual(leakedPersonalData(out.text(), all), [], 'aucune donnée nominative');
  assert.ok(fs.existsSync(getAbsolutePath(avatarRel)));

  const realOut = captureLog();
  const real = await runRetentionPurge({
    argv: ['--apply', '--only=personnels', '--max-accounts=100000'],
    env: APPLY_ENV,
    log: realOut.log,
  });
  assert.equal(real.exitCode, 0, realOut.text());
  assert.equal(await userExists(departed.id), false, 'départ + 1 an : supprimé');
  for (const kept of [recentlyLeft, idle, oldAdmin, gameMaster, lateActivity]) {
    assert.equal(await userExists(kept.id), true, `${kept.firstName.slice(0, 14)} conservé`);
  }
  assert.ok(real.counts.personnels.conserves.compte_mj_jeu >= 1);
  assert.deepEqual(leakedPersonalData(realOut.text(), all), []);

  // Effacement de la route : avatar, IP et navigateur effacés, audit par identifiant.
  assert.equal(fs.existsSync(getAbsolutePath(avatarRel)), false, 'avatar supprimé du disque');
  assert.deepEqual(
    await queryAll("SELECT id FROM security_events WHERE ip_address = '198.51.100.77'"),
    [],
  );
  const audit = await queryOne(
    "SELECT target_type, details FROM audit_log WHERE action = 'retention_purge_account' AND target_id = ?",
    [departed.id],
  );
  assert.deepEqual({ ...audit }, { target_type: 'user', details: departed.id });
});
