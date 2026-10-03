'use strict';

// Fin du voyage : terminer une partie du **dernier plateau** remet d'elle-même la liasse du
// copiste. Depuis la fusion des chapitres 4 et 5 (migration 316), l'année se joue en
// 4 plateaux : c'est le plateau 4 qui clôt le voyage (routes/gl/games/status.js).
require('./helpers/setup');
const { test, before, after } = require('node:test');
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
const CODE_CLOTURE = `fin-clo-${stamp}`.slice(0, 64);
let adminToken = '';
let adminId = null;
let classId = null;
const chapterIds = [];

async function createChapter(plateau) {
  const slug = `fin-voyage-p${plateau}-${stamp}`;
  await execute(
    `INSERT INTO gl_chapters (slug, title, plateau_number, order_index, created_at, updated_at)
     VALUES (?, ?, ?, 0, NOW(), NOW())`,
    [slug, `Fin du voyage P${plateau}`, plateau],
  );
  const row = await queryOne('SELECT id FROM gl_chapters WHERE slug = ?', [slug]);
  chapterIds.push(Number(row.id));
  return Number(row.id);
}

async function endGameOnPlateau(plateau) {
  const chapterId = await createChapter(plateau);
  const { game, teams } = await createGlGameWithTeams({
    classId,
    chapterId,
    createdBy: adminId,
    name: `Partie fin P${plateau} ${stamp}`,
    status: 'live',
    teams: [{ name: `Equipe P${plateau}`, type: 'unicorn' }],
  });
  await request(app)
    .post(`/api/gl/games/${game.id}/end`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  return queryOne(
    `SELECT unlocked_via FROM gl_game_feuillet_states
      WHERE game_id = ? AND team_id = ? AND feuillet_code = ?`,
    [game.id, teams[0].id, CODE_CLOTURE],
  );
}

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `fin.voyage.${stamp}@ecole.local` });
  adminId = admin.id;
  const cls = await createGlClass({ name: `Classe fin du voyage ${stamp}`, adminId: admin.id });
  classId = cls.id;
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage'],
  });
  adminToken = tokens.adminToken;
  await execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, type, titre, statut, offert_cloture)
     VALUES (?, 'copiste', 'Le mot suspendu', 'actif', 1)`,
    [CODE_CLOTURE],
  );
});

after(async () => {
  await execute('DELETE FROM gl_lore_feuillets WHERE feuillet_code = ?', [CODE_CLOTURE]);
  for (const id of chapterIds) {
    await execute('DELETE FROM gl_games WHERE chapter_id = ?', [id]);
    await execute('DELETE FROM gl_chapters WHERE id = ?', [id]);
  }
});

test('terminer une partie du plateau 4 remet la liasse du copiste', async () => {
  const state = await endGameOnPlateau(4);
  assert.ok(state, 'la liasse de clôture doit être remise');
  assert.strictEqual(state.unlocked_via, 'cloture');
});

test('un plateau antérieur ne la remet pas (elle dévoilerait la fin)', async () => {
  assert.strictEqual((await endGameOnPlateau(3)) ?? null, null);
});
