'use strict';

// Six axes de profil (lot v2) — lib/gl/teamProfileAxes.js.
// 1) normalisation PURE (shrinkage, moyenne de classe, rôle dominant) ; 2) chargement SQL sur
// fixtures ; 3) le moteur exploite les profils (mixed réduit la variance inter, roles couvre
// les rôles) ; 4) la route refuse homogeneous + score et ne laisse fuiter aucun score.
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
  signTokens,
} = require('./helpers/glFixtures');
const {
  AXES,
  SHRINKAGE_K,
  emptyRaw,
  normalizeAxes,
  loadProfileSignals,
} = require('../lib/gl/teamProfileAxes');
const {
  RECIPE_WEIGHTS,
  PROFILE_RECIPES,
  TEAM_ROLES,
  resolveWeights,
  createSeededRng,
  computeComposition,
  scoreComposition,
  summarizeRoles,
} = require('../lib/gl/teamComposition');
const { invalidateGameplayCache } = require('../lib/glSettings');

// ---------------------------------------------------------------------------------------------
// Partie pure
// ---------------------------------------------------------------------------------------------

test('normalizeAxes : six axes dans [0,1], joueur sans donnée = moyenne de classe', () => {
  const strong = { ...emptyRaw(1), qcmTotal: 40, qcmCorrect: 36, eventsTotal: 30, lastSeenDays: 0 };
  const weak = { ...emptyRaw(2), qcmTotal: 40, qcmCorrect: 10, eventsTotal: 30, lastSeenDays: 2 };
  const blank = emptyRaw(3);
  const { profiles, classMeans, k } = normalizeAxes({ raw: [strong, weak, blank] });
  assert.equal(k, SHRINKAGE_K);
  assert.deepEqual(Object.keys(classMeans).sort(), [...AXES].sort());
  for (const p of profiles.values()) {
    for (const axis of AXES) {
      assert.ok(p.axes[axis] >= 0 && p.axes[axis] <= 1, `${axis}=${p.axes[axis]}`);
    }
    assert.ok(p.composite >= 0 && p.composite <= 1);
    assert.ok(TEAM_ROLES.includes(p.role));
  }
  // n = 0 sur tous les axes ⇒ exactement la moyenne de classe, composite = moyenne des moyennes.
  const b = profiles.get(3);
  for (const axis of AXES) assert.ok(Math.abs(b.axes[axis] - classMeans[axis]) < 1e-12, axis);
  assert.equal(b.volume, 0);
  // Ordre respecté sur l'axe observé.
  assert.ok(profiles.get(1).axes.savoir > profiles.get(2).axes.savoir);
});

test('normalizeAxes : shrinkage — peu d’observations ramènent vers la moyenne', () => {
  // Même taux de réussite (100 %) mais 2 QCM vs 40 : le second doit être bien plus haut.
  const base = Array.from({ length: 6 }, (_, i) => ({
    ...emptyRaw(10 + i),
    qcmTotal: 10,
    qcmCorrect: 5,
  }));
  const few = { ...emptyRaw(1), qcmTotal: 2, qcmCorrect: 2 };
  const many = { ...emptyRaw(2), qcmTotal: 40, qcmCorrect: 40 };
  const { profiles, classMeans } = normalizeAxes({ raw: [...base, few, many] });
  const mean = classMeans.savoir;
  const sFew = profiles.get(1).axes.savoir;
  const sMany = profiles.get(2).axes.savoir;
  assert.ok(sFew > mean && sMany > sFew, `${mean} < ${sFew} < ${sMany}`);
  // Formule exacte : (n·s + k·m)/(n+k).
  assert.ok(Math.abs(sFew - (2 * 1 + SHRINKAGE_K * mean) / (2 + SHRINKAGE_K)) < 1e-12);
  // k = 0 ⇒ score brut.
  const rawOnly = normalizeAxes({ raw: [...base, few, many], k: 0 });
  assert.equal(rawOnly.profiles.get(1).axes.savoir, 1);
  // Aucune donnée du tout : profils identiques, rôle déterministe.
  const empty = normalizeAxes({ raw: [emptyRaw(1), emptyRaw(2)] });
  assert.equal(empty.profiles.get(1).composite, empty.profiles.get(2).composite);
  assert.equal(empty.profiles.get(1).role, 'savant');
  assert.equal(normalizeAxes({ raw: [] }).profiles.size, 0);
});

