'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryAll, queryOne, withTransaction } = require('../database');
const { presentFeuilletZone } = require('../lib/glFeuilletZonePresent');
const { createTenirGame, readPlayerBourses, setGlSetting } = require('./helpers/glTenirFixtures');

let ctx;

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  // Même avec les coûts/gains de feuillets ACTIVÉS, la zone ne doit plus rien appliquer :
  // c'est la présentation du feuillet qui porte les siens (double débit § 7.3).
  await setGlSetting('gameplay.lore_gemme_costs_enabled', true);
  await setGlSetting('gameplay.lore_heart_rewards_enabled', true);
});

test('la traversée d’une zone feuillet n’applique plus cout_gemme / gain_coeur du JSON', async () => {
  const team = ctx.teams[0];
  const members = ctx.players.filter((p) => p.teamId === Number(team.id));
  const before = await Promise.all(members.map((m) => readPlayerBourses(m.id)));
  const result = await presentFeuilletZone(
    { queryAll, withTransaction },
    {
      gameId: Number(ctx.game.id),
      teamId: Number(team.id),
      zoneId: 'zf-test-double',
      feuilletCode: 'tenir-ex-p1-1',
      plateau: 1,
      titre: 'Zone test',
      coutGemme: 2,
      gainCoeur: 3,
      actorType: 'mj',
      actorId: String(ctx.admin.id),
      gameRow: ctx.game,
    },
  );
  assert.ok(result.presentEvent, JSON.stringify(result));
  assert.equal(result.coutGemme, 2, 'affichage conservé');
  assert.equal(result.gainCoeur, 3, 'affichage conservé');
  const after = await Promise.all(members.map((m) => readPlayerBourses(m.id)));
  assert.deepEqual(after, before, 'aucune bourse touchée par la traversée');
  const changes = await queryOne(
    "SELECT COUNT(*) AS c FROM gl_game_events WHERE game_id = ? AND event_type = 'vitality_change'",
    [ctx.game.id],
  );
  assert.equal(Number(changes.c), 0);
  await setGlSetting('gameplay.lore_gemme_costs_enabled', false);
  await setGlSetting('gameplay.lore_heart_rewards_enabled', false);
});
