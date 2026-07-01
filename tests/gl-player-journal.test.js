'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { invalidateModulesCache, invalidateGameplayCache } = require('../lib/glSettings');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
const PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let playerAId = null;
let playerToken = '';
let mjToken = '';
let playerNoPermToken = '';

before(async () => {
  await initSchema();

  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('modules.player_journal_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.player_journal_max_chars', '500', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.player_journal_max_assets', '2', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateModulesCache();
  invalidateGameplayCache();

  const admin = await createGlAdmin({ email: `mj.journal.${stamp}@ecole.local` });
  const glClass = await createGlClass({ adminId: admin.id, name: `Classe journal ${stamp}` });
  const playerA = await createGlPlayer({ classId: glClass.id, pseudo: `pj-a-${stamp}` });
  const playerB = await createGlPlayer({ classId: glClass.id, pseudo: `pj-b-${stamp}` });
  playerAId = playerA.id;

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: playerA.id,
    playerPseudo: playerA.pseudo,
    adminPermissions: ['gl.read', 'gl.players.manage', 'gl.settings.manage'],
  });
  mjToken = tokens.adminToken;
  playerToken = tokens.playerToken;

  const noPerm = await signTokens({
    playerId: playerB.id,
    playerPseudo: playerB.pseudo,
    playerPermissions: ['gl.read'],
  });
  playerNoPermToken = noPerm.playerToken;
});

test('GET /me — carnet sans article par défaut', async () => {
  const res = await request(app)
    .get('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.deepStrictEqual(res.body.articles, []);
  assert.strictEqual(res.body.limits.maxChars, 500);
  assert.strictEqual(res.body.limits.maxAssets, 2);
});

test('POST /me/articles — crée un article (titre optionnel, corps vide accepté)', async () => {
  const res = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: '' })
    .expect(201);
  assert.ok(Number.isFinite(res.body.article.id));
  assert.strictEqual(res.body.article.title, '');
  assert.strictEqual(res.body.article.bodyMarkdown, '');
  assert.ok(res.body.article.createdAt);
});

