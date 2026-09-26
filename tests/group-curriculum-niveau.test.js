'use strict';

// Niveau du programme d'un groupe (`groups.curriculum_niveau`, migration 290).
//
// Constat d'origine : `pedago_level` était NULL partout, tout le monde retombait en
// « collège » sans distinguer une 6ᵉ (cycle 3) d'une 3ᵉ (cycle 4). Le niveau du programme
// se règle une fois sur l'unité « 6ᵉ » et descend à ses classes ; il fixe aussi l'étape
// d'affichage tant que `pedago_level` reste vide.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  resolveGroupPedagoProfile,
  loadUserGroupPedagoProfile,
  loadUserGroupPedagoLevels,
} = require('../lib/biodivPedagoLevel');

const stamp = `${Date.now()}${Math.random().toString(16).slice(2, 6)}`;
const unitId = `gcn-unit-${stamp}`.slice(0, 64);
const classId = `gcn-class-${stamp}`.slice(0, 64);
const lyceeId = `gcn-lycee-${stamp}`.slice(0, 64);
const studentId = crypto.randomUUID();
let adminToken = '';

async function insertGroup(id, name, kind, parentId = null) {
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, parent_group_id, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [id, id, name, kind, parentId],
  );
}

before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  await insertGroup(unitId, `Niveau 6e ${stamp}`, 'unit');
  await insertGroup(classId, `601 ${stamp}`, 'class', unitId);
  await insertGroup(lyceeId, `2nde ${stamp}`, 'class');
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', 'Cycle', 'Trois', 'Cycle Trois', 'local', 1, NOW(), NOW())`,
    [studentId],
  );
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
    [classId, studentId],
  );
});

after(async () => {
  await execute('DELETE FROM group_members WHERE user_id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  for (const id of [classId, lyceeId, unitId]) {
    await execute('DELETE FROM `groups` WHERE id = ?', [id]).catch(() => {});
  }
});

test('profil d’un groupe : héritage du parent, affichage explicite prioritaire', () => {
  const groups = new Map([
    ['unit', { parent_group_id: null, pedago_level: null, curriculum_niveau: 'cycle3' }],
    ['class', { parent_group_id: 'unit', pedago_level: null, curriculum_niveau: null }],
    ['club', { parent_group_id: 'unit', pedago_level: 'lycee', curriculum_niveau: null }],
    ['seconde', { parent_group_id: null, pedago_level: null, curriculum_niveau: 'seconde' }],
    ['vide', { parent_group_id: null, pedago_level: null, curriculum_niveau: null }],
    ['a', { parent_group_id: 'b', pedago_level: null, curriculum_niveau: null }],
    ['b', { parent_group_id: 'a', pedago_level: null, curriculum_niveau: null }],
  ]);
  assert.deepEqual(resolveGroupPedagoProfile('class', groups), {
    level: 'college',
    curriculumNiveau: 'cycle3',
  });
  // Affichage réglé sur le groupe : il l'emporte sur l'étape déduite du programme hérité.
  assert.deepEqual(resolveGroupPedagoProfile('club', groups), {
    level: 'lycee',
    curriculumNiveau: 'cycle3',
  });
  assert.deepEqual(resolveGroupPedagoProfile('seconde', groups), {
    level: 'lycee',
    curriculumNiveau: 'seconde',
  });
  assert.deepEqual(resolveGroupPedagoProfile('vide', groups), {
    level: null,
    curriculumNiveau: null,
  });
  // Parenté circulaire : on s'arrête, on ne boucle pas.
  assert.deepEqual(resolveGroupPedagoProfile('a', groups), { level: null, curriculumNiveau: null });
});

test('PATCH groupe : curriculum_niveau validé, vidable, renvoyé par /options', async () => {
  await request(app)
    .patch(`/api/groups/${unitId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ curriculum_niveau: 'sixieme' })
    .expect(400);

  const res = await request(app)
    .patch(`/api/groups/${unitId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ curriculum_niveau: 'cycle3' })
    .expect(200);
  assert.equal(res.body.curriculum_niveau, 'cycle3');

  const options = await request(app)
    .get('/api/groups/options')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const unit = (options.body?.groups || []).find((g) => g.id === unitId);
  assert.equal(unit?.curriculum_niveau, 'cycle3');
});

test('un élève de 601 hérite du cycle 3 de l’unité, et donc de l’étape Collège', async () => {
  const profile = await loadUserGroupPedagoProfile(studentId);
  assert.deepEqual(profile, { levels: ['college'], curriculumNiveaux: ['cycle3'] });
  assert.deepEqual(await loadUserGroupPedagoLevels(studentId), ['college']);

  const token = await signAuthToken({
    userType: 'student',
    userId: studentId,
    canonicalUserId: studentId,
    roleSlug: 'eleve_novice',
    permissions: [],
  });
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.deepEqual(me.body.biodivGroupPedagoLevels, ['college']);
  assert.deepEqual(me.body.biodivGroupCurriculumNiveaux, ['cycle3']);
});

