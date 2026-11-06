'use strict';

/**
 * « Tenir à deux » v2 — grimoire du voyageur réaligné (spec § 10) : niveaux 1–6, un usage par
 * partie, Flair (fouille personnelle en veillée : verdict seulement, empreinte partagée, jamais
 * de question), Plume (page vierge en relecture puis au carnet), Messager refusé.
 * Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const { createTenirGame, importExempleChasse } = require('./helpers/glTenirFixtures');
const { invalidateModulesCache } = require('../lib/glSettings');

let ctx;
let stamp;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function addAcks(pid, type, count, prefix) {
  for (let i = 0; i < count; i += 1) {
    await execute(
      `INSERT IGNORE INTO gl_learning_acknowledgements (reader_user_type, reader_user_id, target_type, target_code)
       VALUES ('gl_player', ?, ?, ?)`,
      [String(pid), type, `${prefix}-${stamp}-${i}`],
    );
  }
}

before(async () => {
  await initSchema();
  stamp = Date.now();
  await execute(
    "INSERT INTO gl_settings (`key`, value_json, updated_at) VALUES ('modules.voyageur_enabled', 'true', NOW()) ON DUPLICATE KEY UPDATE value_json = 'true'",
  );
  invalidateModulesCache();
  ctx = await createTenirGame({ stamp });
  await importExempleChasse(db, { game: ctx.game });
  await request(app)
    .get(`/api/gl/games/${ctx.game.id}/tenir`)
    .set(auth(ctx.adminToken))
    .expect(200);
});

test('niveaux : Seconde chance 1, Loupe 2, Mémoire 3, Flair 4, Plume 5, Messager 6 (hors périmètre)', async () => {
  const me = await request(app).get('/api/gl/voyageur/me').set(auth(ctx.players[0].token));
  assert.equal(me.status, 200, JSON.stringify(me.body));
  const levels = Object.fromEntries(me.body.grimoire.map((s) => [s.code, s.levelRequired]));
  assert.deepEqual(levels, {
    seconde_chance: 1,
    loupe: 2,
    memoire: 3,
    flair: 4,
    plume: 5,
    messager: 6,
  });
  const messager = me.body.grimoire.find((s) => s.code === 'messager');
  assert.equal(messager.perimetre, 'hors_perimetre');
  assert.equal(messager.charged, false);
});

test('Flair : verdict seulement, empreinte partagée, aucune question ; un usage par partie', async () => {
  const p = ctx.players[2];
  await addAcks(p.id, 'species', 30, 'flair'); // niveau ≥ 4
  const locked = await request(app)
    .post('/api/gl/voyageur/spells/messager/cast')
    .set(auth(p.token))
    .send({ target: 'x' });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.code, 'SPELL_HORS_PERIMETRE');

  const res = await request(app)
    .post('/api/gl/voyageur/spells/flair/cast')
    .set(auth(p.token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.effect.verdict, 'chaud', 'dans une zone endormie : chaud, sans question');
  assert.equal(res.body.effect.question, undefined);
  assert.equal(res.body.spell.charged, false);
  const empreinte = await queryOne(
    'SELECT verdict, round_number, player_id FROM gl_game_chasse_empreintes WHERE game_id = ? ORDER BY id DESC LIMIT 1',
    [ctx.game.id],
  );
  assert.equal(empreinte.verdict, 'chaud');
  assert.equal(Number(empreinte.player_id), p.id);
  const page = await queryOne(
    "SELECT p.etat FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id WHERE p.game_id = ? AND z.zone_key = 'cz-p1-01'",
    [ctx.game.id],
  );
  assert.equal(page.etat, 'endormie', 'le Flair ne révèle ni ne trouve');

  const again = await request(app)
    .post('/api/gl/voyageur/spells/flair/cast')
    .set(auth(p.token))
    .send({ x: 0.9, y: 0.9 });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'SPELL_NOT_CHARGED');
});

test('Plume : page proposée, en file chez le prof, puis au carnet de la classe', async () => {
  const p = ctx.players[3];
  await addAcks(p.id, 'species', 50, 'plume'); // niveau ≥ 5
  const bad = await request(app)
    .post('/api/gl/voyageur/spells/plume/cast')
    .set(auth(p.token))
    .send({ titre: 'Ok', texte: 'trop court' });
  assert.equal(bad.status, 400);
  const res = await request(app)
    .post('/api/gl/voyageur/spells/plume/cast')
    .set(auth(p.token))
    .send({
      titre: 'La page du vent',
      texte: 'Le vent a plié les herbes vers la rivière, et les herbes ont montré le chemin.',
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.effect.statut, 'proposee');
  const plumeId = res.body.effect.plumeId;
  const list = await request(app)
    .get(`/api/gl/games/${ctx.game.id}/tenir/plumes`)
    .set(auth(ctx.adminToken));
  assert.ok(list.body.plumes.some((pl) => pl.id === plumeId));
  const ok = await request(app)
    .put(`/api/gl/games/${ctx.game.id}/tenir/plumes/${plumeId}`)
    .set(auth(ctx.adminToken))
    .send({ decision: 'valider' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const state = await queryOne(
    'SELECT status FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ?',
    [ctx.game.id, ctx.teams[0].id, ok.body.feuilletCode],
  );
  assert.equal(state.status, 'discovered', 'visible de toutes les équipes');
  const me = await request(app).get('/api/gl/voyageur/me').set(auth(p.token));
  assert.equal(me.body.grimoire.find((s) => s.code === 'plume').usedThisChapter, true);
});
