'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

let adminToken = '';
let gameId = null;
let chapterId = null;
let zoneId = null;
const stamp = Date.now();
const VALID_IMAGE = '/uploads/media-library/image/2026/05/zone-popover-test.png';

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({
    email: `gl.zone.content.${stamp}@ecole.local`,
    displayName: 'MJ Zone Content',
  });
  const cls = await createGlClass({
    name: `Classe Zone Content ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  chapterId = Number(chapter.id);
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Zone', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  const teamId = Number(gameSeed.teams[0].id);

  await execute('UPDATE gl_games SET status = ?, current_team_id = ? WHERE id = ?', [
    'live',
    teamId,
    gameId,
  ]);

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage', 'gl.game.manage', 'gl.mascot.position'],
  });
  adminToken = tokens.adminToken;

  const created = await request(app)
    .post('/api/gl/kingdom-map/zones')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      chapterId,
      label: 'Zone popover test',
      points: [
        { x: 15, y: 15 },
        { x: 85, y: 15 },
        { x: 50, y: 85 },
      ],
      popoverMarkdown: '## Découverte\n\nTexte de zone.',
      popoverImages: [{ url: VALID_IMAGE, caption: 'Vue', sortOrder: 0 }],
    });
  zoneId = Number(created.body?.id);
});

test('GET zones expose popoverMarkdown et popoverImages', async () => {
  const res = await request(app)
    .get(`/api/gl/kingdom-map/zones?chapterId=${chapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const zone = (res.body?.zones || []).find((z) => Number(z.id) === zoneId);
  assert.ok(zone);
  assert.match(String(zone.popoverMarkdown || ''), /Découverte/);
  assert.strictEqual(zone.popoverImages?.length, 1);
});

test('POST present-content enregistre et renvoie le contenu', async () => {
  const team = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? LIMIT 1', [gameId]);
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/zones/${zoneId}/present-content`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId: team.id })
    .expect(200);
  assert.strictEqual(res.body?.zone?.id, zoneId);
  assert.match(String(res.body?.popoverMarkdown || ''), /Découverte/);
  assert.strictEqual(res.body?.popoverImages?.length, 1);
});

test('POST present-content refuse une seconde fois en once_per_game', async () => {
  const team = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? LIMIT 1', [gameId]);
  await request(app)
    .post(`/api/gl/games/${gameId}/zones/${zoneId}/present-content`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId: team.id })
    .expect(409);
});

test('GET gameplay-settings expose zoneContentRetrigger', async () => {
  const res = await request(app)
    .get('/api/gl/gameplay-settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(
    ['every_arrival', 'once_per_team', 'once_per_game'].includes(
      res.body?.settings?.zoneContentRetrigger,
    ),
  );
});
