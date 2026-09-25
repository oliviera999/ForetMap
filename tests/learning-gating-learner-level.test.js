'use strict';

// Filtre de niveau du verrouillage (audit du 25/09/2026, § 1.3.2 et § 3.2.2 ; décision Q1 du
// mainteneur). Avant : 84 fiches et 67 termes n'étaient gardés que par des questions de lycée,
// posées à des élèves de collège. Après : l'élève de collège ne reçoit que les questions à son
// niveau ; si la fiche n'en a aucune, toutes restent posées (« garde les questions »).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, execute } = require('../database');
const db = require('../database');
const { setSetting } = require('../lib/settings');
const { getChallengeState } = require('../lib/learningGatingAcknowledge');
const { loadLearnerLevel } = require('../lib/pedago/learnerLevel');

const stamp = Date.now();
const catSlug = `lvcat${stamp}`.slice(0, 64);
const qCollege = `QLC${stamp}`.slice(0, 16);
const qLycee = `QLL${stamp}`.slice(0, 16);
const studentId = `lv-student-${stamp}`.slice(0, 64);
const groupId = `lv-group-${stamp}`.slice(0, 64);
let plantBoth = null;
let plantLyceeOnly = null;

before(async () => {
  await initSchema();
  await execute(
    "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'LV', 'sciences', 999)",
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
  plantBoth = (
    await execute("INSERT INTO plants (name, emoji) VALUES (?, '🌿')", [`LV deux ${stamp}`])
  ).insertId;
  plantLyceeOnly = (
    await execute("INSERT INTO plants (name, emoji) VALUES (?, '🌿')", [`LV lycée ${stamp}`])
  ).insertId;
  const link = (ref, code) =>
    execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('plant', ?, ?, 1, 1, 'manual', 'approved')`,
      [String(ref), code],
    );
  await link(plantBoth, qCollege);
  await link(plantBoth, qLycee);
  await link(plantLyceeOnly, qLycee);
  // Politique « toutes les questions » : le jeu posé est exactement le jeu éligible.
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'plant' AND resource_ref IN (?, ?)",
    [String(plantBoth), String(plantLyceeOnly)],
  ).catch(() => {});
  await setSetting('learning.gating.enabled', true, {});
  await execute(
    `INSERT IGNORE INTO users (id, user_type, pseudo, display_name, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'LV', 1, NOW(), NOW())`,
    [studentId, `lv${stamp}`.slice(0, 50)],
  );
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  await execute('DELETE FROM group_members WHERE user_id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code IN (?, ?)', [
    qCollege,
    qLycee,
  ]).catch(() => {});
  await execute('DELETE FROM plants WHERE id IN (?, ?)', [plantBoth, plantLyceeOnly]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_questions WHERE question_code IN (?, ?)', [
    qCollege,
    qLycee,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
});

const codesOf = (state) => state.questions.map((q) => q.question_code).sort();

test('élève sans groupe (défaut Collège) : seule la question de collège verrouille', async () => {
  const learnerLevel = await loadLearnerLevel(studentId);
  assert.equal(learnerLevel.etape, 'college');
  const state = await getChallengeState(db, {
    product: 'fm',
    resourceType: 'plant',
    resourceRef: String(plantBoth),
    userId: studentId,
    learnerLevel,
  });
  assert.equal(state.ok, true);
  assert.deepEqual(codesOf(state), [qCollege]);
  assert.equal(state.level_fallback, 'none');
});

test('fiche gardée seulement par du lycée : repli sur toutes ses questions (décision Q1)', async () => {
  const learnerLevel = await loadLearnerLevel(studentId);
  const state = await getChallengeState(db, {
    product: 'fm',
    resourceType: 'plant',
    resourceRef: String(plantLyceeOnly),
    userId: studentId,
    learnerLevel,
  });
  assert.equal(state.required, true);
  assert.deepEqual(codesOf(state), [qLycee]);
  assert.equal(state.level_fallback, 'all_levels');
});

test('élève d’un groupe Lycée : toutes les questions (le défaut Collège ne plafonne pas)', async () => {
  await execute(
    "INSERT INTO `groups` (id, slug, name, pedago_level, is_active) VALUES (?, ?, ?, 'lycee', 1)",
    [groupId, `lv-lycee-${stamp}`.slice(0, 64), `LV lycée ${stamp}`],
  );
  await execute(
    "INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')",
    [groupId, studentId],
  );
  const learnerLevel = await loadLearnerLevel(studentId);
  assert.equal(learnerLevel.etape, 'lycee');
  const state = await getChallengeState(db, {
    product: 'fm',
    resourceType: 'plant',
    resourceRef: String(plantBoth),
    userId: studentId,
    learnerLevel,
  });
  assert.deepEqual(codesOf(state), [qCollege, qLycee].sort());
});

test('compte non élève : aucun niveau, aucun filtre', async () => {
  assert.equal(await loadLearnerLevel(null), null);
  assert.equal(await loadLearnerLevel('compte-inexistant'), null);
});
