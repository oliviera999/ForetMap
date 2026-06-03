'use strict';

require('./helpers/setup');
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');
const { presentJournalEvent, parseNarrationImageUrl } = require('../lib/glJournalPresent');
const { invalidateGameplayCache, setGameplayCacheForTests } = require('../lib/glSettings');

test('presentJournalEvent formate une narration', () => {
  const pres = presentJournalEvent(
    {
      eventType: 'narration',
      payload: { text: 'Un dragon apparaît.' },
      actorType: 'mj',
      actorId: '1',
      teamId: null,
    },
    { teamsById: {} }
  );
  assert.strictEqual(pres.kind, 'narration');
  assert.strictEqual(pres.title, 'Narration du MJ');
  assert.strictEqual(pres.body, 'Un dragon apparaît.');
});

test('parseNarrationImageUrl refuse une URL externe', () => {
  assert.throws(
    () => parseNarrationImageUrl('https://example.org/x.png'),
    (err) => err?.status === 400
  );
});

describe('GL journal API', () => {
  let adminToken = '';
  let playerToken = '';
  let foreignToken = '';
  let gameId = null;
  let teamId = null;
  const stamp = Date.now();
  const VALID_IMAGE = '/uploads/media-library/images/journal-test.png';

  before(async () => {
    await initSchema();
    await execute(
      `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
       VALUES ('gameplay.narration_enabled', 'true', NOW())
       ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`
    );
    invalidateGameplayCache();
    setGameplayCacheForTests({ narrationEnabled: true, scoringEnabled: true });
    const admin = await createGlAdmin({
      email: `gl.journal.${stamp}@ecole.local`,
      displayName: 'MJ Journal',
    });
    const cls = await createGlClass({
      name: `Classe Journal ${stamp}`,
      school: 'Ecole',
      adminId: admin.id,
    });
    const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
    const gameSeed = await createGlGameWithTeams({
      classId: cls.id,
      chapterId: Number(chapter.id),
      createdBy: admin.id,
      teams: [{ name: 'Equipe Journal', type: 'gnome' }],
    });
    gameId = Number(gameSeed.game.id);
    teamId = Number(gameSeed.teams[0].id);

    const player = await createGlPlayer({
      classId: cls.id,
      pseudo: `journal-player-${stamp}`,
      password: 'motdepasse123',
    });
    await execute(
      'INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at) VALUES (?, ?, ?, NOW())',
      [gameId, teamId, player.id]
    );

    const foreign = await createGlPlayer({
      classId: cls.id,
      pseudo: `journal-foreign-${stamp}`,
      password: 'motdepasse123',
    });

    const tokens = await signTokens({
      adminId: admin.id,
      adminPermissions: ['gl.read', 'gl.event.emit', 'gl.game.manage'],
      playerId: player.id,
      playerPermissions: ['gl.read'],
    });
    adminToken = tokens.adminToken;
    playerToken = tokens.playerToken;
    foreignToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: String(foreign.id),
      roleSlug: 'gl_player',
      permissions: ['gl.read'],
      displayName: foreign.pseudo,
    });
  });

  test('POST narration avec imageUrl valide puis GET journal enrichi', async () => {
    const posted = await request(app)
      .post(`/api/gl/games/${gameId}/events`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventType: 'narration',
        teamId,
        payload: { text: 'Scène illustrée', imageUrl: VALID_IMAGE },
      })
      .expect(201);
    assert.strictEqual(posted.body?.eventType, 'narration');
    assert.strictEqual(posted.body?.payload?.imageUrl, VALID_IMAGE);

    const listed = await request(app)
      .get(`/api/gl/journal/games/${gameId}?limit=20`)
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);
    assert.ok(Array.isArray(listed.body?.events));
    assert.ok(Array.isArray(listed.body?.teams));
    const hit = listed.body.events.find((e) => e.presentation?.body === 'Scène illustrée');
    assert.ok(hit, 'évènement avec presentation.body attendu');
    assert.strictEqual(hit.presentation.imageUrl, VALID_IMAGE);
  });

  test('POST narration imageUrl invalide → 400', async () => {
    await request(app)
      .post(`/api/gl/games/${gameId}/events`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventType: 'narration',
        payload: { text: 'Test', imageUrl: 'https://evil.test/x.png' },
      })
      .expect(400);
  });

  test('GET journal filtre teamId', async () => {
    const res = await request(app)
      .get(`/api/gl/journal/games/${gameId}?teamId=${teamId}&limit=5`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    for (const evt of res.body.events) {
      assert.ok(evt.teamId == null || Number(evt.teamId) === teamId);
    }
  });

  test('GET journal refuse joueur non membre', async () => {
    await request(app)
      .get(`/api/gl/journal/games/${gameId}`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(403);
  });
});
