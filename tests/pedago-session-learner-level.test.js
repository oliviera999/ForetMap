'use strict';

// La séance impose son niveau, verrouillage compris (décision du mainteneur du 25/09/2026,
// question 4). Le client annonce la séance en cours (`?pedagoSession=`) ; le serveur ne la
// croit que si l'élève en a une exécution démarrée et non terminée — un identifiant quelconque,
// une séance brouillon ou déjà terminée n'imposent rien.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const { signAuthToken } = require('../middleware/requireTeacher');
const { loadLearnerLevel } = require('../lib/pedago/learnerLevel');
const { recordRunStart, recordRunComplete } = require('../lib/pedagoSessionRuns');

const stamp = Date.now().toString(36);
const catSlug = `pslcat${stamp}`.slice(0, 64);
const qCollege = `QSC${stamp}`.slice(0, 16);
const qLycee = `QSL${stamp}`.slice(0, 16);
const studentId = `psl-student-${stamp}`.slice(0, 64);
const groupId = `psl-group-${stamp}`.slice(0, 64);
const lyceeSession = `psl-lycee-${stamp}`.slice(0, 36);
const draftSession = `psl-draft-${stamp}`.slice(0, 36);
let plantId = null;
let token = '';

async function insertSession(id, level, notionNiveau, isPublished) {
  await execute(
    `INSERT INTO pedago_sessions (id, slug, title, level, template_key, config_json, steps_json, is_published)
     VALUES (?, ?, 'Séance de test', ?, 'custom', ?, '[]', ?)`,
    [id, id, level, JSON.stringify({ notionNiveau }), isPublished ? 1 : 0],
  );
}

before(async () => {
  await initSchema();
  await execute(
    "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'PSL', 'sciences', 999)",
    [catSlug],
  );
  for (const [code, niveau, n] of [
    [qCollege, 'college', 1],
    [qLycee, 'lycee', 2],
  ]) {
    await execute(
      `INSERT IGNORE INTO quiz_questions
        (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
       VALUES (?, ?, ?, 'Q ?', 'A', 'B', 'C', 'A', ?)`,
      [code, catSlug, n, niveau],
    );
  }
  plantId = (await execute("INSERT INTO plants (name, emoji) VALUES (?, '🌿')", [`PSL ${stamp}`]))
    .insertId;
  for (const code of [qCollege, qLycee]) {
    await execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('plant', ?, ?, 1, 1, 'manual', 'approved')`,
      [String(plantId), code],
    );
  }
  await setSetting('learning.gating.enabled', true, {});
  await execute(
    `INSERT INTO users (id, user_type, pseudo, display_name, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'PSL', 1, NOW(), NOW())`,
    [studentId, `psl${stamp}`.slice(0, 50)],
  );
  // Élève d'une classe de 6ᵉ (cycle 3).
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, curriculum_niveau, is_active) VALUES (?, ?, ?, 'class', 'cycle3', 1)",
    [groupId, groupId, `PSL 601 ${stamp}`],
  );
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [groupId, studentId],
  );
  await insertSession(lyceeSession, 'lycee', 'lycee', true);
  await insertSession(draftSession, 'lycee', 'lycee', false);
  token = await signAuthToken({
    userType: 'student',
    userId: studentId,
    canonicalUserId: studentId,
    roleSlug: 'eleve_novice',
    permissions: [],
  });
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  await execute('DELETE FROM pedago_sessions WHERE id IN (?, ?)', [
    lyceeSession,
    draftSession,
  ]).catch(() => {});
  await execute('DELETE FROM group_members WHERE user_id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code IN (?, ?)', [
    qCollege,
    qLycee,
  ]).catch(() => {});
  await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE question_code IN (?, ?)', [
    qCollege,
    qLycee,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
});

function challenge(sessionParam) {
  const qs = new URLSearchParams({ resourceType: 'plant', resourceRef: String(plantId) });
  if (sessionParam) qs.set('pedagoSession', sessionParam);
  return request(app)
    .get(`/api/learning/gating/challenge?${qs.toString()}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
}

const codes = (res) => (res.body.questions || []).map((q) => q.question_code).sort();

test('hors séance : la classe (cycle 3) borne les questions à celles de collège', async () => {
  const level = await loadLearnerLevel(studentId);
  assert.equal(level.niveau, 'cycle3');
  assert.equal(level.sources.niveau, 'classe');
  assert.deepEqual(codes(await challenge(null)), [qCollege]);
});

test('séance non démarrée, brouillon ou inconnue : rien n’est imposé', async () => {
  assert.deepEqual(codes(await challenge(lyceeSession)), [qCollege], 'pas encore démarrée');
  await recordRunStart(draftSession, studentId);
  assert.deepEqual(codes(await challenge(draftSession)), [qCollege], 'brouillon');
  assert.deepEqual(codes(await challenge('seance-inconnue')), [qCollege]);
});

test('séance lycée démarrée : un élève de 6ᵉ reçoit aussi les questions de lycée', async () => {
  await recordRunStart(lyceeSession, studentId);
  const level = await loadLearnerLevel(studentId, { pedagoSessionId: lyceeSession });
  assert.equal(level.sources.niveau, 'seance');
  assert.equal(level.etape, 'lycee');
  assert.equal(level.maxPalier, 5);
  assert.equal(level.sessionId, lyceeSession);
  assert.deepEqual(codes(await challenge(lyceeSession)), [qCollege, qLycee].sort());
});

test('séance terminée : le niveau de la classe reprend la main', async () => {
  // Deux horodatages à la seconde : la fin doit être postérieure au démarrage.
  await execute(
    'UPDATE pedago_session_runs SET last_started_at = NOW() - INTERVAL 1 MINUTE WHERE session_id = ? AND user_id = ?',
    [lyceeSession, studentId],
  );
  await recordRunComplete(lyceeSession, studentId);
  assert.deepEqual(codes(await challenge(lyceeSession)), [qCollege]);
});

test('module des séances éteint : la séance n’impose plus rien', async () => {
  await recordRunStart(lyceeSession, studentId);
  // Relancée dans la même seconde que la fin précédente : on recule la fin d'une minute.
  await execute(
    'UPDATE pedago_session_runs SET last_completed_at = NOW() - INTERVAL 1 MINUTE WHERE session_id = ? AND user_id = ?',
    [lyceeSession, studentId],
  );
  assert.deepEqual(codes(await challenge(lyceeSession)), [qCollege, qLycee].sort());
  await setSetting('ui.modules.pedago_sessions_enabled', false, {});
  try {
    assert.deepEqual(codes(await challenge(lyceeSession)), [qCollege]);
  } finally {
    await setSetting('ui.modules.pedago_sessions_enabled', true, {});
  }
});

test('GET /api/auth/me expose le niveau résolu par le serveur', async () => {
  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(me.body.learnerLevel?.niveau, 'cycle3');
  assert.equal(me.body.learnerLevel?.etape, 'college');
  assert.equal(me.body.learnerLevel?.maxPalier, 1);
  assert.deepEqual(me.body.biodivGroupCurriculumNiveaux, ['cycle3']);
});