test('normalizeAxes : rôle dominant = écart le plus fort à la moyenne parmi S/E/É/G', () => {
  const rows = [
    { ...emptyRaw(1), qcmTotal: 30, qcmCorrect: 30 },
    { ...emptyRaw(2), feuilletsDiscovered: 12, moves: 8, qcmTotal: 10, qcmCorrect: 4 },
    { ...emptyRaw(3), tradesCompleted: 6, tradeMessages: 10, forumPosts: 4 },
    { ...emptyRaw(4), spellContributions: 8, spellGems: 20, spellHearts: 5 },
    { ...emptyRaw(5), actionsEmitted: 9, actionsAccepted: 7 },
    emptyRaw(6),
  ];
  const { profiles } = normalizeAxes({ raw: rows });
  assert.equal(profiles.get(1).role, 'savant');
  assert.equal(profiles.get(2).role, 'eclaireur');
  assert.equal(profiles.get(3).role, 'negociant');
  assert.equal(profiles.get(4).role, 'gardien');
  // L'initiative n'est pas un rôle : le joueur 5 reçoit un rôle par défaut sans planter.
  assert.ok(TEAM_ROLES.includes(profiles.get(5).role));
});

test('resolveWeights : presets v2, surcharges bornées sur les seuls termes ajustables', () => {
  assert.deepEqual([...PROFILE_RECIPES].sort(), ['homogeneous', 'mixed', 'roles']);
  assert.ok(RECIPE_WEIGHTS.mixed.inter > 0 && !RECIPE_WEIGHTS.mixed.intra);
  assert.ok(RECIPE_WEIGHTS.homogeneous.intra > 0 && !RECIPE_WEIGHTS.homogeneous.inter);
  assert.ok(RECIPE_WEIGHTS.roles.roles > 0);
  const w = resolveWeights('mixed', { inter: 500, repeat: -3, size: 0, bogus: 9, roles: '2' });
  assert.equal(w.inter, 100, 'borné à MAX_WEIGHT');
  assert.equal(w.repeat, 0, 'plancher 0');
  assert.equal(w.size, 1, 'size jamais surchargé');
  assert.equal(w.roles, 2);
  assert.equal(w.bogus, undefined);
  assert.deepEqual(resolveWeights('inconnue'), { size: 1 });
});

/** Profils synthétiques : composite imposé, rôle cyclique. */
function syntheticProfiles(n) {
  const profiles = new Map();
  for (let i = 1; i <= n; i += 1) {
    profiles.set(i, {
      composite: i / n,
      role: TEAM_ROLES[(i - 1) % TEAM_ROLES.length],
    });
  }
  return profiles;
}

test('moteur : mixed réduit la variance inter-équipes par rapport au tirage aléatoire', () => {
  const players = Array.from({ length: 16 }, (_, i) => ({ playerId: i + 1 }));
  const profiles = syntheticProfiles(16);
  const rng = () => createSeededRng(77);
  const random = computeComposition({
    players,
    teamCount: 4,
    weights: RECIPE_WEIGHTS.random,
    rng: rng(),
  });
  const mixed = computeComposition({
    players,
    teamCount: 4,
    weights: RECIPE_WEIGHTS.mixed,
    rng: rng(),
    profiles,
  });
  const inter = (slots) => scoreComposition({ slots, weights: { inter: 1 }, profiles }).raw.inter;
  assert.ok(
    inter(mixed.slots) < inter(random.slots),
    `${inter(mixed.slots)} < ${inter(random.slots)}`,
  );
  assert.ok(inter(mixed.slots) < 1e-3, 'moyennes d’équipe quasi égales');
  assert.ok(mixed.improved > 0);
  assert.deepEqual(
    mixed.slots.map((s) => s.length),
    [4, 4, 4, 4],
  );
});

test('moteur : homogeneous réduit la variance intra-équipe (niveaux proches)', () => {
  const players = Array.from({ length: 12 }, (_, i) => ({ playerId: i + 1 }));
  const profiles = syntheticProfiles(12);
  const out = computeComposition({
    players,
    teamCount: 3,
    weights: RECIPE_WEIGHTS.homogeneous,
    rng: createSeededRng(5),
    profiles,
  });
  const intra = scoreComposition({ slots: out.slots, weights: { intra: 1 }, profiles }).raw.intra;
  // Optimum : {1..4}, {5..8}, {9..12} ⇒ variance intra de chaque équipe = 1.25/144.
  assert.ok(intra < 0.03, `intra=${intra}`);
  for (const team of out.slots) {
    const sorted = [...team].sort((a, b) => a - b);
    assert.equal(sorted[3] - sorted[0], 3, `équipe contiguë ${sorted}`);
  }
});

