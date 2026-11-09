'use strict';

/**
 * Partie de **démonstration** G&L (`lib/gl/demoGame.js`, `routes/gl/admin-demo.js`) :
 * préparation idempotente, remise à zéro, drapeaux `is_demo`, exclusion des exports,
 * refus des joueurs et des invités.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');
const { GL_DEMO_PLAYERS, ensureGlDemoGame, describeGlDemoGame } = require('../lib/gl/demoGame');

let adminToken = '';
let playerToken = '';
let guestToken = '';
const savedGuestDisabled = process.env.GL_GUEST_MODE_DISABLED;

before(async () => {
  delete process.env.GL_GUEST_MODE_DISABLED;
  await initSchema();
  await execute("DELETE FROM gl_settings WHERE `key` = 'platform.guest_mode_enabled'");
  // Base propre : aucune partie ni classe de démonstration héritée d'un autre fichier.
  await purgeDemoFixtures();
  const admin = await createGlAdmin({ email: 'demo.mj@ecole.local', displayName: 'MJ Démo' });
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.team.manage', 'gl.players.manage'],
    displayName: 'MJ Démo',
  });
  const realClass = await createGlClass({ name: 'Classe réelle démo-test', adminId: admin.id });
  const player = await createGlPlayer({ classId: realClass.id, pseudo: 'eleve-reel-demo' });
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_joueur',
    permissions: ['gl.read'],
    displayName: 'Élève réel',
  });
  const guestRes = await request(app).post('/api/gl/auth/guest').expect(200);
  guestToken = guestRes.body.authToken;
});

/**
 * Ménage complet : la partie de démo référence un chapitre (FK RESTRICT) et la classe de démo
 * porte des joueurs fictifs ; laissés en place, ils bloqueraient le nettoyage d'autres fichiers
 * de test et fausseraient les comptages (suite séquentielle sur une seule base).
 */
async function purgeDemoFixtures() {
  await execute('DELETE FROM gl_games WHERE is_demo = 1');
  const demoClasses = await queryAll('SELECT id FROM gl_classes WHERE is_demo = 1');
  for (const cls of demoClasses) {
    const players = await queryAll(
      'SELECT id, linked_foretmap_user_id FROM gl_players WHERE class_id = ?',
      [cls.id],
    );
    for (const player of players) {
      await execute('DELETE FROM gl_players WHERE id = ?', [player.id]);
      if (player.linked_foretmap_user_id) {
        await execute("DELETE FROM users WHERE id = ? AND auth_provider = 'gl_bridge'", [
          player.linked_foretmap_user_id,
        ]);
      }
    }
    await execute('DELETE FROM gl_classes WHERE id = ?', [cls.id]);
  }
}

test.after(async () => {
  if (savedGuestDisabled === undefined) delete process.env.GL_GUEST_MODE_DISABLED;
  else process.env.GL_GUEST_MODE_DISABLED = savedGuestDisabled;
  await purgeDemoFixtures();
});

test('POST /api/gl/admin/demo/reset prépare classe, joueurs fictifs, équipes et partie flagués is_demo', async () => {
  const res = await request(app)
    .post('/api/gl/admin/demo/reset')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
  assert.strictEqual(res.body.ok, true);
  assert.ok(res.body.gameId > 0);
  assert.ok(res.body.classId > 0);
  assert.strictEqual(res.body.playerIds.length, GL_DEMO_PLAYERS.length);
  assert.deepStrictEqual(Object.keys(res.body.teamIds).sort(), ['gnome', 'unicorn']);

  const cls = await queryOne('SELECT is_demo, is_active FROM gl_classes WHERE id = ?', [
    res.body.classId,
  ]);
  assert.strictEqual(Number(cls.is_demo), 1);
  assert.strictEqual(Number(cls.is_active), 1);
  const game = await queryOne('SELECT is_demo, status, class_id FROM gl_games WHERE id = ?', [
    res.body.gameId,
  ]);
  assert.strictEqual(Number(game.is_demo), 1);
  assert.strictEqual(game.status, 'draft');
  assert.strictEqual(Number(game.class_id), Number(res.body.classId));

  const members = await queryAll(
    'SELECT team_id, player_id FROM gl_team_members WHERE game_id = ? ORDER BY player_id',
    [res.body.gameId],
  );
  assert.strictEqual(members.length, GL_DEMO_PLAYERS.length);
  const gnomes = members.filter((m) => Number(m.team_id) === Number(res.body.teamIds.gnome));
  assert.strictEqual(gnomes.length, 3);

  // Les joueurs fictifs ont un compte miroir, jamais d'e-mail.
  const players = await queryAll(
    `SELECT p.pseudo, u.email, u.auth_provider
       FROM gl_players p LEFT JOIN users u ON u.id = p.linked_foretmap_user_id
      WHERE p.class_id = ?`,
    [res.body.classId],
  );
  assert.strictEqual(players.length, GL_DEMO_PLAYERS.length);
  for (const row of players) {
    assert.ok(/^demo-(gnome|licorne)-\d$/.test(row.pseudo), row.pseudo);
    assert.strictEqual(row.auth_provider, 'gl_bridge');
  }
});

