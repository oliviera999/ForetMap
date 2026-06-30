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
let playerAId = null;
let playerBId = null;
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
  playerBId = playerB.id;

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

test('GET /api/gl/player-journal/me — carnet vide par défaut', async () => {
  const res = await request(app)
    .get('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body.bodyMarkdown, '');
  assert.strictEqual(res.body.usage.charCount, 0);
  assert.strictEqual(res.body.usage.assetCount, 0);
  assert.strictEqual(res.body.limits.maxChars, 500);
  assert.strictEqual(res.body.limits.maxAssets, 2);
});

test('PUT /api/gl/player-journal/me — sauvegarde markdown', async () => {
  const res = await request(app)
    .put('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: '## Ma note\n\nTexte du carnet.' })
    .expect(200);
  assert.ok(res.body.bodyMarkdown.includes('Ma note'));
  assert.ok(res.body.usage.charCount > 0);
});

test('PUT /api/gl/player-journal/me — refuse dépassement caractères', async () => {
  const longText = 'x'.repeat(501);
  const res = await request(app)
    .put('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: longText })
    .expect(400);
  assert.match(res.body.error, /trop long/i);
});

test('POST /api/gl/player-journal/me/assets — upload illustration', async () => {
  const pngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const res = await request(app)
    .post('/api/gl/player-journal/me/assets')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ imageData: pngBase64 })
    .expect(201);
  assert.ok(res.body.asset?.url?.startsWith('/uploads/gl-player-journal/'));
  assert.strictEqual(res.body.usage.assetCount, 1);
});

test('GET /api/gl/player-journal/players/:id — MJ lit le carnet', async () => {
  const res = await request(app)
    .get(`/api/gl/player-journal/players/${playerAId}`)
    .set('Authorization', `Bearer ${mjToken}`)
    .expect(200);
  assert.strictEqual(Number(res.body.playerId), Number(playerAId));
  assert.ok(String(res.body.bodyMarkdown || '').length > 0);
});

test('GET /api/gl/player-journal/players/:id — joueur sans permission refusé', async () => {
  await request(app)
    .get(`/api/gl/player-journal/players/${playerAId}`)
    .set('Authorization', `Bearer ${playerNoPermToken}`)
    .expect(403);
});

test('PUT avec encart sort invalide — 400', async () => {
  const body =
    '<aside class="gl-journal-embed" data-gl-embed-type="spell" data-gl-ref="ZZZZ_INVALID"></aside>';
  const res = await request(app)
    .put('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: body })
    .expect(400);
  assert.match(res.body.error, /introuvable/i);
});

test('PUT avec encart module_stub narrative — accepté', async () => {
  const body =
    '<aside class="gl-journal-embed" data-gl-embed-type="module_stub" data-gl-ref="narrative"></aside>';
  const res = await request(app)
    .put('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: body })
    .expect(200);
  assert.ok(res.body.bodyMarkdown.includes('module_stub'));
});

test('GET /api/gl/auth/config expose playerJournalEnabled', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(typeof res.body.modules.playerJournalEnabled, 'boolean');
});

// --- Limites désactivées (0 = illimité) : aucun plafond explicite ---
test('limites à 0 = illimité : pas de plafond caractères ni illustrations', async () => {
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

  // limites exposées à 0 (illimité)
  const meRes = await request(app)
    .get('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(meRes.body.limits.maxChars, 0);
  assert.strictEqual(meRes.body.limits.maxAssets, 0);

  // texte largement au-delà de l'ancien plafond (500) : accepté
  const longText = 'y'.repeat(5000);
  const putRes = await request(app)
    .put('/api/gl/player-journal/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ bodyMarkdown: longText })
    .expect(200);
  assert.strictEqual(putRes.body.usage.charCount, 5000);

  // illustrations au-delà de l'ancien plafond (2) : acceptées
  const pngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  for (let i = 0; i < 3; i += 1) {
    await request(app)
      .post('/api/gl/player-journal/me/assets')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ imageData: pngBase64 })
      .expect(201);
  }
});
