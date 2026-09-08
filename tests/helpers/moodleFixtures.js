'use strict';

/**
 * Fixtures communes des tests Moodle : faux serveur, réglages en mémoire (sans passer par
 * `app_settings`), comptes ForetMap de scénario, nettoyage des tables `external_*` / `sync_*`.
 */

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { execute, queryOne, queryAll } = require('../../database');
const { createFakeMoodleServer } = require('./fakeMoodleServer');
const { createMoodleClient } = require('../../lib/moodle/client');
const {
  DEFAULT_POLICIES,
  compilePolicies,
  normalizePolicies,
} = require('../../lib/moodle/policies');

const YEAR = '26';

function buildSettings(overrides = {}) {
  const yearPrefix = overrides.yearPrefix || YEAR;
  const policies = normalizePolicies(
    overrides.policies || DEFAULT_POLICIES.map((p) => ({ ...p })),
  ).policies;
  return {
    enabled: overrides.enabled !== undefined ? overrides.enabled : true,
    yearPrefix,
    emailDomains: overrides.emailDomains || [],
    policies,
    compiledPolicies: compilePolicies(policies, yearPrefix),
    chapterCourses: overrides.chapterCourses || {},
    thresholds: {
      createPct: 1000,
      deactivatePct: 100,
      deactivateAbs: 100000,
      namematchPct: 100,
      outboundRemoveAbs: 100000,
      ...(overrides.thresholds || {}),
    },
  };
}

async function startFakeMoodle(options = {}) {
  const fake = createFakeMoodleServer(options);
  await fake.start();
  const client = createMoodleClient({
    baseUrl: fake.baseUrl,
    token: fake.state.token,
    timeoutMs: 5000,
    retryDelaysMs: [0, 0],
  });
  return { fake, client };
}

/** Vide toutes les tables de synchronisation (les comptes / groupes créés par les tests restent). */
async function resetSyncTables() {
  for (const table of [
    'sync_actions',
    'sync_conflicts',
    'sync_pending_matches',
    'sync_runs',
    'external_group_members',
    'external_groups',
    'external_identities',
  ]) {
    await execute(`DELETE FROM ${table}`);
  }
}

/** Supprime les comptes élèves créés par la synchronisation (auth_provider = 'moodle') et leurs groupes. */
async function purgeSyncArtifacts() {
  await resetSyncTables();
  const groups = await queryAll("SELECT id FROM `groups` WHERE slug LIKE 'moodle-%'");
  for (const g of groups) {
    await execute('UPDATE gl_classes SET foretmap_group_id = NULL WHERE foretmap_group_id = ?', [
      g.id,
    ]);
    await execute('DELETE FROM `groups` WHERE id = ?', [g.id]);
  }
  const users = await queryAll("SELECT id FROM users WHERE auth_provider = 'moodle'");
  for (const u of users) {
    await execute('DELETE FROM gl_players WHERE linked_foretmap_user_id = ?', [u.id]);
    await execute("DELETE FROM user_roles WHERE user_type = 'student' AND user_id = ?", [u.id]);
    await execute('DELETE FROM users WHERE id = ?', [u.id]);
  }
}

async function createStudent({
  firstName,
  lastName,
  email = null,
  pseudo = null,
  password = 'test1234',
  authProvider = 'local',
  isActive = 1,
  syncExempt = 0,
}) {
  const id = crypto.randomUUID();
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const finalPseudo = pseudo || `${firstName}.${lastName}.${id.slice(0, 6)}`.toLowerCase();
  await execute(
    `INSERT INTO users
       (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, affiliation,
        password_hash, auth_provider, is_active, sync_exempt, created_at, updated_at)
     VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, 'both', ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      email,
      finalPseudo,
      firstName,
      lastName,
      `${firstName} ${lastName}`,
      hash,
      authProvider,
      isActive,
      syncExempt,
    ],
  );
  return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
}

async function createTeacher({ firstName, lastName, email }) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
       (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, affiliation,
        password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', NULL, ?, NULL, ?, ?, ?, 'both', NULL, 'local', 1, NOW(), NOW())`,
    [id, email, firstName, lastName, `${firstName} ${lastName}`],
  );
  return queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
}

async function createGroup({ name, slug = null, kind = 'class' }) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
    [id, slug || `test-${id.slice(0, 8)}`, name, kind],
  );
  return queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]);
}

async function addGroupMember(groupId, userId, userType = 'student') {
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group) VALUES (?, ?, ?, 'member')
     ON DUPLICATE KEY UPDATE role_in_group = 'member'`,
    [groupId, userId, userType],
  );
}

/** Peuple le faux Moodle avec une cohorte `26#603` (classe G&L) de `n` élèves inventés. */
function seedCohort(fake, { id, idnumber, name, members }) {
  fake.addCohort({ id, idnumber, name });
  for (const m of members) {
    fake.addUser(m);
    fake.enrolInCohort(id, m.id);
  }
}

function member(id, firstname, lastname, extra = {}) {
  return {
    id,
    username: `${firstname}.${lastname}`.toLowerCase(),
    firstname,
    lastname,
    email: `${firstname}.${lastname}@lyautey.test`.toLowerCase(),
    ...extra,
  };
}

module.exports = {
  YEAR,
  buildSettings,
  startFakeMoodle,
  resetSyncTables,
  purgeSyncArtifacts,
  createStudent,
  createTeacher,
  createGroup,
  addGroupMember,
  seedCohort,
  member,
};
