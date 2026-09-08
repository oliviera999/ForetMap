'use strict';

// Composition automatique des équipes GL — lot v3 : verrous de paires par classe
// (GET/POST/DELETE /api/gl/admin/classes/:id/pairing-locks), politique d'équipes de la classe
// (PUT /api/gl/admin/classes/:id), contraintes dans l'aperçu (verrous, épingles), rotation des
// peuples, plancher de vitalité et indicateur de brassage.
require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');
const {
  normalizePair,
  loadLocksForEngine,
  upsertPairingLock,
  GlPairingLockError,
} = require('../lib/glClassPairingLocks');
const {
  computeComposition,
  createSeededRng,
  buildPeopleStreaks,
  choosePeopleStart,
  LOCK_VIOLATION_PENALTY,
} = require('../lib/gl/teamComposition');
const { resolveDefaultRecipe } = require('../lib/glTeamComposition');

const stamp = Date.now();
let admin;
let cls;
let otherClass;
let players = [];
let intruder;
let chapter;
let draftGame;
let token;
let playerToken;

const locksUrl = (classId) => `/api/gl/admin/classes/${classId}/pairing-locks`;
const previewUrl = (gameId) => `/api/gl/games/${gameId}/teams/compose/preview`;
const ids = (list) => list.map((p) => Number(p.id));
const slotOf = (proposal, playerId) =>
  proposal.teams.findIndex((t) => t.members.some((m) => Number(m.playerId) === Number(playerId)));

