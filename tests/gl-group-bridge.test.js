require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initSchema, queryOne, execute } = require('../database');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');
const {
  ensureForetmapGroupForGlClass,
  syncForetmapUserForGlPlayer,
  backfillGlPlayersForetmapLinks,
} = require('../lib/glGroupBridge');

test.before(async () => {
  await initSchema();
});

async function createForetmapStudent({ pseudo, email, password }) {
  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, ?, ?, 'Foret', 'Map', 'Foret Map', 'both', ?, 'local', 1, NOW(), NOW())`,
    [id, email, pseudo, hash],
  );
  return { id, hash };
}

test('syncForetmapUserForGlPlayer lie un joueur GL existant au groupe ForetMap de sa classe', async () => {
  const admin = await createGlAdmin();
  const glClass = await createGlClass({ adminId: admin.id, name: `Pont FM ${Date.now()}` });
  const group = await ensureForetmapGroupForGlClass(glClass);
  assert.ok(group?.id);

  const pseudo = `glbridge_${Date.now()}`;
  const passwordHash = await bcrypt.hash('1234', 10);
  const player = await createGlPlayer({
    classId: glClass.id,
    pseudo,
    firstName: 'Alice',
    lastName: 'Pont',
    passwordHash,
    linkedForetmapUserId: null,
  });
  assert.strictEqual(player.linked_foretmap_user_id, null);

  const sync = await syncForetmapUserForGlPlayer(player.id);
  assert.strictEqual(sync.ok, true);
  assert.ok(sync.user?.id);

  const linked = await queryOne(
    'SELECT linked_foretmap_user_id FROM gl_players WHERE id = ? LIMIT 1',
    [player.id],
  );
  assert.strictEqual(String(linked.linked_foretmap_user_id), String(sync.user.id));

  const member = await queryOne(
    `SELECT gm.user_id
       FROM group_members gm
      WHERE gm.group_id = ? AND gm.user_id = ?
      LIMIT 1`,
    [group.id, sync.user.id],
  );
  assert.ok(member);
});

test('backfillGlPlayersForetmapLinks rattrape les joueurs sans lien ForetMap', async () => {
  const admin = await createGlAdmin();
  const glClass = await createGlClass({ adminId: admin.id, name: `Backfill ${Date.now()}` });
  await ensureForetmapGroupForGlClass(glClass);
  const pseudo = `glbackfill_${Date.now()}`;
  const player = await createGlPlayer({
    classId: glClass.id,
    pseudo,
    linkedForetmapUserId: null,
  });

  const result = await backfillGlPlayersForetmapLinks();
  assert.ok(result.synced >= 1);

  const linked = await queryOne(
    'SELECT linked_foretmap_user_id FROM gl_players WHERE id = ? LIMIT 1',
    [player.id],
  );
  assert.ok(linked?.linked_foretmap_user_id);
});

test('syncForetmapUserForGlPlayer déplace le membre lors d un changement de classe GL', async () => {
  const admin = await createGlAdmin();
  const classA = await createGlClass({ adminId: admin.id, name: `Classe A ${Date.now()}` });
  const classB = await createGlClass({ adminId: admin.id, name: `Classe B ${Date.now()}` });
  const groupA = await ensureForetmapGroupForGlClass(classA);
  const groupB = await ensureForetmapGroupForGlClass(classB);

  const pseudo = `glmove_${Date.now()}`;
  const player = await createGlPlayer({
    classId: classA.id,
    pseudo,
    linkedForetmapUserId: null,
  });
  const syncA = await syncForetmapUserForGlPlayer(player.id);
  assert.strictEqual(syncA.ok, true);

  await execute('UPDATE gl_players SET class_id = ? WHERE id = ?', [classB.id, player.id]);
  const syncB = await syncForetmapUserForGlPlayer(player.id);
  assert.strictEqual(syncB.ok, true);
  assert.strictEqual(String(syncB.groupId), String(groupB.id));

  const inB = await queryOne(
    'SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
    [groupB.id, syncB.user.id],
  );
  const inA = await queryOne(
    'SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1',
    [groupA.id, syncB.user.id],
  );
  assert.ok(inB);
  assert.ok(!inA);
});

test('syncForetmapUserForGlPlayer ne rapproche pas un joueur non lié par pseudo/email ForetMap', async () => {
  const admin = await createGlAdmin();
  const glClass = await createGlClass({ adminId: admin.id, name: `Collision ${Date.now()}` });
  await ensureForetmapGroupForGlClass(glClass);
  const pseudo = `gl_collision_${Date.now()}`;
  const email = `${pseudo}@example.com`;
  const existing = await createForetmapStudent({
    pseudo,
    email,
    password: 'foretmap-secret',
  });
  const glPasswordHash = await bcrypt.hash('gl-secret', 10);
  const player = await createGlPlayer({
    classId: glClass.id,
    pseudo,
    email,
    passwordHash: glPasswordHash,
    linkedForetmapUserId: null,
  });

  const sync = await syncForetmapUserForGlPlayer(player.id);
  assert.strictEqual(sync.ok, true);
  assert.notStrictEqual(String(sync.user.id), String(existing.id));

  const preserved = await queryOne('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [
    existing.id,
  ]);
  assert.strictEqual(await bcrypt.compare('foretmap-secret', preserved.password_hash), true);

  const linked = await queryOne(
    'SELECT linked_foretmap_user_id FROM gl_players WHERE id = ? LIMIT 1',
    [player.id],
  );
  assert.strictEqual(String(linked.linked_foretmap_user_id), String(sync.user.id));
});

test('syncForetmapUserForGlPlayer ne remplace pas le mot de passe ForetMap lié', async () => {
  const admin = await createGlAdmin();
  const glClass = await createGlClass({ adminId: admin.id, name: `Linked password ${Date.now()}` });
  await ensureForetmapGroupForGlClass(glClass);
  const existing = await createForetmapStudent({
    pseudo: `linked_fm_${Date.now()}`,
    email: `linked-fm-${Date.now()}@example.com`,
    password: 'foretmap-stays',
  });
  const glPasswordHash = await bcrypt.hash('gl-should-not-copy', 10);
  const player = await createGlPlayer({
    classId: glClass.id,
    pseudo: `linked_gl_${Date.now()}`,
    passwordHash: glPasswordHash,
    linkedForetmapUserId: existing.id,
  });

  const sync = await syncForetmapUserForGlPlayer(player.id);
  assert.strictEqual(sync.ok, true);
  assert.strictEqual(String(sync.user.id), String(existing.id));

  const preserved = await queryOne('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [
    existing.id,
  ]);
  assert.strictEqual(await bcrypt.compare('foretmap-stays', preserved.password_hash), true);
  assert.strictEqual(await bcrypt.compare('gl-should-not-copy', preserved.password_hash), false);
});