test('moteur : roles couvre les quatre rôles dans chaque équipe quand c’est possible', () => {
  const players = Array.from({ length: 12 }, (_, i) => ({ playerId: i + 1 }));
  const profiles = syntheticProfiles(12); // 3 joueurs par rôle ⇒ 3 équipes complètes possibles
  const out = computeComposition({
    players,
    teamCount: 3,
    weights: RECIPE_WEIGHTS.roles,
    rng: createSeededRng(21),
    profiles,
  });
  const summary = summarizeRoles(out.slots, profiles);
  assert.deepEqual(summary.perTeam, [4, 4, 4]);
  assert.equal(summary.fullTeams, 3);
  assert.equal(summarizeRoles(out.slots, null), null);
});

// ---------------------------------------------------------------------------------------------
// Partie base + route
// ---------------------------------------------------------------------------------------------

const stamp = Date.now();
let admin;
let cls;
let players = [];
let game;
let token;

async function setScoring(enabled) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at) VALUES ('gameplay.scoring_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(!!enabled)],
  );
  invalidateGameplayCache();
}

async function setProfileRecipes(enabled) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.team_composition_profile_recipes_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(!!enabled)],
  );
  invalidateGameplayCache();
}

before(async () => {
  await initSchema();
  admin = await createGlAdmin({ email: `axes-${stamp}@ecole.local` });
  cls = await createGlClass({ name: `Classe axes ${stamp}`, adminId: admin.id });
  const { chapter } = await createGlChapterWithMarker({ slug: `axes-ch-${stamp}` });
  players = [];
  for (let i = 0; i < 8; i += 1) {
    players.push(
      await createGlPlayer({ classId: cls.id, pseudo: `prof-${stamp}-${i}`, firstName: `A${i}` }),
    );
  }
  game = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'draft',
    name: `Partie axes ${stamp}`,
  });
  ({ adminToken: token } = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.team.manage', 'gl.players.manage'],
  }));
  // Signaux : QCM du joueur 0 (savoir), feuillets découverts du joueur 1 (exploration),
  // messages de forum du joueur 2 (échange).
  for (let i = 0; i < 6; i += 1) {
    await execute(
      `INSERT INTO gl_qcm_attempts (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, answered_at)
       VALUES ('gl_player', ?, 'svt', ?, ?, NOW())`,
      [String(players[0].id), `Q${i}`, i < 5 ? 1 : 0],
    );
  }
  await execute(
    `INSERT INTO gl_learning_acknowledgements (reader_user_type, reader_user_id, target_type, target_code, acknowledged_at)
     VALUES ('gl_player', ?, 'glossary', 'ack-${stamp}', NOW())`,
    [String(players[0].id)],
  );
  // Un second joueur observé en savoir, moins réussi : la moyenne de classe n'est pas P0.
  for (let i = 0; i < 4; i += 1) {
    await execute(
      `INSERT INTO gl_qcm_attempts (reader_user_type, reader_user_id, question_dataset, question_code, is_correct, answered_at)
       VALUES ('gl_player', ?, 'svt', ?, ?, NOW())`,
      [String(players[1].id), `Q${i}`, i < 2 ? 1 : 0],
    );
  }
  const thread = await execute(
    `INSERT INTO gl_forum_threads (title, author_user_type, author_user_id, created_at)
     VALUES (?, 'gl_player', ?, NOW())`,
    [`Fil axes ${stamp}`, String(players[2].id)],
  );
  for (let i = 0; i < 3; i += 1) {
    await execute(
      `INSERT INTO gl_forum_posts (thread_id, body, author_user_type, author_user_id, created_at)
       VALUES (?, 'msg', 'gl_player', ?, NOW())`,
      [thread.insertId, String(players[2].id)],
    );
  }
  await setScoring(false);
  await setProfileRecipes(true);
});