before(async () => {
  await initSchema();
  admin = await createGlAdmin({ email: `locks-${stamp}@ecole.local` });
  cls = await createGlClass({ name: `Classe verrous ${stamp}`, adminId: admin.id });
  otherClass = await createGlClass({ name: `Classe autre verrous ${stamp}`, adminId: admin.id });
  ({ chapter } = await createGlChapterWithMarker({
    slug: `locks-ch-${stamp}`,
    title: 'La Lande des Brumes',
  }));
  players = [];
  for (let i = 0; i < 8; i += 1) {
    players.push(
      await createGlPlayer({
        classId: cls.id,
        pseudo: `locks-${stamp}-${i}`,
        firstName: `L${i}`,
        lastName: `V${i}`,
      }),
    );
  }
  intruder = await createGlPlayer({ classId: otherClass.id, pseudo: `locks-intrus-${stamp}` });
  draftGame = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie verrous ${stamp}`,
    teams: [],
  });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.team.manage', 'gl.players.manage'],
    playerId: players[0].id,
  });
  token = tokens.adminToken;
  playerToken = tokens.playerToken;
});

// ---------------------------------------------------------------------------------------------
// Pur
// ---------------------------------------------------------------------------------------------

test('normalizePair : ordonne, refuse identiques et invalides', () => {
  assert.deepEqual(normalizePair(7, 3), [3, 7]);
  assert.deepEqual(normalizePair('3', '7'), [3, 7]);
  assert.equal(normalizePair(4, 4), null);
  assert.equal(normalizePair(0, 4), null);
  assert.equal(normalizePair('x', 4), null);
});

test('moteur : verrous « ensemble » et « séparés » respectés sur 40 graines, épingles fixes', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ({ playerId: 100 + i }));
  const locks = {
    together: [
      [100, 101],
      [102, 103],
    ],
    apart: [
      [100, 104],
      [105, 106],
    ],
  };
  for (let seed = 1; seed <= 40; seed += 1) {
    const out = computeComposition({
      players: pool,
      teamCount: 3,
      weights: { size: 1, repeat: 0.6 },
      pairHistory: new Map([['100-102', 1]]),
      rng: createSeededRng(seed),
      locks,
      pins: [{ playerId: 107, slot: 2 }],
    });
    const where = new Map();
    out.slots.forEach((team, idx) => team.forEach((pid) => where.set(pid, idx)));
    assert.equal(out.raw.lockViolations, 0, `graine ${seed}`);
    assert.equal(where.get(100), where.get(101));
    assert.equal(where.get(102), where.get(103));
    assert.notEqual(where.get(100), where.get(104));
    assert.notEqual(where.get(105), where.get(106));
    assert.equal(where.get(107), 2, 'épingle');
    assert.ok(
      out.slots.every((t) => t.length === 4),
      'effectifs 4/4/4',
    );
    assert.ok(out.cost < LOCK_VIOLATION_PENALTY);
  }
});

test('moteur : verrous incompatibles ⇒ violations comptées, pas de plantage', () => {
  const pool = Array.from({ length: 4 }, (_, i) => ({ playerId: 200 + i }));
  // A avec B, B avec C, mais A séparé de C : impossible.
  const out = computeComposition({
    players: pool,
    teamCount: 2,
    weights: { size: 1 },
    rng: createSeededRng(3),
    locks: {
      together: [
        [200, 201],
        [201, 202],
      ],
      apart: [[200, 202]],
    },
  });
  assert.ok(out.raw.lockViolations >= 1);
  assert.equal(out.slots.flat().length, 4);
});

test('moteur : plancher de vitalité pousse un porteur de cœurs dans chaque équipe', () => {
  const pool = Array.from({ length: 6 }, (_, i) => ({ playerId: 300 + i }));
  const profiles = new Map(pool.map((p) => [p.playerId, { hearts: 0, gems: 0 }]));
  profiles.set(300, { hearts: 3, gems: 0 });
  profiles.set(301, { hearts: 0, gems: 2 });
  profiles.set(302, { hearts: 1, gems: 1 });
  for (let seed = 1; seed <= 20; seed += 1) {
    const out = computeComposition({
      players: pool,
      teamCount: 3,
      weights: { size: 1, vitality: 1 },
      rng: createSeededRng(seed),
      profiles,
      vitalityFloor: 1,
    });
    assert.equal(out.raw.vitality, 0, `graine ${seed}`);
    for (const team of out.slots) {
      const total = team.reduce(
        (acc, pid) => acc + profiles.get(pid).hearts + profiles.get(pid).gems,
        0,
      );
      assert.ok(total >= 1);
    }
  }
});

test('buildPeopleStreaks / choosePeopleStart : rotation des peuples', () => {
  // Historique (plus récent d'abord) : 1 et 2 gnomes deux fois de suite ; 3 licorne puis gnome.
  const history = [
    {
      rank: 0,
      teams: [
        { type: 'gnome', memberIds: [1, 2] },
        { type: 'unicorn', memberIds: [3, 4] },
      ],
    },
    {
      rank: 1,
      teams: [
        { type: 'gnome', memberIds: [1, 2, 3] },
        { type: 'unicorn', memberIds: [4] },
      ],
    },
  ];
  const streaks = buildPeopleStreaks(history);
  assert.deepEqual(streaks.get(1), { type: 'gnome', streak: 2 });
  assert.deepEqual(streaks.get(3), { type: 'unicorn', streak: 1 });
  assert.deepEqual(streaks.get(4), { type: 'unicorn', streak: 2 });
  // Équipe 0 = {1, 2}, équipe 1 = {3, 4} : commencer par gnome ferait 2 troisièmes tours (1, 2)
  // + 4 en licorne ⇒ 3 ; commencer par licorne ⇒ 0.
  const choice = choosePeopleStart({
    slots: [
      [1, 2],
      [3, 4],
    ],
    streaks,
  });
  assert.equal(choice.startWith, 'unicorn');
  assert.equal(choice.thirdStreaks, 0);
  assert.equal(choice.alternative, 3);
  // Égalité ⇒ gnome.
  assert.equal(choosePeopleStart({ slots: [[9], [8]], streaks: new Map() }).startWith, 'gnome');
});

test('resolveDefaultRecipe : politique de classe ⇒ recette', () => {
  const prev = (plateau) => [{ rank: 0, plateauNumber: plateau, teams: [{ memberIds: [1, 2] }] }];
  assert.equal(resolveDefaultRecipe({ policy: 'carry_over', history: prev(1) }), 'carry_over');
  assert.equal(resolveDefaultRecipe({ policy: 'carry_over', history: [] }), 'random');
  assert.equal(
    resolveDefaultRecipe({ policy: 'reshuffle_each', history: prev(1) }),
    'random_memory',
  );
  assert.equal(resolveDefaultRecipe({ policy: 'reshuffle_each', history: [] }), 'random');
  assert.equal(
    resolveDefaultRecipe({ policy: 'reshuffle_per_plateau', history: prev(2), plateauNumber: 2 }),
    'carry_over',
  );
  assert.equal(
    resolveDefaultRecipe({ policy: 'reshuffle_per_plateau', history: prev(1), plateauNumber: 2 }),
    'random_memory',
  );
  assert.equal(resolveDefaultRecipe({ policy: 'inconnue', history: prev(1) }), 'random_memory');
});

// ---------------------------------------------------------------------------------------------
// Routes verrous
// ---------------------------------------------------------------------------------------------

test('pairing-locks : 401 sans jeton, 403 joueur, 404 classe inconnue', async () => {
  await request(app).get(locksUrl(cls.id)).expect(401);
  await request(app)
    .get(locksUrl(cls.id))
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
  const nf = await request(app)
    .get(locksUrl(999999999))
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
  assert.equal(nf.body.code, 'CLASS_NOT_FOUND');
});

test('pairing-locks : CRUD, remplacement de type, refus joueur hors classe / identique', async () => {
  const [a, b, c] = ids(players);
  const created = await request(app)
    .post(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ playerAId: b, playerBId: a, kind: 'together' })
    .expect(201);
  assert.equal(created.body.created, true);
  assert.equal(created.body.lock.kind, 'together');
  assert.equal(created.body.lock.playerLowId, Math.min(a, b));
  assert.equal(created.body.lock.playerHighId, Math.max(a, b));
  assert.equal(created.body.lock.players.length, 2);
  assert.ok(created.body.lock.players.every((p) => p.pseudo && p.firstName));

  // Même paire, même type : idempotent (200, created:false).
  const same = await request(app)
    .post(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ playerIds: [a, b], kind: 'together' })
    .expect(200);
  assert.equal(same.body.created, false);
  assert.equal(same.body.lock.id, created.body.lock.id);

  // Autre type sans remplacement : 409 ; avec remplacement (défaut) : même ligne, type changé.
  const conflict = await request(app)
    .post(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ playerAId: a, playerBId: b, kind: 'apart', replace: false })
    .expect(409);
  assert.equal(conflict.body.code, 'LOCK_CONFLICT');
  const replaced = await request(app)
    .post(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ playerAId: a, playerBId: b, kind: 'apart' })
    .expect(200);
  assert.equal(replaced.body.lock.id, created.body.lock.id);
  assert.equal(replaced.body.lock.kind, 'apart');

  // Validation.
  const badKind = await request(app)
    .post(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ playerAId: a, playerBId: c, kind: 'friends' })
    .expect(400);
  assert.equal(badKind.body.code, 'INVALID_KIND');
  const samePlayer = await request(app)
    .post(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ playerAId: a, playerBId: a, kind: 'apart' })
    .expect(400);
  assert.equal(samePlayer.body.code, 'INVALID_PLAYERS');
  const outsider = await request(app)
    .post(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ playerAId: a, playerBId: intruder.id, kind: 'apart' })
    .expect(400);
  assert.equal(outsider.body.code, 'INVALID_PLAYERS');

  // Liste.
  const list = await request(app)
    .get(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(list.body.locks.length, 1);
  assert.equal(list.body.locks[0].kind, 'apart');

  // Suppression cross-classe refusée, puis suppression réelle.
  const cross = await request(app)
    .delete(`${locksUrl(otherClass.id)}/${created.body.lock.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
  assert.equal(cross.body.code, 'LOCK_NOT_FOUND');
  await request(app)
    .delete(`${locksUrl(cls.id)}/${created.body.lock.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const after = await request(app)
    .get(locksUrl(cls.id))
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(after.body.locks.length, 0);
});

test('upsertPairingLock (lib) : erreurs typées', async () => {
  await assert.rejects(
    upsertPairingLock({ classId: 999999999, playerAId: 1, playerBId: 2, kind: 'apart' }),
    (err) => err instanceof GlPairingLockError && err.status === 404,
  );
});

// ---------------------------------------------------------------------------------------------
// Aperçu : verrous, épingles, verrous ignorés, brassage
// ---------------------------------------------------------------------------------------------

test('preview : les verrous de la classe sont appliqués ; verrou sur inactif ignoré et signalé', async () => {
  const [a, b, c, d] = ids(players);
  await execute('DELETE FROM gl_class_pairing_locks WHERE class_id = ?', [cls.id]);
  await upsertPairingLock({ classId: cls.id, playerAId: a, playerBId: b, kind: 'together' });
  await upsertPairingLock({ classId: cls.id, playerAId: c, playerBId: d, kind: 'apart' });
  // Verrou vers un joueur rendu inactif : ignoré.
  const inactive = ids(players)[7];
  await execute('UPDATE gl_players SET is_active = 0 WHERE id = ?', [inactive]);
  await upsertPairingLock({ classId: cls.id, playerAId: a, playerBId: inactive, kind: 'apart' });

  const engineLocks = await loadLocksForEngine({
    classId: cls.id,
    poolIds: ids(players).slice(0, 7),
  });
  assert.equal(engineLocks.total, 3);
  assert.equal(engineLocks.ignored, 1);
  assert.equal(engineLocks.together.length, 1);
  assert.equal(engineLocks.apart.length, 1);

  for (const seed of ['brume-1', 'sente-2', 'givre-3']) {
    const res = await request(app)
      .post(previewUrl(draftGame.game.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ recipe: 'random', teamCount: 3, seed })
      .expect(200);
    const p = res.body;
    assert.equal(slotOf(p, a), slotOf(p, b), `ensemble (${seed})`);
    assert.notEqual(slotOf(p, c), slotOf(p, d), `séparés (${seed})`);
    assert.ok(p.warnings.some((w) => w.code === 'LOCKS_IGNORED' && w.ignored === 1));
    assert.ok(!p.warnings.some((w) => w.code === 'LOCKS_UNSATISFIED'));
    assert.equal(p.locks.together.length, 1);
    assert.equal(p.locks.apart.length, 1);
    assert.ok(p.explain.some((line) => /Contraintes prises en compte/.test(line)));
  }
  await execute('UPDATE gl_players SET is_active = 1 WHERE id = ?', [inactive]);
  await execute('DELETE FROM gl_class_pairing_locks WHERE class_id = ?', [cls.id]);
});

test('preview : épingles respectées et marquées ; 400 INVALID_PINS hors pool ou équipe', async () => {
  const [a, , , , e] = ids(players);
  const res = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({
      recipe: 'random_memory',
      teamCount: 2,
      seed: 'racine-7',
      pins: [
        { playerId: a, slot: 1 },
        { playerId: e, slot: 0 },
      ],
    })
    .expect(200);
  assert.equal(slotOf(res.body, a), 1);
  assert.equal(slotOf(res.body, e), 0);
  const pinnedA = res.body.teams[1].members.find((m) => m.playerId === a);
  assert.equal(pinnedA.pinned, true);
  assert.equal(res.body.teams.flatMap((t) => t.members).filter((m) => m.pinned).length, 2);
  assert.deepEqual(res.body.pins, [
    { playerId: a, slot: 1 },
    { playerId: e, slot: 0 },
  ]);

  const outOfPool = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'random', teamCount: 2, pins: [{ playerId: intruder.id, slot: 0 }] })
    .expect(400);
  assert.equal(outOfPool.body.code, 'INVALID_PINS');
  const outOfRange = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'random', teamCount: 2, pins: [{ playerId: a, slot: 5 }] })
    .expect(400);
  assert.equal(outOfRange.body.code, 'INVALID_PINS');
});

test('preview : startWith explicite respecté ; sinon rotation des peuples d’après l’historique', async () => {
  // Partie précédente : tous les joueurs 0..7 en gnome deux fois ⇒ la rotation doit ouvrir en
  // licorne pour la moitié… ici tout le monde a une série gnome ⇒ commencer par unicorn ne
  // change rien au total (symétrie) : on vérifie surtout le forçage et la structure.
  const forced = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'random', teamCount: 2, seed: 'aube-9', startWith: 'unicorn' })
    .expect(200);
  assert.equal(forced.body.startWith, 'unicorn');
  assert.deepEqual(
    forced.body.teams.map((t) => t.type),
    ['unicorn', 'gnome'],
  );

  // Historique asymétrique : joueurs 0..3 en gnome sur 2 parties, 4..7 en licorne.
  const [g1, g2] = await Promise.all([
    createGlGameWithTeams({
      classId: cls.id,
      chapterId: chapter.id,
      createdBy: admin.id,
      status: 'ended',
      name: `Rotation 1 ${stamp}`,
      teams: [
        { name: 'G', type: 'gnome' },
        { name: 'U', type: 'unicorn' },
      ],
    }),
    createGlGameWithTeams({
      classId: cls.id,
      chapterId: chapter.id,
      createdBy: admin.id,
      status: 'ended',
      name: `Rotation 2 ${stamp}`,
      teams: [
        { name: 'G', type: 'gnome' },
        { name: 'U', type: 'unicorn' },
      ],
    }),
  ]);
  for (const g of [g1, g2]) {
    for (let i = 0; i < 8; i += 1) {
      await assignPlayerToGameTeam({
        gameId: g.game.id,
        teamId: g.teams[i < 4 ? 0 : 1].id,
        playerId: players[i].id,
      });
    }
  }
  // On épingle le groupe gnome historique dans l'équipe 0 : la rotation doit ouvrir en licorne.
  const pins = players.slice(0, 4).map((p) => ({ playerId: Number(p.id), slot: 0 }));
  const rotated = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'random', teamCount: 2, seed: 'lueur-3', pins })
    .expect(200);
  assert.equal(rotated.body.startWith, 'unicorn');
  assert.equal(rotated.body.teams[0].type, 'unicorn');
  const rot = rotated.body.warnings.find((w) => w.code === 'PEOPLE_ROTATION');
  assert.ok(rot, 'avertissement PEOPLE_ROTATION');
  assert.equal(rot.thirdStreaks, 0);
  assert.equal(rot.alternative, 8);
  // Sans épingle, l'algorithme choisit lui aussi la parité qui minimise les 3ᵉ tours.
  const free = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'random', teamCount: 2, seed: 'lueur-3' })
    .expect(200);
  const w = free.body.warnings.find((x) => x.code === 'PEOPLE_ROTATION');
  if (w) assert.ok(w.thirdStreaks < w.alternative);
});

test('preview : brassage avant/après et route mixing-rate', async () => {
  const res = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'random_memory', teamCount: 2, seed: 'ecume-5' })
    .expect(200);
  const { mixing } = res.body;
  assert.ok(mixing.before && mixing.after);
  // 8 actifs ⇒ 28 paires possibles ; l'historique (2 parties, équipes de 4) a réuni 12 paires.
  assert.equal(mixing.before.pairsPossible, 28);
  assert.equal(mixing.before.pairsSeen, 12);
  assert.ok(mixing.after.pairsSeen >= mixing.before.pairsSeen);
  assert.ok(mixing.after.rate >= mixing.before.rate);
  assert.ok(res.body.explain.some((line) => /Brassage de la classe/.test(line)));
  // random_memory doit créer des binômes inédits.
  assert.ok(res.body.stats.newPairs > 0);

  const rate = await request(app)
    .get(`/api/gl/games/${draftGame.game.id}/teams/compose/mixing-rate`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(rate.body.classId, cls.id);
  assert.equal(rate.body.activePlayers, 8);
  assert.equal(rate.body.pairsSeen, 12);
  assert.equal(rate.body.gamesCount, 2);
  assert.equal(rate.body.includesCurrentGame, false);
  assert.ok(Math.abs(rate.body.rate - 12 / 28) < 1e-9);
  await request(app)
    .get(`/api/gl/games/${draftGame.game.id}/teams/compose/mixing-rate`)
    .expect(401);
  await request(app)
    .get(`/api/gl/games/999999999/teams/compose/mixing-rate`)
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
});

// ---------------------------------------------------------------------------------------------
// Politique de classe
// ---------------------------------------------------------------------------------------------

test('PUT /admin/classes/:id : teamPolicy / teamSizeDefault validés, exposés dans la liste', async () => {
  const bad = await request(app)
    .put(`/api/gl/admin/classes/${cls.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ teamPolicy: 'chaos' })
    .expect(400);
  assert.match(bad.body.error, /Politique/);
  const badSize = await request(app)
    .put(`/api/gl/admin/classes/${cls.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ teamSizeDefault: 1 })
    .expect(400);
  assert.match(badSize.body.error, /Taille/);

  await request(app)
    .put(`/api/gl/admin/classes/${cls.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ teamPolicy: 'carry_over', teamSizeDefault: 3 })
    .expect(200);
  const list = await request(app)
    .get('/api/gl/admin/classes')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const row = list.body.find((c) => Number(c.id) === Number(cls.id));
  assert.ok(row, 'classe listée');
  assert.equal(row.team_policy, 'carry_over');
  assert.equal(Number(row.team_size_default), 3);
  const defaults = list.body.find((c) => Number(c.id) === Number(otherClass.id));
  assert.equal(defaults.team_policy, 'reshuffle_each');
  assert.equal(Number(defaults.team_size_default), 4);
});

test('preview sans recette : la politique de classe décide (carry_over ⇒ reprise ; taille par défaut)', async () => {
  const res = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ seed: 'ronce-1' })
    .expect(200);
  assert.equal(res.body.recipeSource, 'policy');
  assert.equal(res.body.classPolicy, 'carry_over');
  assert.equal(res.body.recipe, 'carry_over');
  assert.ok(res.body.warnings.some((w) => w.code === 'POLICY_DEFAULT_RECIPE'));
  assert.ok(res.body.warnings.some((w) => w.code === 'CARRY_OVER_SOURCE'));

  await request(app)
    .put(`/api/gl/admin/classes/${cls.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ teamPolicy: 'reshuffle_each', teamSizeDefault: 2 })
    .expect(200);
  const reshuffle = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ seed: 'ronce-2' })
    .expect(200);
  assert.equal(reshuffle.body.recipe, 'random_memory');
  // 8 joueurs / taille 2 ⇒ 4 équipes d'après la classe.
  assert.equal(reshuffle.body.teamCount, 4);

  // reshuffle_per_plateau : la partie précédente est sur le même plateau ⇒ reprise.
  await execute('UPDATE gl_chapters SET plateau_number = 2 WHERE id = ?', [chapter.id]);
  await request(app)
    .put(`/api/gl/admin/classes/${cls.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ teamPolicy: 'reshuffle_per_plateau' })
    .expect(200);
  const perPlateau = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ seed: 'ronce-3' })
    .expect(200);
  assert.equal(perPlateau.body.recipe, 'carry_over');
  // Une recette explicite l'emporte toujours.
  const explicit = await request(app)
    .post(previewUrl(draftGame.game.id))
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'random', seed: 'ronce-4' })
    .expect(200);
  assert.equal(explicit.body.recipeSource, 'explicit');
  assert.equal(explicit.body.recipe, 'random');
  const rows = await queryAll('SELECT team_policy FROM gl_classes WHERE id = ?', [cls.id]);
  assert.equal(rows[0].team_policy, 'reshuffle_per_plateau');
});
