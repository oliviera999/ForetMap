'use strict';

// Historique des équipes d'une classe — lib/glTeamCompositionHistory.js.
// Partie pure (buildPairHistory, computeMixingRate) + lecture BDD (loadClassTeamHistory).
require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, execute } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
} = require('./helpers/glFixtures');
const {
  loadClassTeamHistory,
  loadPairHistory,
  buildPairHistory,
  computeMixingRate,
} = require('../lib/glTeamCompositionHistory');
const { pairKey } = require('../lib/gl/teamComposition');

test('buildPairHistory pondère par 0.8^rang et cumule les paires', () => {
  const games = [
    { gameId: 2, rank: 0, teams: [{ memberIds: [1, 2, 3] }] },
    { gameId: 1, rank: 1, teams: [{ memberIds: [1, 2] }, { memberIds: [3, 4] }] },
  ];
  const pairs = buildPairHistory(games);
  assert.ok(Math.abs(pairs.get(pairKey(1, 2)) - 1.8) < 1e-9);
  assert.equal(pairs.get(pairKey(1, 3)), 1);
  assert.equal(pairs.get(pairKey(3, 4)), 0.8);
  assert.equal(pairs.get(pairKey(1, 4)), undefined);
  assert.equal(buildPairHistory([]).size, 0);
});

test('computeMixingRate : paires vues / paires possibles entre joueurs actifs', () => {
  const games = [{ gameId: 1, rank: 0, teams: [{ memberIds: [1, 2] }, { memberIds: [3, 4] }] }];
  const rate = computeMixingRate(games, [1, 2, 3, 4]);
  assert.equal(rate.pairsPossible, 6);
  assert.equal(rate.pairsSeen, 2);
  assert.ok(Math.abs(rate.rate - 2 / 6) < 1e-9);
  // Joueur 4 parti : sa paire ne compte plus.
  assert.equal(computeMixingRate(games, [1, 2, 3]).pairsSeen, 1);
  assert.equal(computeMixingRate([], [1]).rate, null);
});

let cls;
let admin;
let chapter;
let p = [];
let games = [];

before(async () => {
  await initSchema();
  const stamp = Date.now();
  admin = await createGlAdmin({ email: `hist-${stamp}@ecole.local` });
  cls = await createGlClass({ name: `Classe hist ${stamp}`, adminId: admin.id });
  ({ chapter } = await createGlChapterWithMarker({ slug: `hist-ch-${stamp}` }));
  p = [];
  for (let i = 0; i < 4; i += 1) {
    p.push(await createGlPlayer({ classId: cls.id, pseudo: `hist-${stamp}-${i}` }));
  }
  games = [];
  for (let g = 0; g < 3; g += 1) {
    const game = await createGlGameWithTeams({
      classId: cls.id,
      chapterId: chapter.id,
      createdBy: admin.id,
      status: 'ended',
      name: `Hist ${g} ${stamp}`,
      teams: [
        { name: `A${g}`, type: 'gnome' },
        { name: `B${g}`, type: 'unicorn' },
      ],
    });
    games.push(game);
    // Partie 0 et 1 : {0,1} {2,3} ; partie 2 : {0,2} {1,3}.
    const split =
      g < 2
        ? [
            [0, 1],
            [2, 3],
          ]
        : [
            [0, 2],
            [1, 3],
          ];
    for (let t = 0; t < 2; t += 1) {
      for (const idx of split[t]) {
        await assignPlayerToGameTeam({
          gameId: game.game.id,
          teamId: game.teams[t].id,
          playerId: p[idx].id,
        });
      }
    }
  }
  // Une partie sans équipe ne compte pas dans l'historique.
  await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Hist vide ${stamp}`,
  });
});

test('loadClassTeamHistory : parties les plus récentes d’abord, équipes et membres, exclusion', async () => {
  const history = await loadClassTeamHistory({ classId: cls.id });
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((g) => g.gameId),
    games.map((g) => Number(g.game.id)).reverse(),
  );
  assert.deepEqual(
    history.map((g) => g.rank),
    [0, 1, 2],
  );
  assert.equal(history[0].teams.length, 2);
  assert.equal(history[0].teams[0].type, 'gnome');
  assert.deepEqual(
    history[0].teams.map((t) => t.memberIds.length),
    [2, 2],
  );

  const limited = await loadClassTeamHistory({ classId: cls.id, maxGames: 1 });
  assert.equal(limited.length, 1);
  const excluded = await loadClassTeamHistory({
    classId: cls.id,
    excludeGameId: games[2].game.id,
  });
  assert.equal(excluded.length, 2);
  assert.deepEqual(await loadClassTeamHistory({ classId: 0 }), []);
});

test('loadPairHistory : la paire {0,1} pèse 0.8 + 0.64, la paire {0,2} pèse 1', async () => {
  const pairs = await loadPairHistory({ classId: cls.id });
  const id = (i) => Number(p[i].id);
  assert.ok(Math.abs(pairs.get(pairKey(id(0), id(1))) - (0.8 + 0.64)) < 1e-9);
  assert.equal(pairs.get(pairKey(id(0), id(2))), 1);
  assert.equal(pairs.get(pairKey(id(0), id(3))), undefined);
  const rate = computeMixingRate(
    await loadClassTeamHistory({ classId: cls.id, maxGames: 0 }),
    p.map((x) => x.id),
  );
  assert.equal(rate.pairsSeen, 4);
  assert.equal(rate.pairsPossible, 6);
  await execute('UPDATE gl_games SET status = ? WHERE class_id = ?', ['ended', cls.id]);
});
