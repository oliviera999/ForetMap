'use strict';

/**
 * API des fresques (`routes/fresques.js`, migration 321) : jeux, plateau actif idempotent,
 * droits (élève, autre élève, membre d'équipe, prof dans / hors périmètre), verrou optimiste
 * (409), réécriture de `by`, journal des gestes, fin et badge une seule fois, « Recommencer »,
 * vue prof scopée, module désactivé (503 élève, accès gestionnaire), `deckId` hors registre.
 */

require('./helpers/setup');
const crypto = require('node:crypto');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const core = require('../lib/shared/fresqueCore');
const { getFresqueDeckModel } = require('../lib/fresqueDecks');

const DECK = 'climat-junior-fr-v7-5';
const MODULE_KEY = 'ui.modules.fresque_enabled';
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let adminToken = '';
let moduleSnapshot = null;
const students = {};
let teamGroupId = '';
let classTeacher = null;
const createdBoardIds = new Set();
let model;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function registerStudent(tag) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Fresque', lastName: `${tag}${stamp}`, password: 'pwd12345' })
    .expect(201);
  return { id: res.body.id, token: res.body.authToken, auth: bearer(res.body.authToken) };
}

/** Prof de classe (`stats.read.group`, pas de portée globale) sans aucun groupe : hors périmètre. */
async function createClassTeacher() {
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'prof_classe' LIMIT 1");
  assert.ok(role?.id, 'rôle prof_classe attendu');
  const id = `t-fresque-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, `${id}@foretmap.local`, id, `Prof classe ${stamp}`],
  );
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('teacher', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  const token = await signAuthToken({
    userType: 'teacher',
    userId: id,
    canonicalUserId: id,
    roleId: role.id,
    roleSlug: 'prof_classe',
    roleDisplayName: 'Prof de classe',
  });
  return { id, token, auth: bearer(token) };
}

async function createTeam(memberIds) {
  const id = crypto.randomUUID();
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'team', 1)",
    [id, `team-fresque-${stamp}`, `Équipe fresque ${stamp}`],
  );
  for (const userId of memberIds) {
    await execute(
      "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student') ON DUPLICATE KEY UPDATE user_type = 'student'",
      [id, userId],
    );
  }
  return id;
}

async function setModule(value) {
  await request(app)
    .put(`/api/settings/admin/${MODULE_KEY}`)
    .set(bearer(adminToken))
    .send({ value })
    .expect(200);
}

async function createBoard(auth, body = {}) {
  const res = await request(app)
    .post('/api/fresques/boards')
    .set(auth)
    .send({ deckId: DECK, ...body });
  if (res.body?.board?.id) createdBoardIds.add(res.body.board.id);
  return res;
}

/** État complet : 21 cartes posées, flèches de la correction tracées, correction ouverte. */
function completeState(base) {
  let s = base;
  for (const lot of model.lots) {
    for (const id of lot.cards) s = core.placeCard(model, s, id, { x: 5, y: 5 });
    if (core.canOpenNextLot(model, s)) s = core.openNextLot(model, s);
  }
  for (const l of core.expectedLinks(model, s)) s = core.addLink(model, s, l.from, l.to).state;
  s = core.setStep(model, s, 'comprendre');
  s = core.markCorrectionViewed(s);
  return s;
}

before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  moduleSnapshot = await snapshotSetting(MODULE_KEY);
  await setModule(true);
  model = getFresqueDeckModel(DECK);
  students.a = await registerStudent('A');
  students.b = await registerStudent('B');
  students.c = await registerStudent('C');
  teamGroupId = await createTeam([students.a.id, students.b.id]);
  classTeacher = await createClassTeacher();
});

after(async () => {
  if (moduleSnapshot) await restoreSetting(moduleSnapshot);
  for (const id of createdBoardIds) {
    await execute('DELETE FROM fresque_boards WHERE id = ?', [id]).catch(() => {});
  }
  await execute('DELETE FROM fresque_boards WHERE owner_group_id = ?', [teamGroupId]).catch(
    () => {},
  );
  await execute('DELETE FROM `groups` WHERE id = ?', [teamGroupId]).catch(() => {});
  if (classTeacher) {
    await execute('DELETE FROM users WHERE id = ?', [classTeacher.id]).catch(() => {});
  }
  for (const s of Object.values(students)) {
    await execute('DELETE FROM users WHERE id = ?', [s.id]).catch(() => {});
  }
});

test('GET /decks et /decks/:deckId : jeu livré, crédit, refus hors registre', async () => {
  await request(app).get('/api/fresques/decks').expect(401);
  const list = await request(app).get('/api/fresques/decks').set(students.a.auth).expect(200);
  const deck = list.body.decks.find((d) => d.id === DECK);
  assert.ok(deck);
  assert.equal(deck.cardCount, 21);
  assert.equal(deck.expectedLinks, 30);
  assert.match(deck.attribution.creditLine, /CC BY-NC-ND/);
  assert.equal(deck.publicBase, `/fresques/${DECK}/`);

  const detail = await request(app)
    .get(`/api/fresques/decks/${DECK}`)
    .set(students.a.auth)
    .expect(200);
  assert.equal(detail.body.deck.cards.length, 21);
  assert.equal(detail.body.correction.links.length, 30);
  assert.ok(detail.body.hints.readingHints.c21);

  await request(app).get('/api/fresques/decks/inconnu-v1-0').set(students.a.auth).expect(404);
  await request(app)
    .get('/api/fresques/decks/..%2F..%2Fpackage')
    .set(students.a.auth)
    .expect((res) => assert.ok([400, 404].includes(res.status)));
  await request(app)
    .post('/api/fresques/boards')
    .set(students.a.auth)
    .send({ deckId: 'autre-jeu-v1-0' })
    .expect(404);
  await request(app)
    .post('/api/fresques/boards')
    .set(students.a.auth)
    .send({ deckId: '../../etc' })
    .expect(400);
});

test('POST /boards : création idempotente du plateau actif, état initial valide', async () => {
  const first = await createBoard(students.a.auth, { level: 'eclaireur' });
  assert.equal(first.status, 201);
  assert.equal(first.body.created, true);
  const board = first.body.board;
  assert.equal(board.ownerType, 'user');
  assert.equal(board.ownerUserId, students.a.id);
  assert.equal(board.level, 'eclaireur');
  assert.equal(board.status, 'in_progress');
  assert.equal(board.revision, 0);
  assert.equal(board.readOnly, false);
  assert.equal(board.state.v, 1);
  assert.equal(board.state.deckId, DECK);
  assert.deepEqual(core.validateState(model, board.state), { ok: true, errors: [] });

  const second = await createBoard(students.a.auth);
  assert.equal(second.status, 200);
  assert.equal(second.body.created, false);
  assert.equal(second.body.board.id, board.id);

  const mine = await request(app)
    .get(`/api/fresques/boards/mine?deckId=${DECK}`)
    .set(students.a.auth)
    .expect(200);
  assert.ok(mine.body.boards.some((b) => b.id === board.id));
  assert.ok(mine.body.teams.some((t) => t.id === teamGroupId));
});

test('droits : autre élève 403, prof hors périmètre 403, admin lecture seule', async () => {
  const { body } = await createBoard(students.a.auth);
  const id = body.board.id;
  await request(app).get(`/api/fresques/boards/${id}`).set(students.c.auth).expect(403);
  await request(app).get(`/api/fresques/boards/${id}`).set(classTeacher.auth).expect(403);
  const admin = await request(app)
    .get(`/api/fresques/boards/${id}`)
    .set(bearer(adminToken))
    .expect(200);
  assert.equal(admin.body.board.readOnly, true);
  // Le prof ne peut pas écrire, même avec un état valide.
  await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(bearer(adminToken))
    .send({ state: body.board.state })
    .expect(403);
  await request(app)
    .get('/api/fresques/boards/00000000-0000-4000-8000-000000000000')
    .set(students.a.auth)
    .expect(404);
  await request(app).get('/api/fresques/boards/pas-un-uuid').set(students.a.auth).expect(400);
});

test('équipe : membres lecture/écriture, non-membre refusé, création contrôlée', async () => {
  await request(app)
    .post('/api/fresques/boards')
    .set(students.c.auth)
    .send({ deckId: DECK, ownerType: 'team', groupId: teamGroupId })
    .expect(403);
  await request(app)
    .post('/api/fresques/boards')
    .set(students.a.auth)
    .send({ deckId: DECK, ownerType: 'team' })
    .expect(400);
  const created = await createBoard(students.a.auth, { ownerType: 'team', groupId: teamGroupId });
  assert.equal(created.status, 201);
  const id = created.body.board.id;
  assert.equal(created.body.board.ownerType, 'team');
  assert.equal(created.body.board.ownerGroupId, teamGroupId);
  assert.match(created.body.board.ownerLabel, /Équipe fresque/);

  const again = await createBoard(students.b.auth, { ownerType: 'team', groupId: teamGroupId });
  assert.equal(again.status, 200, 'même plateau pour tous les membres');
  assert.equal(again.body.board.id, id);

  await request(app).get(`/api/fresques/boards/${id}`).set(students.c.auth).expect(403);
  const asB = await request(app).get(`/api/fresques/boards/${id}`).set(students.b.auth).expect(200);
  assert.equal(asB.body.board.readOnly, false);

  // B pose une carte, A la voit ; `by` porte l'auteur réel.
  const s1 = core.placeCard(model, asB.body.board.state, 'c04', { x: 10, y: 10 });
  const s2 = core.addLink(model, core.placeCard(model, s1, 'c07', { x: 30, y: 10 }), 'c04', 'c07', {
    by: 'tricheur',
  }).state;
  const saved = await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(students.b.auth)
    .send({ state: s2, expected_revision: 0 })
    .expect(200);
  assert.equal(saved.body.revision, 1);
  const asA = await request(app).get(`/api/fresques/boards/${id}`).set(students.a.auth).expect(200);
  assert.equal(asA.body.board.state.links[0].by, students.b.id);
  assert.equal(asA.body.board.cardsPlaced, 2);
  const events = await request(app)
    .get(`/api/fresques/boards/${id}/events`)
    .set(students.a.auth)
    .expect(200);
  const types = events.body.events.map((e) => e.type);
  assert.deepEqual(types, ['card_placed', 'card_placed', 'link_added']);
  assert.ok(events.body.events.every((e) => e.by === students.b.id));
  const mineB = await request(app)
    .get('/api/fresques/boards/mine')
    .set(students.b.auth)
    .expect(200);
  assert.ok(mineB.body.boards.some((b) => b.id === id && b.ownerType === 'team'));
});

test('PUT : verrou optimiste 409, état invalide 400, reprise avec la révision courante', async () => {
  const { body } = await createBoard(students.a.auth);
  const id = body.board.id;
  const base = body.board.state;
  const s1 = core.placeCard(model, base, 'c04', { x: 10, y: 10 });
  const ok = await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(students.a.auth)
    .send({ state: s1, expected_revision: 0, clientSeq: 3 })
    .expect(200);
  assert.equal(ok.body.revision, 1);
  assert.equal(ok.body.clientSeq, 3);
  assert.equal(ok.body.events, 1);

  // Second appareil parti de la révision 0 : refusé, rien n'est écrit.
  const stale = await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(students.a.auth)
    .send({ state: core.placeCard(model, base, 'c07', { x: 50, y: 50 }), expected_revision: 0 })
    .expect(409);
  assert.equal(stale.body.code, 'edit_conflict');
  assert.equal(stale.body.current_revision, 1);
  const row = await queryOne('SELECT state_json, edit_revision FROM fresque_boards WHERE id = ?', [
    id,
  ]);
  assert.equal(Number(row.edit_revision), 1);
  assert.ok(JSON.parse(row.state_json).cards.c04);
  assert.ok(!JSON.parse(row.state_json).cards.c07);

  // « Garder celle-ci » : renvoi avec la révision courante.
  const kept = await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(students.a.auth)
    .send({ state: core.placeCard(model, base, 'c07', { x: 50, y: 50 }), expected_revision: 1 })
    .expect(200);
  assert.equal(kept.body.revision, 2);

  const bad = await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(students.a.auth)
    .send({
      state: { ...s1, cards: { c99: { x: 1, y: 1, flipped: false } } },
      expected_revision: 2,
    })
    .expect(400);
  assert.match(bad.body.error, /État invalide/);
  // Le `deckId` envoyé est réaligné sur le plateau : il ne peut pas changer de jeu.
  await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(students.a.auth)
    .send({ state: { ...s1, deckId: 'autre' }, expected_revision: 2 })
    .expect(200);
  const rev = await queryOne('SELECT edit_revision FROM fresque_boards WHERE id = ?', [id]);
  assert.equal(Number(rev.edit_revision), 3, 'un 400 rend sa révision, un 200 l’avance');
});

test('fin : statut completed, badge une seule fois, quel que soit le niveau', async () => {
  const { body } = await createBoard(students.c.auth, { level: 'expert' });
  const id = body.board.id;
  const done = completeState(body.board.state);
  const saved = await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(students.c.auth)
    .send({ state: done, expected_revision: 0 })
    .expect(200);
  assert.equal(saved.body.completed, true);
  assert.equal(saved.body.board.status, 'completed');
  assert.ok(saved.body.board.completedAt);
  assert.equal(saved.body.board.linksFound, 30);
  assert.deepEqual(
    saved.body.rewards.map((r) => r.key),
    ['fresque_climat_junior'],
  );
  const types = (
    await request(app).get(`/api/fresques/boards/${id}/events`).set(students.c.auth).expect(200)
  ).body.events.map((e) => e.type);
  assert.ok(types.includes('completed'));
  assert.ok(types.includes('correction_viewed'));

  // Nouvel enregistrement : pas de second badge, statut conservé.
  const again = await request(app)
    .put(`/api/fresques/boards/${id}`)
    .set(students.c.auth)
    .send({ state: core.setCreative(model, done, { title: 'Ma fresque' }), expected_revision: 1 })
    .expect(200);
  assert.deepEqual(again.body.rewards, []);
  assert.equal(again.body.board.status, 'completed');
  const rewards = await queryAll(
    "SELECT reward_key, source_ref FROM user_rewards WHERE user_id = ? AND reward_key = 'fresque_climat_junior'",
    [students.c.id],
  );
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].source_ref, id);

  // Fin sans toutes les flèches : terminée quand même (21 cartes + correction ouverte).
  const other = await createBoard(students.b.auth, { level: 'eclaireur' });
  let partial = other.body.board.state;
  for (const lot of model.lots) {
    for (const cid of lot.cards) partial = core.placeCard(model, partial, cid, { x: 5, y: 5 });
    if (core.canOpenNextLot(model, partial)) partial = core.openNextLot(model, partial);
  }
  partial = core.markCorrectionViewed(partial);
  const res = await request(app)
    .put(`/api/fresques/boards/${other.body.board.id}`)
    .set(students.b.auth)
    .send({ state: partial, expected_revision: 0 })
    .expect(200);
  assert.equal(res.body.completed, true);
  assert.equal(res.body.board.linksFound, 0);
  assert.deepEqual(
    res.body.rewards.map((r) => r.key),
    ['fresque_climat_junior'],
  );
});

test('restart : archive l’ancien plateau (consultable par le prof) et en crée un neuf', async () => {
  const { body } = await createBoard(students.a.auth);
  const oldId = body.board.id;
  await request(app).post(`/api/fresques/boards/${oldId}/restart`).set(students.c.auth).expect(403);
  const restarted = await request(app)
    .post(`/api/fresques/boards/${oldId}/restart`)
    .set(students.a.auth)
    .expect(201);
  const newId = restarted.body.board.id;
  createdBoardIds.add(newId);
  assert.notEqual(newId, oldId);
  assert.equal(restarted.body.previousBoardId, oldId);
  assert.equal(restarted.body.board.level, body.board.level);
  const old = await request(app)
    .get(`/api/fresques/boards/${oldId}`)
    .set(bearer(adminToken))
    .expect(200);
  assert.equal(old.body.board.status, 'archived');
  assert.equal(old.body.board.active, false);
  const active = await createBoard(students.a.auth);
  assert.equal(active.body.board.id, newId, 'le plateau actif est le neuf');
  await request(app)
    .put(`/api/fresques/boards/${oldId}`)
    .set(students.a.auth)
    .send({ state: body.board.state })
    .expect(409);
  await request(app).post(`/api/fresques/boards/${oldId}/restart`).set(students.a.auth).expect(409);
});

test('overview : réservé aux profs, périmètre de groupes, groupe hors périmètre 403', async () => {
  await request(app).get('/api/fresques/overview').set(students.a.auth).expect(403);
  const admin = await request(app)
    .get(`/api/fresques/overview?deckId=${DECK}`)
    .set(bearer(adminToken))
    .expect(200);
  assert.ok(admin.body.boards.some((b) => b.ownerUserId === students.a.id));
  assert.ok(
    admin.body.boards.some((b) => b.ownerType === 'team' && b.ownerGroupId === teamGroupId),
  );
  for (const b of admin.body.boards) {
    assert.ok(['in_progress', 'completed', 'archived'].includes(b.status));
    assert.equal(typeof b.ownerLabel, 'string');
    assert.equal('state' in b, false, 'la vue de suivi ne charge pas les états');
  }
  const scoped = await request(app)
    .get(`/api/fresques/overview?groupId=${teamGroupId}`)
    .set(bearer(adminToken))
    .expect(200);
  assert.ok(
    scoped.body.boards.every((b) => b.ownerType === 'user' || b.ownerGroupId === teamGroupId),
  );
  assert.ok(scoped.body.boards.some((b) => b.ownerGroupId === teamGroupId));

  // Prof de classe sans groupe : rien dans son périmètre, groupe demandé refusé.
  const empty = await request(app).get('/api/fresques/overview').set(classTeacher.auth).expect(200);
  assert.deepEqual(empty.body.boards, []);
  await request(app)
    .get(`/api/fresques/overview?groupId=${teamGroupId}`)
    .set(classTeacher.auth)
    .expect(403);
});

test('module éteint : 503 pour l’élève, accès conservé pour plants.manage', async () => {
  await setModule(false);
  try {
    const res = await request(app).get('/api/fresques/decks').set(students.a.auth);
    assert.equal(res.status, 503);
    assert.match(res.body.error, /désactivé/);
    await request(app).get('/api/fresques/decks').set(bearer(adminToken)).expect(200);
  } finally {
    await setModule(true);
  }
  await request(app).get('/api/fresques/decks').set(students.a.auth).expect(200);
});
