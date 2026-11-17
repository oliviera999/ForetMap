'use strict';

/**
 * « Tenir à deux » v2 — grimoire du voyageur réaligné (spec § 10) : un usage par partie, Flair
 * (fouille personnelle en veillée : verdict seulement, empreinte partagée, jamais de question),
 * Messager refusé. Ensemble unifié (M23) : la Plume est sortie (une page d'élève passe par le
 * sort Lettre, `tests/gl-ensemble-unifie-mentorat-lettre.test.js`) et « Seconde chance » n'existe
 * que si un délai d'attente est réglé — restent Loupe, Mémoire, Flair.
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

test('niveaux : Loupe 2, Mémoire 3, Flair 4, Messager 6 (hors périmètre) ; ni Plume ni Seconde chance', async () => {
  const me = await request(app).get('/api/gl/voyageur/me').set(auth(ctx.players[0].token));
  assert.equal(me.status, 200, JSON.stringify(me.body));
  const levels = Object.fromEntries(me.body.grimoire.map((s) => [s.code, s.levelRequired]));
  assert.deepEqual(levels, { loupe: 2, memoire: 3, flair: 4, messager: 6 });
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

test('Plume : sortie du grimoire du voyageur (une page d’élève passe par le sort Lettre)', async () => {
  const p = ctx.players[3];
  await addAcks(p.id, 'species', 50, 'plume'); // niveau ≥ 5 : l'ancien seuil de la Plume
  const res = await request(app)
    .post('/api/gl/voyageur/spells/plume/cast')
    .set(auth(p.token))
    .send({ target: 'x' });
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal(res.body.code, 'UNKNOWN_SPELL');
  const me = await request(app).get('/api/gl/voyageur/me').set(auth(p.token));
  assert.equal(
    me.body.grimoire.find((s) => s.code === 'plume'),
    undefined,
  );
  assert.equal(me.body.lettre, null, 'aucune Lettre tant que le sort n’est pas lancé');
});
