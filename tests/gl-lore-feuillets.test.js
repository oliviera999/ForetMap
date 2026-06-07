'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');
const { applyFeuilletsImport, parseFeuilletsWorkbook } = require('../lib/glLoreFeuilletsImport');
const { applyLoreGlossaryImport, parseLoreGlossaryWorkbook } = require('../lib/glLoreGlossaryImport');

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;
let zoneId = null;
let feuilletCode = 'ep-IV-01';

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.lore.${Date.now()}@ecole.local` });
  const cls = await createGlClass({ name: `Classe Lore ${Date.now()}`, adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: Number(chapter.id),
    createdBy: admin.id,
    teams: [{ name: 'Equipe Lore', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  const player = await createGlPlayer({
    classId: cls.id,
    teamId,
    pseudo: `lore-player-${Date.now()}`,
  });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage', 'gl.game.manage', 'gl.event.emit'],
    playerId: player.id,
    teamId,
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;

  const feuilletFile = path.join(process.cwd(), 'data', 'gl', 'corpus-feuillets-selene.xlsx');
  const glossaryFile = path.join(process.cwd(), 'data', 'gl', 'glossaire-lore-gnomes-et-licornes.xlsx');
  const feuilletParsed = parseFeuilletsWorkbook(fs.readFileSync(feuilletFile));
  await applyFeuilletsImport({ queryAll: require('../database').queryAll, execute }, feuilletParsed, { dryRun: false });
  const { glossaryRows } = parseLoreGlossaryWorkbook(fs.readFileSync(glossaryFile));
  await applyLoreGlossaryImport({ queryAll: require('../database').queryAll, execute }, glossaryRows, { dryRun: false });

  const created = await request(app)
    .post('/api/gl/kingdom-map/zones')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      chapterId: Number(chapter.id),
      label: 'Tropiques africains',
      points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 50, y: 90 }],
    });
  zoneId = Number(created.body?.id);
  await execute(
    'UPDATE gl_lore_feuillets SET kingdom_zone_id = ? WHERE feuillet_code = ?',
    [zoneId, feuilletCode],
  );
});

test('GET /api/gl/lore/feuillets liste le corpus', async () => {
  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body?.items));
  assert.ok(res.body.items.length > 0);
});

test('GET /api/gl/lore/feuillets expose imageUrl après mise à jour', async () => {
  const imageUrl = '/uploads/media-library/image/ep-IV-01-scene.png';
  await execute(
    'UPDATE gl_lore_feuillets SET image_url = ? WHERE feuillet_code = ?',
    [imageUrl, feuilletCode],
  );
  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const item = res.body.items.find((row) => row.feuilletCode === feuilletCode);
  assert.ok(item);
  assert.strictEqual(item.imageUrl, imageUrl);
});

test('GET /api/gl/lore/glossary liste les termes lore', async () => {
  const res = await request(app)
    .get('/api/gl/lore/glossary')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(res.body.items.some((row) => String(row.lore_code).startsWith('LR')));
});

test('POST present feuillet découvre et journalise', async () => {
  const res = await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${feuilletCode}/present`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId, kingdomZoneId: zoneId })
    .expect(200);
  assert.strictEqual(res.body?.feuillet?.feuilletCode, feuilletCode);

  await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${feuilletCode}/present`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId, kingdomZoneId: zoneId })
    .expect(409);
});

test('GET zones feuillets candidats', async () => {
  const res = await request(app)
    .get(`/api/gl/lore/games/${gameId}/zones/${zoneId}/feuillets`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(res.body.items.some((row) => row.feuilletCode === feuilletCode));
});