test('une seconde réinitialisation remplace la partie et garde les mêmes joueurs', async () => {
  const before1 = await describeGlDemoGame();
  const previousGameId = before1.game.id;
  const previousPlayerIds = (
    await queryAll('SELECT id FROM gl_players WHERE class_id = ? ORDER BY id', [before1.classId])
  ).map((r) => Number(r.id));

  const res = await request(app)
    .post('/api/gl/admin/demo/reset')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(201);
  assert.notStrictEqual(res.body.gameId, previousGameId);
  assert.strictEqual(res.body.classId, before1.classId);
  assert.deepStrictEqual([...res.body.playerIds].sort(), [...previousPlayerIds].sort());
  const old = await queryOne('SELECT id FROM gl_games WHERE id = ?', [previousGameId]);
  assert.ok(!old, 'ancienne partie de démo toujours présente');
  const demoGames = await queryAll('SELECT id FROM gl_games WHERE is_demo = 1');
  assert.strictEqual(demoGames.length, 1);
});

test('ensureGlDemoGame sans reset est idempotent', async () => {
  const first = await describeGlDemoGame();
  const result = await ensureGlDemoGame({ actorId: 'test', reset: false });
  assert.strictEqual(result.created, false);
  assert.strictEqual(result.gameId, first.game.id);
  assert.strictEqual(result.playerIds.length, GL_DEMO_PLAYERS.length);
});

test('GET /api/gl/admin/demo résume la démo ; la liste des parties porte isDemo', async () => {
  const res = await request(app)
    .get('/api/gl/admin/demo')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(res.body.demo);
  assert.strictEqual(res.body.demo.playersCount, GL_DEMO_PLAYERS.length);
  assert.strictEqual(res.body.demo.game.status, 'draft');

  const games = await request(app)
    .get('/api/gl/games')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const demoRow = games.body.find((g) => g.id === res.body.demo.game.id);
  assert.ok(demoRow);
  assert.strictEqual(demoRow.isDemo, true);
  assert.ok(games.body.filter((g) => g.isDemo === false).length >= 0);

  const state = await request(app)
    .get(`/api/gl/games/${res.body.demo.game.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(Number(state.body.game.is_demo), 1);
});

test('les exports ignorent la classe de démonstration', async () => {
  const summary = await describeGlDemoGame();
  const csv = await request(app)
    .get('/api/gl/admin/players/export')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(!csv.text.includes('demo-gnome-1'), 'joueur fictif présent dans l’export joueurs');
  assert.ok(csv.text.includes('eleve-reel-demo'), 'élève réel absent de l’export joueurs');

  const byClass = await request(app)
    .get(`/api/gl/admin/players/export?classId=${summary.classId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(byClass.text.split('\n').length, 1, 'export de la classe démo non vide');

  const teamSpirit = await request(app)
    .get(`/api/gl/admin/classes/${summary.classId}/exports/team-spirit.csv`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(400);
  assert.match(teamSpirit.body.error, /démonstration/);
  await request(app)
    .get(`/api/gl/admin/classes/${summary.classId}/exports/badges.csv`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(400);
});

test('la classe de démonstration est signalée dans les listes admin', async () => {
  const summary = await describeGlDemoGame();
  const classes = await request(app)
    .get('/api/gl/admin/classes')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const demoClass = classes.body.find((c) => Number(c.id) === summary.classId);
  assert.strictEqual(Number(demoClass.is_demo), 1);
  const players = await request(app)
    .get(`/api/gl/admin/players?classId=${summary.classId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(players.body.length > 0);
  assert.ok(players.body.every((p) => p.is_demo === true));
});

test('joueur et invité refusés sur les routes de démonstration', async () => {
  await request(app)
    .post('/api/gl/admin/demo/reset')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
  await request(app)
    .get('/api/gl/admin/demo')
    .set('Authorization', `Bearer ${guestToken}`)
    .expect(403);
  await request(app).post('/api/gl/admin/demo/reset').expect(401);
});

test('un pseudo de démo pris par une autre classe fait échouer la préparation', async () => {
  const summary = await describeGlDemoGame();
  const foreign = await queryOne(
    'SELECT id FROM gl_classes WHERE is_demo = 0 ORDER BY id DESC LIMIT 1',
  );
  await execute('UPDATE gl_players SET class_id = ? WHERE pseudo = ?', [
    foreign.id,
    'demo-gnome-1',
  ]);
  try {
    const res = await request(app)
      .post('/api/gl/admin/demo/reset')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    assert.match(res.body.error, /demo-gnome-1/);
  } finally {
    await execute('UPDATE gl_players SET class_id = ? WHERE pseudo = ?', [
      summary.classId,
      'demo-gnome-1',
    ]);
  }
});