test('PUT /me/articles/:id — met à jour titre et corps', async () => {
  const created = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ title: 'Ma première entrée', bodyMarkdown: '## Note\n\nTexte.' })
    .expect(201);
  const id = created.body.article.id;

  const res = await request(app)
    .put(`/api/gl/player-journal/me/articles/${id}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ title: 'Titre modifié', bodyMarkdown: '## Note\n\nTexte enrichi.' })
    .expect(200);
  assert.strictEqual(res.body.article.title, 'Titre modifié');
  assert.ok(res.body.article.bodyMarkdown.includes('enrichi'));
  assert.ok(res.body.article.usage.charCount > 0);
});

test('PUT /me/articles/:id — article d’un autre joueur → 404', async () => {
  const created = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: 'privé' })
    .expect(201);
  await request(app)
    .put(`/api/gl/player-journal/me/articles/${created.body.article.id}`)
    .set('Authorization', `Bearer ${playerNoPermToken}`)
    .send({ bodyMarkdown: 'intrusion' })
    .expect(404);
});

test('POST /me/articles — refuse dépassement caractères (limite 500)', async () => {
  const res = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: 'x'.repeat(501) })
    .expect(400);
  assert.match(res.body.error, /trop long/i);
});

test('POST /me/articles/:id/assets — upload illustration', async () => {
  const created = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: '' })
    .expect(201);
  const id = created.body.article.id;

  const res = await request(app)
    .post(`/api/gl/player-journal/me/articles/${id}/assets`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ imageData: PNG_BASE64 })
    .expect(201);
  assert.ok(res.body.asset?.url?.startsWith('/uploads/gl-player-journal/'));
  assert.strictEqual(res.body.usage.assetCount, 1);
});

test('DELETE /me/articles/:id — supprime l’article', async () => {
  const created = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: 'à supprimer' })
    .expect(201);
  const id = created.body.article.id;
  await request(app)
    .delete(`/api/gl/player-journal/me/articles/${id}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  await request(app)
    .put(`/api/gl/player-journal/me/articles/${id}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: 'x' })
    .expect(404);
});

test('GET /players/:id — MJ lit les articles du joueur', async () => {
  const res = await request(app)
    .get(`/api/gl/player-journal/players/${playerAId}`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  assert.strictEqual(Number(res.body.playerId), Number(playerAId));
  assert.ok(Array.isArray(res.body.articles));
  assert.ok(res.body.articles.length > 0);
});

test('GET /players/:id — joueur sans permission refusé', async () => {
  await request(app)
    .get(`/api/gl/player-journal/players/${playerAId}`)
    .set('Authorization', `Bearer ${playerNoPermToken}`)
    .expect(403);
});

test('POST /me/articles avec encart sort invalide — 400', async () => {
  const body =
    '<aside class="gl-journal-embed" data-gl-embed-type="spell" data-gl-ref="ZZZZ_INVALID"></aside>';
  const res = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: body })
    .expect(400);
  assert.match(res.body.error, /introuvable/i);
});

test('POST /me/articles avec encart module_stub narrative — accepté', async () => {
  const body =
    '<aside class="gl-journal-embed" data-gl-embed-type="module_stub" data-gl-ref="narrative"></aside>';
  const res = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: body })
    .expect(201);
  assert.ok(res.body.article.bodyMarkdown.includes('module_stub'));
});

test('GET /api/gl/auth/config expose playerJournalEnabled', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(typeof res.body.modules.playerJournalEnabled, 'boolean');
});

// --- Limites désactivées (0 = illimité) : aucun plafond par article ---
test('limites à 0 = illimité : article long et illustrations multiples acceptés', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.player_journal_max_chars', '0', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.player_journal_max_assets', '0', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();

  const meRes = await request(app)
    .get('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(meRes.body.limits.maxChars, 0);
  assert.strictEqual(meRes.body.limits.maxAssets, 0);

  const created = await request(app)
    .post('/api/gl/player-journal/me/articles')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: 'y'.repeat(5000) })
    .expect(201);
  assert.strictEqual(created.body.article.usage.charCount, 5000);

  const id = created.body.article.id;
  for (let i = 0; i < 3; i += 1) {
    await request(app)
      .post(`/api/gl/player-journal/me/articles/${id}/assets`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ imageData: PNG_BASE64 })
      .expect(201);
  }
});

// --- Import d'éléments du site (appris) dans le carnet ---
test('import d’un élément appris (page de contenu) → carnet + retrait', async () => {
  const slug = `test-page-${stamp}`;
  await execute(
    `INSERT INTO gl_content_pages (slug, title, body_markdown)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title)`,
    [slug, 'Page test', '# Bienvenue'],
  );

  // Sans marquage « appris » → 403
  await request(app)
    .post('/api/gl/player-journal/me/imports')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ resourceType: 'content_page', resourceRef: slug })
    .expect(403);

  // Ressource inexistante → 404
  await request(app)
    .post('/api/gl/player-journal/me/imports')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ resourceType: 'content_page', resourceRef: `nope-${stamp}` })
    .expect(404);

  // Marquage « appris » (accusé enregistré en base)
  await execute(
    `INSERT INTO gl_learning_acknowledgements
       (reader_user_type, reader_user_id, target_type, target_code, acknowledged_at)
     VALUES ('gl_player', ?, 'content_page', ?, NOW())
     ON DUPLICATE KEY UPDATE acknowledged_at = NOW()`,
    [String(playerAId), slug],
  );

  // Import accepté
  const imp = await request(app)
    .post('/api/gl/player-journal/me/imports')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ resourceType: 'content_page', resourceRef: slug, title: 'Page test' })
    .expect(201);
  assert.strictEqual(imp.body.import.resourceType, 'content_page');
  assert.strictEqual(imp.body.import.title, 'Page test');

  // Présent dans le carnet
  const me = await request(app)
    .get('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(me.body.imports));
  assert.ok(
    me.body.imports.some((i) => i.resourceType === 'content_page' && i.resourceRef === slug),
  );

  // Retrait
  await request(app)
    .delete(`/api/gl/player-journal/me/imports/${imp.body.import.id}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
});

test('GET /me/imports/refs — refs légères (type + ref) reflètent l’état importé', async () => {
  const slug = `test-refs-${stamp}`;
  await execute(
    `INSERT INTO gl_content_pages (slug, title, body_markdown)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title)`,
    [slug, 'Page refs', '# Refs'],
  );

  // Avant import : absent de la liste des refs
  const before = await request(app)
    .get('/api/gl/player-journal/me/imports/refs')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(before.body.refs));
  assert.ok(
    !before.body.refs.some((r) => r.resourceType === 'content_page' && r.resourceRef === slug),
  );

  await execute(
    `INSERT INTO gl_learning_acknowledgements
       (reader_user_type, reader_user_id, target_type, target_code, acknowledged_at)
     VALUES ('gl_player', ?, 'content_page', ?, NOW())
     ON DUPLICATE KEY UPDATE acknowledged_at = NOW()`,
    [String(playerAId), slug],
  );
  const imp = await request(app)
    .post('/api/gl/player-journal/me/imports')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ resourceType: 'content_page', resourceRef: slug })
    .expect(201);

  // Après import : présent dans les refs (sans titre ni article, réponse légère)
  const after = await request(app)
    .get('/api/gl/player-journal/me/imports/refs')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(
    after.body.refs.some((r) => r.resourceType === 'content_page' && r.resourceRef === slug),
  );

  await request(app)
    .delete(`/api/gl/player-journal/me/imports/${imp.body.import.id}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
});