test('deux classes : les niveaux du programme s’additionnent, vidage = héritage', async () => {
  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
    [lyceeId, studentId],
  );
  await request(app)
    .patch(`/api/groups/${lyceeId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ curriculum_niveau: 'seconde' })
    .expect(200);
  const profile = await loadUserGroupPedagoProfile(studentId);
  assert.deepEqual(profile.curriculumNiveaux, ['cycle3', 'seconde']);
  assert.deepEqual([...profile.levels].sort(), ['college', 'lycee']);

  await request(app)
    .patch(`/api/groups/${unitId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ curriculum_niveau: null })
    .expect(200);
  const after = await loadUserGroupPedagoProfile(studentId);
  assert.deepEqual(after, { levels: ['lycee'], curriculumNiveaux: ['seconde'] });
});

// ---------------------------------------------------------------------------------------
// Décision du mainteneur du 25/09/2026, question 5 : `curriculum_niveau` devient LA colonne
// de niveau des groupes (échelle unique, `universite` compris, migration 301).
// ---------------------------------------------------------------------------------------

test('PATCH groupe : `universite` accepté, il l’emporte comme plus haut niveau', async () => {
  const { loadLearnerLevel } = require('../lib/pedago/learnerLevel');
  await request(app)
    .patch(`/api/groups/${lyceeId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ curriculum_niveau: 'Université' })
    .expect(200);
  const profile = await loadUserGroupPedagoProfile(studentId);
  assert.deepEqual(profile, { levels: ['universite'], curriculumNiveaux: ['universite'] });
  const level = await loadLearnerLevel(studentId);
  assert.equal(level.niveau, 'universite');
  assert.equal(level.maxPalier, null);

  const bad = await request(app)
    .patch(`/api/groups/${lyceeId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ curriculum_niveau: 'lycee' })
    .expect(400);
  assert.match(bad.body.error, /universite/);
  await request(app)
    .patch(`/api/groups/${lyceeId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ curriculum_niveau: 'seconde' })
    .expect(200);
});

test('GET /api/groups : niveau effectif, hérité, manquant et proposition d’après le nom', async () => {
  const missingId = `gcn-5b-${stamp}`.slice(0, 64);
  await insertGroup(missingId, `5B ${stamp}`, 'class');
  try {
    await request(app)
      .patch(`/api/groups/${unitId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ curriculum_niveau: 'cycle3' })
      .expect(200);
    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const byId = new Map((res.body.groups || []).map((g) => [g.id, g]));
    const klass = byId.get(classId);
    assert.equal(klass.curriculum_niveau, null);
    assert.equal(klass.curriculum_niveau_effectif, 'cycle3');
    assert.deepEqual(klass.curriculum_niveau_herite_de, {
      id: unitId,
      name: `Niveau 6e ${stamp}`,
    });
    assert.equal(klass.curriculum_niveau_manquant, false);
    // « 601 … » : la proposition confirme ce qui est hérité.
    assert.deepEqual(klass.curriculum_niveau_suggestion, { niveau: 'cycle3', raison: 'deduit' });
    const unit = byId.get(unitId);
    assert.equal(unit.curriculum_niveau_herite_de, null);
    assert.equal(unit.curriculum_niveau_suggestion, null, 'niveau propre : rien à proposer');
    const missing = byId.get(missingId);
    assert.equal(missing.curriculum_niveau_manquant, true);
    assert.deepEqual(missing.curriculum_niveau_suggestion, {
      niveau: 'cycle4',
      raison: 'deduit',
    });
  } finally {
    await execute('DELETE FROM `groups` WHERE id = ?', [missingId]).catch(() => {});
  }
});

test('POST groupe : niveau de la classe enregistré dès la création, validé', async () => {
  const bad = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `4A ${stamp}`, kind: 'class', curriculum_niveau: 'quatrieme' })
    .expect(400);
  assert.match(bad.body.error, /curriculum_niveau invalide/);

  const res = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `4A ${stamp}`, kind: 'class', curriculum_niveau: 'cycle4' })
    .expect(201);
  try {
    assert.equal(res.body.curriculum_niveau, 'cycle4');
  } finally {
    await execute('DELETE FROM `groups` WHERE id = ?', [res.body.id]).catch(() => {});
  }
});

test('describeGroupNiveau : héritage, parenté circulaire, types sans niveau attendu', () => {
  const { describeGroupNiveau, groupNiveauAnnotations } = require('../lib/pedago/groupLevel');
  const groups = new Map([
    ['u', { id: 'u', name: 'Niveau 6e', kind: 'unit', curriculum_niveau: 'cycle3' }],
    ['c', { id: 'c', name: '601', kind: 'class', parent_group_id: 'u' }],
    ['t', { id: 't', name: 'Équipe A', kind: 'team', parent_group_id: 'c' }],
    ['x', { id: 'x', name: 'Atelier', kind: 'class', parent_group_id: 'y' }],
    ['y', { id: 'y', name: 'Boucle', kind: 'class', parent_group_id: 'x' }],
    ['k', { id: 'k', name: 'Club', kind: 'club' }],
  ]);
  assert.deepEqual(describeGroupNiveau('t', groups), {
    niveau: 'cycle3',
    heriteDe: { id: 'u', name: 'Niveau 6e' },
  });
  assert.deepEqual(describeGroupNiveau('x', groups), { niveau: null, heriteDe: null });
  assert.equal(groupNiveauAnnotations(groups.get('x'), groups).curriculum_niveau_manquant, true);
  const club = groupNiveauAnnotations(groups.get('k'), groups);
  assert.equal(club.curriculum_niveau_manquant, false);
  assert.equal(club.curriculum_niveau_suggestion, null);
});
