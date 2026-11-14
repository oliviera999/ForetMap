'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const {
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  createGlMascotPackPool,
} = require('./helpers/glFixtures');
const { createTenirGame, ensureTenirCorpus } = require('./helpers/glTenirFixtures');
const {
  buildPeopleConstraintForPlateau,
  splitPoolByPeople,
  composeWithPeopleConstraint,
  createSeededRng,
} = require('../lib/gl/teamComposition');

let ctx;
let previousTypes;

// Catalogue de mascottes G&L = packs publiés du studio ForêtMap : la suite sème son vivier.
let mascotPool = null;

before(async () => {
  await initSchema();
  mascotPool = await createGlMascotPackPool({ gnomes: 4, unicorns: 4 });
  // Partie courante : plateau 2, brouillon. Partie précédente de la classe : plateau 1, terminée.
  ctx = await createTenirGame({ plateau: 2, status: 'draft', stamp: Date.now() });
  const { chapters } = await ensureTenirCorpus();
  const previous = await createGlGameWithTeams({
    classId: ctx.cls.id,
    chapterId: chapters[1].chapter.id,
    createdBy: ctx.admin.id,
    status: 'ended',
    name: `Partie précédente ${Date.now()}`,
    teams: [
      { name: 'G1', type: 'gnome' },
      { name: 'G2', type: 'gnome' },
      { name: 'L1', type: 'unicorn' },
      { name: 'L2', type: 'unicorn' },
    ],
  });
  previousTypes = new Map();
  ctx.players.forEach((p, idx) => {
    const team = previous.teams[idx % 4];
    previousTypes.set(p.id, team.type);
  });
  for (const p of ctx.players) {
    const team = previous.teams.find((t) => t.type === previousTypes.get(p.id));
    await assignPlayerToGameTeam({ gameId: previous.game.id, teamId: team.id, playerId: p.id });
  }
  // La partie courante n'a pas encore d'équipes (la composition les crée).
  await execute('DELETE FROM gl_team_members WHERE game_id = ?', [ctx.game.id]);
  await execute('DELETE FROM gl_teams WHERE game_id = ?', [ctx.game.id]);
  // Un joueur hors historique (arrivé en cours d'année) : libre.
  const { createGlPlayer } = require('./helpers/glFixtures');
  const newcomer = await createGlPlayer({
    classId: ctx.cls.id,
    pseudo: `joueur-nouveau-${Date.now()}`,
  });
  ctx.newcomerId = Number(newcomer.id);
});

test('noyau pur : plateau pair ⇒ peuple opposé ; plateau impair ⇒ libre ; viviers équilibrés', () => {
  const history = [
    {
      plateauNumber: 1,
      teams: [
        { type: 'gnome', memberIds: [1, 2] },
        { type: 'unicorn', memberIds: [3, 4] },
      ],
    },
  ];
  const c2 = buildPeopleConstraintForPlateau(history, 2);
  assert.deepEqual(
    [...c2],
    [
      [1, 'unicorn'],
      [2, 'unicorn'],
      [3, 'gnome'],
      [4, 'gnome'],
    ],
  );
  assert.equal(buildPeopleConstraintForPlateau(history, 3).size, 0);
  assert.equal(buildPeopleConstraintForPlateau([], 2).size, 0);
  const pools = splitPoolByPeople({
    players: [1, 2, 3, 4, 5, 6],
    constraint: c2,
    rng: createSeededRng(3),
  });
  assert.equal(pools.gnome.length, 3);
  assert.equal(pools.unicorn.length, 3);
  const composed = composeWithPeopleConstraint({
    players: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    constraint: c2,
    rng: createSeededRng(1),
  });
  assert.deepEqual(composed.types, ['gnome', 'gnome', 'unicorn', 'unicorn']);
  const sizes = composed.slots.map((s) => s.length).sort();
  assert.deepEqual(sizes, [2, 2, 2, 3]);
});

test('aperçu de composition : 4 équipes 2/2, peuple inversé depuis le chapitre précédent (dur)', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/teams/compose/preview`)
    .set('Authorization', `Bearer ${ctx.adminToken}`)
    .send({ recipe: 'carry_over' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.teamCount, 4);
  assert.deepEqual(
    res.body.teams.map((t) => t.type),
    ['gnome', 'gnome', 'unicorn', 'unicorn'],
  );
  assert.notEqual(res.body.recipe, 'carry_over', 'rebrassage à chaque chapitre');
  for (const team of res.body.teams) {
    for (const member of team.members) {
      const previous = previousTypes.get(Number(member.playerId));
      if (!previous) continue;
      assert.notEqual(team.type, previous, `joueur ${member.playerId} change de peuple`);
    }
  }
  const sizes = res.body.teams.map((t) => t.members.length);
  assert.equal(Math.max(...sizes) - Math.min(...sizes) <= 1, true);
  assert.ok(res.body.warnings.some((w) => w.code === 'TENIR_PEOPLE_INVERTED'));
  assert.ok(res.body.warnings.some((w) => w.code === 'TENIR_FOUR_TEAMS'));
  assert.ok(
    res.body.teams.every((t) => t.mascotId),
    'mascottes typées proposées',
  );
});

after(async () => {
  await mascotPool?.cleanup();
});
