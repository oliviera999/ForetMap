require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const {
  initSchema,
  execute,
  getDataWriteVersion,
  getGroupScopeWriteVersion,
  noteExternalDataWrite,
  withTransaction,
} = require('../database');
const { getUserAccessibleGroupIds } = require('../lib/groupScope');

test.before(async () => {
  await initSchema();
});

function uniqueSlug(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createStudent(label) {
  const id = crypto.randomUUID();
  const unique = uniqueSlug(label);
  await execute(
    `INSERT INTO users
      (id, user_type, email, pseudo, first_name, last_name, display_name, affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, ?, ?, ?, 'both', NULL, 'local', 1, NOW(), NOW())`,
    [id, `${unique}@example.com`, `sync_${unique}`, 'Test', label, `Test ${label}`],
  );
  return id;
}

async function createGroup(slug) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', 1, NOW(), NOW())`,
    [id, slug, slug],
  );
  return id;
}

test('GET /api/sync-state expose bootId + compteur, et le compteur suit les écritures', async () => {
  const first = await request(app).get('/api/sync-state').expect(200);
  assert.ok(typeof first.body.bootId === 'string' && first.body.bootId.length > 0);
  assert.ok(Number.isFinite(first.body.writes));

  // Lecture pure : le compteur ne bouge pas.
  const second = await request(app).get('/api/sync-state').expect(200);
  assert.strictEqual(second.body.bootId, first.body.bootId);
  assert.strictEqual(second.body.writes, first.body.writes);

  // Écriture via execute() : le compteur avance.
  await createStudent('SyncProbe');
  const third = await request(app).get('/api/sync-state').expect(200);
  assert.ok(third.body.writes > second.body.writes);
});

test('les écritures en transaction et hors helpers avancent aussi le compteur', async () => {
  const before = getDataWriteVersion();
  await withTransaction(async (tx) => {
    await tx.execute(`UPDATE users SET updated_at = NOW() WHERE user_type = 'student' LIMIT 1`);
  });
  const afterTx = getDataWriteVersion();
  assert.ok(afterTx > before, 'withTransaction doit bumper post-commit');

  noteExternalDataWrite();
  assert.ok(getDataWriteVersion() > afterTx, 'noteExternalDataWrite doit bumper');
});

test('le cache du scope groupes sert les répétitions et se périme sur écriture groupes', async () => {
  const userId = await createStudent('ScopeCache');
  const groupA = await createGroup(uniqueSlug('scope_a'));
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
    [groupA, userId],
  );

  const auth = { userId };
  const firstRead = await getUserAccessibleGroupIds(auth);
  assert.deepStrictEqual(firstRead, [groupA]);

  // Répétition sans écriture : mêmes ids (servis par le cache versionné), et le
  // tableau retourné est une copie — le muter ne corrompt pas le cache.
  const cachedRead = await getUserAccessibleGroupIds(auth);
  assert.deepStrictEqual(cachedRead, [groupA]);
  cachedRead.push('corruption-tentee');
  assert.deepStrictEqual(await getUserAccessibleGroupIds(auth), [groupA]);

  // Nouvelle appartenance : l'écriture sur group_members périme le cache.
  const groupB = await createGroup(uniqueSlug('scope_b'));
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
    [groupB, userId],
  );
  const afterWrite = await getUserAccessibleGroupIds(auth);
  assert.deepStrictEqual([...afterWrite].sort(), [groupA, groupB].sort());
});

test('la version scope groupes ne bouge pas sur une écriture sans rapport', async () => {
  const before = getGroupScopeWriteVersion();
  await execute(`UPDATE users SET updated_at = NOW() WHERE user_type = 'student' LIMIT 1`);
  assert.strictEqual(getGroupScopeWriteVersion(), before);
  assert.ok(getDataWriteVersion() > 0);
});