test('loadProfileSignals : une ligne par joueur demandé, compteurs issus des tables existantes', async () => {
  const raw = await loadProfileSignals(
    { classId: cls.id, playerIds: players.map((p) => p.id) },
    { queryAll },
  );
  assert.equal(raw.size, players.length);
  const p0 = raw.get(Number(players[0].id));
  assert.equal(p0.qcmTotal, 6);
  assert.equal(p0.qcmCorrect, 5);
  assert.equal(p0.acknowledgements, 1);
  assert.equal(raw.get(Number(players[2].id)).forumPosts, 3);
  const p3 = raw.get(Number(players[3].id));
  assert.equal(p3.qcmTotal, 0);
  assert.equal(p3.eventsTotal, 0);
  const { profiles, classMeans } = normalizeAxes({ raw });
  const s = (idx) => profiles.get(Number(players[idx].id)).axes.savoir;
  assert.ok(s(0) > s(3) && s(3) > s(1), `${s(0)} > ${s(3)} > ${s(1)}`);
  assert.ok(Math.abs(s(3) - classMeans.savoir) < 1e-12, 'sans QCM ⇒ moyenne de classe');
  // Ensemble vide : aucune requête ne casse.
  const none = await loadProfileSignals({ classId: cls.id, playerIds: [] }, { queryAll });
  assert.equal(none.size, 0);
});

test('preview mixed : réponse sans aucun score, avertissement de données rares, déterministe', async () => {
  const url = `/api/gl/games/${game.game.id}/teams/compose/preview`;
  const body = { recipe: 'mixed', teamCount: 2, seed: 'aube-2222' };
  const res = await request(app)
    .post(url)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(200);
  assert.equal(res.body.recipe, 'mixed');
  assert.equal(res.body.teams.length, 2);
  const serialized = JSON.stringify(res.body);
  // Aucune clé de profil dans le JSON (les libellés d'axes dans `explain` sont du texte).
  for (const key of ['composite', 'axes', 'savoir', 'assiduite', 'role', 'profiles', 'volume']) {
    assert.ok(!serialized.includes(`"${key}":`), `fuite de la clé « ${key} »`);
  }
  for (const t of res.body.teams) {
    for (const m of t.members) {
      assert.deepEqual(Object.keys(m).sort(), [
        'firstName',
        'isActive',
        'lastName',
        'pinned',
        'playerId',
        'pseudo',
      ]);
    }
  }
  assert.ok(res.body.warnings.some((w) => w.code === 'PROFILE_DATA_SPARSE'));
  assert.ok(res.body.explain.some((line) => /Profils variés/.test(line)));
  const again = await request(app)
    .post(url)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(200);
  assert.deepEqual(again.body.teams, res.body.teams);
  // Surcharge de poids acceptée (bornée côté serveur), toujours 200.
  await request(app)
    .post(url)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...body, weightsOverride: { inter: 999, repeat: 0 } })
    .expect(200);
  // Recettes roles / homogeneous (score coupé) passent aussi.
  const roles = await request(app)
    .post(url)
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'roles', teamCount: 2 })
    .expect(200);
  assert.ok(roles.body.explain.some((line) => /rôles/.test(line)));
  await request(app)
    .post(url)
    .set('Authorization', `Bearer ${token}`)
    .send({ recipe: 'homogeneous', teamCount: 2 })
    .expect(200);
});

test('preview : 409 HOMOGENEOUS_WITH_SCORING quand le score est actif ; mixed reste permis', async () => {
  const url = `/api/gl/games/${game.game.id}/teams/compose/preview`;
  await setScoring(true);
  try {
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipe: 'homogeneous', teamCount: 2 })
      .expect(409);
    assert.equal(res.body.code, 'HOMOGENEOUS_WITH_SCORING');
    await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipe: 'mixed', teamCount: 2 })
      .expect(200);
  } finally {
    await setScoring(false);
  }
});

test('preview : 409 PROFILE_RECIPES_DISABLED si l’admin a coupé les recettes de profil', async () => {
  const url = `/api/gl/games/${game.game.id}/teams/compose/preview`;
  await setProfileRecipes(false);
  try {
    for (const recipe of PROFILE_RECIPES) {
      const res = await request(app)
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ recipe, teamCount: 2 })
        .expect(409);
      assert.equal(res.body.code, 'PROFILE_RECIPES_DISABLED', recipe);
    }
    // Les recettes v1 ne dépendent pas du réglage.
    await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ recipe: 'random_memory', teamCount: 2 })
      .expect(200);
  } finally {
    await setProfileRecipes(true);
  }
});
