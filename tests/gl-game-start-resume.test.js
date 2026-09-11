'use strict';

/**
 * Reprise après pause : les équipes ne doivent pas être renvoyées à la case départ.
 *
 * Le bandeau MJ autorise « Démarrer » depuis `paused` (`gameLifecycleAction`).
 * `POST /start` replaçait pourtant toutes les mascottes sur le premier repère du
 * parcours numéroté — une classe qui coupe à la récré puis reprend voyait la
 * progression du plateau effacée.
 */

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

const stamp = Date.now();
let adminToken = '';
let gameId = null;
let teamId = null;
let startMarkerId = null;
let laterMarkerId = null;
let classId = null;
let chapterId = null;
let createdBy = null;

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({
    email: `start.resume.${stamp}@ecole.local`,
    displayName: 'MJ Reprise',
  });
  const cls = await createGlClass({
    name: `Classe reprise ${stamp}`,
    school: 'Lyautey',
    adminId: admin.id,
  });

  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, order_index, created_at, updated_at)
     VALUES (?, ?, 'foret', 0, NOW(), NOW())`,
    [`ch-resume-${stamp}`, `Chapitre reprise ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `ch-resume-${stamp}`,
  ]);

  await execute(
    `INSERT INTO gl_chapter_markers
      (chapter_id, x_pct, y_pct, event_type, label, description, order_index)
     VALUES (?, 10, 10, 'event', 'Depart', 'case 0', 0),
           (?, 80, 80, 'event', 'Plus loin', 'case 1', 1)`,
    [chapter.id, chapter.id],
  );
  startMarkerId = Number(
    (
      await queryOne(
        'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? AND label = ? LIMIT 1',
        [chapter.id, 'Depart'],
      )
    ).id,
  );
  laterMarkerId = Number(
    (
      await queryOne(
        'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? AND label = ? LIMIT 1',
        [chapter.id, 'Plus loin'],
      )
    ).id,
  );

  classId = Number(cls.id);
  chapterId = Number(chapter.id);
  createdBy = Number(admin.id);
  const seed = await createGlGameWithTeams({
    classId,
    chapterId,
    createdBy,
    name: `Partie reprise ${stamp}`,
    status: 'draft',
    teams: [{ name: 'Equipe Reprise', type: 'gnome', color: '#22c55e' }],
  });
  gameId = Number(seed.game.id);
  teamId = Number(seed.teams[0].id);
  await execute(
    `UPDATE gl_games
        SET board_movement_mode = 'numbered_path', board_path_start_index = 0
      WHERE id = ?`,
    [gameId],
  );

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position'],
  });
  adminToken = tokens.adminToken;
});

function asMj() {
  return { Authorization: `Bearer ${adminToken}` };
}

test('POST /start depuis un brouillon pose l’équipe sur la case départ', async () => {
  const res = await request(app).post(`/api/gl/games/${gameId}/start`).set(asMj()).expect(200);
  assert.strictEqual(res.body.status, 'live');
  const team = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ? LIMIT 1', [
    teamId,
  ]);
  assert.strictEqual(Number(team.position_marker_id), startMarkerId);
});

test('POST /start depuis une pause conserve la position (pas de téléport au départ)', async () => {
  await execute(
    `UPDATE gl_teams
        SET position_marker_id = ?, position_x_pct = 80, position_y_pct = 80
      WHERE id = ?`,
    [laterMarkerId, teamId],
  );

  await request(app).post(`/api/gl/games/${gameId}/pause`).set(asMj()).expect(200);
  const paused = await queryOne('SELECT status FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  assert.strictEqual(paused.status, 'paused');

  await request(app).post(`/api/gl/games/${gameId}/start`).set(asMj()).expect(200);
  const team = await queryOne(
    'SELECT position_marker_id, position_x_pct, position_y_pct FROM gl_teams WHERE id = ? LIMIT 1',
    [teamId],
  );
  assert.strictEqual(Number(team.position_marker_id), laterMarkerId);
  assert.strictEqual(Number(team.position_x_pct), 80);
  assert.strictEqual(Number(team.position_y_pct), 80);
});

test('POST /start sur une partie déjà en cours est refusé (409)', async () => {
  const res = await request(app).post(`/api/gl/games/${gameId}/start`).set(asMj()).expect(409);
  assert.match(String(res.body.error || ''), /brouillon|pause/i);
  const game = await queryOne('SELECT status FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  assert.strictEqual(game.status, 'live');
});

test('POST /pause depuis un brouillon est refusé (409)', async () => {
  const other = await createGlGameWithTeams({
    classId,
    chapterId,
    createdBy,
    name: `Partie pause-refus ${stamp}`,
    status: 'draft',
    teams: [{ name: 'Equipe Brouillon', type: 'gnome' }],
  });
  const res = await request(app)
    .post(`/api/gl/games/${other.game.id}/pause`)
    .set(asMj())
    .expect(409);
  assert.match(String(res.body.error || ''), /en cours/i);
});
