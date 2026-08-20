'use strict';

/**
 * Possession d'un feuillet : `read` et `hold` ne se prennent pas sur un feuillet que
 * l'équipe n'a pas trouvé.
 *
 * `read` et `held` comptent parmi les statuts « trouvés ». Ces deux routes écrivant
 * directement l'état, un joueur pouvait s'attribuer n'importe quel code — sans QCM, sans
 * gemmes, sans canal de découverte, et en contournant la garde de portée de `present`.
 * Les codes sont lisibles dans l'aperçu verrouillé du carnet : il n'y avait rien à deviner.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { upsertFeuilletState } = require('../lib/glLoreFeuillets');
const { invalidateModulesCache } = require('../lib/glSettings');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
const biomeSlug = `fst${stamp}`.slice(0, 64);
const foundCode = `fst-found-${stamp}`;
const strangerCode = `fst-stranger-${stamp}`;

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;

const db = { queryOne, queryAll, execute };

async function stateOf(code) {
  return queryOne(
    'SELECT status FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ?',
    [gameId, teamId, code],
  );
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('modules.lore_carnet_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateModulesCache();

  const admin = await createGlAdmin({ email: `fst.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe FST ${stamp}`, adminId: admin.id });
  await execute('INSERT IGNORE INTO gl_biomes (slug, nom, order_index) VALUES (?, ?, 993)', [
    biomeSlug,
    `Biome FST ${stamp}`,
  ]);
  await execute(
    `INSERT INTO gl_chapters (slug, title, plateau_number, order_index) VALUES (?, ?, 1, 993)`,
    [`fst-${stamp}`, `Chapitre FST ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `fst-${stamp}`,
  ]);

  for (const code of [foundCode, strangerCode]) {
    await execute(
      `INSERT INTO gl_lore_feuillets (feuillet_code, titre, incipit, texte_accessible, biome_slug, ordre_voyage, tenir)
       VALUES (?, ?, 'Incipit', 'Texte', ?, 1, 'oui')`,
      [code, `Feuillet ${code}`, biomeSlug],
    );
  }

  const seed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe FST', type: 'gnome' }],
  });
  gameId = Number(seed.game.id);
  teamId = Number(seed.teams[0].id);

  const player = await createGlPlayer({ classId: cls.id, teamId, pseudo: `fst-p-${stamp}` });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: player.id });
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  // Un feuillet réellement découvert par l'équipe, un autre qui lui est étranger.
  await upsertFeuilletState(db, {
    gameId,
    teamId,
    feuilletCode: foundCode,
    status: 'discovered',
    effacementPct: 0,
    unlockedVia: 'zone',
  });

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: player.id,
    playerPseudo: player.pseudo,
    teamId,
    adminPermissions: ['gl.read', 'gl.game.manage'],
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('read : un feuillet étranger à l’équipe est refusé (409) et reste non possédé', async () => {
  const res = await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${strangerCode}/read`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);
  assert.match(String(res.body?.error || ''), /non trouvé/i);
  assert.ok(!(await stateOf(strangerCode)), 'aucun état ne doit être créé');
});

test('hold : même refus, et le feuillet ne devient pas « tenu »', async () => {
  await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${strangerCode}/hold`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);
  assert.ok(!(await stateOf(strangerCode)));
});

test('read : un feuillet réellement découvert se lit normalement', async () => {
  await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${foundCode}/read`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(200);
  assert.strictEqual((await stateOf(foundCode)).status, 'read');
});

test('le MJ n’est pas soumis à la garde : il peut marquer l’avancée d’une équipe', async () => {
  await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${strangerCode}/read`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);
  assert.strictEqual((await stateOf(strangerCode)).status, 'read');
});
