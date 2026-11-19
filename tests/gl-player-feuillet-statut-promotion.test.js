'use strict';

/**
 * Audit G&L du 19/11/2026, constat C8 : « lu » et « tenu » n'atteignaient jamais le carnet
 * personnel. Le statut de `gl_player_feuillet_states` n'était remplacé que si le pourcentage
 * d'effacement BAISSAIT ; or une lecture ne change pas ce pourcentage. Le badge « Lecteur »
 * (`pages_lues`) et le compteur `feuillets_lus` ne voyaient donc jamais ces lectures.
 *
 * Règle attendue : le statut monte selon découvert < lu < tenu, indépendamment du
 * pourcentage ; il ne redescend jamais ; le pourcentage garde le minimum (`LEAST`).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');
const {
  mergePlayerFeuilletSnapshot,
  upsertFeuilletState,
  upsertPlayerFeuilletState,
} = require('../lib/glLoreFeuillets');
const { createMetricContext } = require('../lib/glRewardsMetrics');
const { TENIR_BADGE_SOURCES } = require('../lib/glTenirBadges');
const { glRewards } = require('../lib/glRewards');
const { setGlSetting } = require('./helpers/glTenirFixtures');
const { invalidateModulesCache } = require('../lib/glSettings');

const stamp = Date.now();
const CODES = [0, 1, 2, 3].map((i) => `c8-${stamp}-${i}`);
let playerToken = '';
let gameId = null;
let teamId = null;
let playerId = null;

async function playerStatus(code) {
  return queryOne(
    'SELECT status, effacement_pct FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
    [playerId, code],
  );
}

before(async () => {
  await initSchema();
  await setGlSetting('modules.rewards_enabled', true);
  invalidateModulesCache();
  const admin = await createGlAdmin({ email: `gl.c8.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe C8 ${stamp}`, adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const seed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: Number(chapter.id),
    createdBy: admin.id,
    teams: [{ name: 'Equipe C8', type: 'gnome' }],
  });
  gameId = Number(seed.game.id);
  teamId = Number(seed.teams[0].id);
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);
  const player = await createGlPlayer({ classId: cls.id, pseudo: `c8-${stamp}` });
  playerId = Number(player.id);
  await assignPlayerToGameTeam({ gameId, teamId, playerId });
  playerToken = (await signTokens({ playerId, teamId })).playerToken;

  for (const code of CODES) {
    await execute(
      `INSERT INTO gl_lore_feuillets (feuillet_code, titre, incipit, texte_accessible, biome_slug, ordre_voyage, tenir)
       VALUES (?, ?, 'Incipit', 'Texte', 'toundra', 950, 'Garde ce fil en tête.')`,
      [code, `Feuillet ${code}`],
    );
    await upsertFeuilletState(db, {
      gameId,
      teamId,
      feuilletCode: code,
      status: 'discovered',
      effacementPct: 0,
    });
  }
});

test('fusion : le statut monte découvert → lu → tenu à pourcentage égal', () => {
  const lu = mergePlayerFeuilletSnapshot(
    { status: 'discovered', effacement_pct: 40, acquired_via: 'decouverte' },
    { status: 'read', effacementPct: 40 },
  );
  assert.equal(lu.status, 'read');
  assert.equal(lu.effacementPct, 40);
  const tenu = mergePlayerFeuilletSnapshot(
    { status: 'read', effacement_pct: 40, acquired_via: 'decouverte' },
    { status: 'held', effacementPct: 40 },
  );
  assert.equal(tenu.status, 'held');
});

test('fusion : le statut monte même si la copie entrante est plus effacée (le pourcentage, lui, garde le minimum)', () => {
  const merged = mergePlayerFeuilletSnapshot(
    { status: 'discovered', effacement_pct: 10, acquired_via: 'decouverte' },
    { status: 'held', effacementPct: 60 },
  );
  assert.equal(merged.status, 'held');
  assert.equal(merged.effacementPct, 10);
});

test('fusion : jamais de retour en arrière, même avec une copie plus lisible', () => {
  const merged = mergePlayerFeuilletSnapshot(
    { status: 'held', effacement_pct: 50, acquired_via: 'decouverte' },
    { status: 'discovered', effacementPct: 0 },
  );
  assert.equal(merged.status, 'held');
  assert.equal(merged.effacementPct, 0);
  const lu = mergePlayerFeuilletSnapshot(
    { status: 'held', effacement_pct: 0, acquired_via: 'decouverte' },
    { status: 'read', effacementPct: 0 },
  );
  assert.equal(lu.status, 'held');
});

test('fusion : « effacé » garde sa règle d’avant (seule une copie plus lisible le remplace)', () => {
  const reste = mergePlayerFeuilletSnapshot(
    { status: 'effaced', effacement_pct: 100, acquired_via: 'decouverte' },
    { status: 'read', effacementPct: 100 },
  );
  assert.equal(reste.status, 'effaced');
  const remplace = mergePlayerFeuilletSnapshot(
    { status: 'effaced', effacement_pct: 100, acquired_via: 'decouverte' },
    { status: 'read', effacementPct: 30 },
  );
  assert.deepEqual([remplace.status, remplace.effacementPct], ['read', 30]);
  const ignore = mergePlayerFeuilletSnapshot(
    { status: 'read', effacement_pct: 20, acquired_via: 'decouverte' },
    { status: 'effaced', effacementPct: 100 },
  );
  assert.deepEqual([ignore.status, ignore.effacementPct], ['read', 20]);
});

test('SQL : le filet atomique applique le même ordre, sans dépendre de la lecture préalable', async () => {
  const code = CODES[3];
  // Lecture préalable neutralisée : seul le ON DUPLICATE KEY UPDATE décide.
  const blind = { queryOne: async () => null, execute: db.execute };
  const write = (status, effacementPct) =>
    upsertPlayerFeuilletState(blind, { playerId, feuilletCode: code, status, effacementPct });

  await write('read', 0);
  assert.equal((await playerStatus(code)).status, 'read', 'découvert → lu à pourcentage égal');
  await write('held', 40);
  assert.deepEqual(
    { ...(await playerStatus(code)) },
    { status: 'held', effacement_pct: 0 },
    'lu → tenu ; le pourcentage garde le minimum',
  );
  await write('discovered', 0);
  assert.equal((await playerStatus(code)).status, 'held', 'jamais de retour en arrière');
  await write('effaced', 100);
  assert.deepEqual({ ...(await playerStatus(code)) }, { status: 'held', effacement_pct: 0 });
});

test('POST …/read puis …/hold : le carnet du joueur suit, et le badge « Lecteur » avance', async () => {
  const value = (metric) => createMetricContext(db, playerId).value(metric);
  const avant = await value('pages_lues');
  const avantTenir = await TENIR_BADGE_SOURCES.feuillets_lus(db, playerId);
  assert.equal((await playerStatus(CODES[0])).status, 'discovered');

  for (const code of CODES.slice(0, 3)) {
    await request(app)
      .post(`/api/gl/lore/games/${gameId}/feuillets/${code}/read`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ teamId })
      .expect(200);
    assert.equal((await playerStatus(code)).status, 'read', `carnet personnel : ${code} lu`);
  }
  assert.equal(await value('pages_lues'), avant + 3);
  assert.equal(await TENIR_BADGE_SOURCES.feuillets_lus(db, playerId), avantTenir + 3);

  const awarded = await glRewards.evaluate(String(playerId), { families: ['lecture'] });
  assert.ok(
    awarded.some((r) => r.key === 'lecture.pages.1'),
    'trois pages lues : premier palier du badge « Lecteur »',
  );

  await request(app)
    .post(`/api/gl/lore/games/${gameId}/feuillets/${CODES[0]}/hold`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ teamId })
    .expect(200);
  assert.equal((await playerStatus(CODES[0])).status, 'held');
  assert.equal(await value('pages_lues'), avant + 3, 'tenu compte toujours comme lu');
});
