'use strict';

/**
 * Grand livre des ressources (`gl_resource_ledger`, `lib/glBourses.js`) : une seule fonction
 * écrit les bourses (test anti-littéral), chaque mouvement est journalisé avec sa cause et les
 * soldes après coup, plafond et plancher appliqués, delta réellement appliqué renvoyé.
 * Fixtures anonymes.
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, queryAll, withTransaction } = db;
const { applyBourseDeltaTx, listLedger, sumLedgerByCause, CAUSES } = require('../lib/glBourses');
const {
  createTenirGame,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');

const ROOT = path.join(__dirname, '..');
let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
});

test('anti-littéral : aucun autre fichier que lib/glBourses.js n’écrit health_points / power_points', () => {
  const offenders = [];
  const re = /UPDATE\s+gl_players[\s\S]{0,200}?SET[\s\S]{0,200}?(health_points|power_points)\s*=/i;
  for (const file of [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'routes'))]) {
    const rel = path.relative(ROOT, file);
    if (rel === path.join('lib', 'glBourses.js')) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (re.test(src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test('applyBourseDeltaTx : plafond, plancher, delta appliqué, ligne du livre avec cause et soldes', async () => {
  const player = ctx.players[0];
  await setPlayerBourses(player.id, 7, 1);
  const caps = { maxHealth: 8, maxPower: 8 };
  const gain = await withTransaction((tx) =>
    applyBourseDeltaTx(tx, {
      gameId: ctx.game.id,
      playerId: player.id,
      dh: 3,
      dg: -2,
      cause: 'page_tenue',
      caps,
    }),
  );
  assert.deepEqual(
    { h: gain.health, p: gain.power, dh: gain.dhApplied, dg: gain.dgApplied },
    { h: 8, p: 0, dh: 1, dg: -1 },
    'plafond 8 et plancher 0 : delta réellement appliqué',
  );
  assert.equal(gain.healthCapped, true);
  assert.equal(gain.powerCapped, true);
  assert.ok(gain.ledgerId > 0);
  assert.deepEqual(await readPlayerBourses(player.id), { health: 8, power: 0 });
  const rows = await listLedger(db, { gameId: ctx.game.id, playerId: player.id, limit: 5 });
  assert.equal(rows[0].cause, 'page_tenue');
  assert.deepEqual(
    {
      dh: rows[0].deltaHealth,
      dg: rows[0].deltaPower,
      sh: rows[0].soldeHealthApres,
      sp: rows[0].soldePowerApres,
    },
    { dh: 1, dg: -1, sh: 8, sp: 0 },
  );
  // Cause inconnue → `defaut`, jamais une erreur.
  const autre = await withTransaction((tx) =>
    applyBourseDeltaTx(tx, {
      gameId: ctx.game.id,
      playerId: player.id,
      dh: 0,
      dg: 1,
      cause: 'inventee',
      caps,
    }),
  );
  assert.equal(autre.dgApplied, 1);
  const last = (await listLedger(db, { gameId: ctx.game.id, playerId: player.id, limit: 1 }))[0];
  assert.equal(last.cause, 'defaut');
  assert.ok(CAUSES.includes('chapardeur') && CAUSES.includes('sort_pot'));
});

test('geste du prof et page tenue passent par le livre avec leur cause', async () => {
  const player = ctx.players[1];
  await setPlayerBourses(player.id, 3, 3);
  const res = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/vitality/player`)
    .set(auth(ctx.adminToken))
    .send({ playerId: player.id, healthDelta: 1, powerDelta: 0, reason: 'test livre' });
  assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
  const rows = await queryAll(
    'SELECT cause, delta_health FROM gl_resource_ledger WHERE game_id = ? AND player_id = ? ORDER BY id DESC LIMIT 1',
    [ctx.game.id, player.id],
  );
  assert.equal(rows[0]?.cause, 'geste_prof');
  assert.equal(Number(rows[0]?.delta_health), 1);
  const parCause = await sumLedgerByCause(db, ctx.game.id);
  assert.ok(parCause.some((c) => c.cause === 'geste_prof' && c.count >= 1));
});
