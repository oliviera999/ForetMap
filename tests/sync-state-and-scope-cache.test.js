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

const SYNC_DOMAINS = ['maps', 'zones', 'tasks', 'plants', 'markers', 'tutorials', 'authMe'];

test('GET /api/sync-state expose bootId + compteur, et le compteur suit les écritures', async () => {
  const first = await request(app).get('/api/sync-state').expect(200);
  assert.ok(typeof first.body.bootId === 'string' && first.body.bootId.length > 0);
  assert.ok(Number.isFinite(first.body.writes));
  for (const domain of SYNC_DOMAINS) {
    assert.ok(Number.isFinite(first.body.domains?.[domain]), `domaine ${domain} attendu`);
  }

  // Lecture pure : le compteur ne bouge pas.
  const second = await request(app).get('/api/sync-state').expect(200);
  assert.strictEqual(second.body.bootId, first.body.bootId);
  assert.strictEqual(second.body.writes, first.body.writes);
  assert.deepStrictEqual(second.body.domains, first.body.domains);

  // Écriture via execute() : le compteur avance.
  await createStudent('SyncProbe');
  const third = await request(app).get('/api/sync-state').expect(200);
  assert.ok(third.body.writes > second.body.writes);
});

test('les compteurs par domaine ciblent les tables concernées', async () => {
  const before = (await request(app).get('/api/sync-state').expect(200)).body.domains;

  // Écriture plants : seul le domaine plants bouge (tasks/zones/markers inchangés).
  await execute(`DELETE FROM plants WHERE 1 = 0`);
  const afterPlants = (await request(app).get('/api/sync-state').expect(200)).body.domains;
  assert.ok(afterPlants.plants > before.plants, 'plants doit bumper');
  assert.strictEqual(afterPlants.tasks, before.tasks);
  assert.strictEqual(afterPlants.zones, before.zones);
  assert.strictEqual(afterPlants.markers, before.markers);

  // Famille sans rapport avec fetchAll (forum) : aucun domaine ne bouge, le global si.
  const globalBefore = getDataWriteVersion();
  await execute(`DELETE FROM forum_posts WHERE 1 = 0`);
  const afterForum = (await request(app).get('/api/sync-state').expect(200)).body.domains;
  assert.deepStrictEqual(afterForum, afterPlants);
  assert.ok(getDataWriteVersion() > globalBefore, 'le compteur global doit bumper');

  // Table hors mapping (app_settings) : repli conservateur, tous les domaines bumpent.
  await execute(`DELETE FROM app_settings WHERE 1 = 0`);
  const afterUnknown = (await request(app).get('/api/sync-state').expect(200)).body.domains;
  for (const domain of SYNC_DOMAINS) {
    assert.ok(afterUnknown[domain] > afterForum[domain], `${domain} doit bumper (repli)`);
  }
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
