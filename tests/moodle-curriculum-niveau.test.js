'use strict';

// Import Moodle : le groupe créé pour une cohorte reçoit le niveau de la classe déduit de son
// nom, seulement sans ambiguïté (décision du mainteneur du 25/09/2026, question 5 ; même
// règle que la migration 301 et que la proposition du formulaire).

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne } = require('../database');
const { runSync, resetProcessLockForTests } = require('../lib/moodle/syncRun');
const { cohortCurriculumNiveau } = require('../lib/moodle/plan');
const fx = require('./helpers/moodleFixtures');

let fake;
let client;
const stamp = Date.now();

async function apply(cohortIds) {
  return runSync({
    mode: 'apply',
    cohortIds,
    force: true,
    forceReason: 'test',
    deps: { client, settings: fx.buildSettings() },
  });
}

async function groupOfCohort(cohortId) {
  const eg = await queryOne(
    "SELECT group_id FROM external_groups WHERE provider = 'moodle' AND external_id = ?",
    [String(cohortId)],
  );
  return eg ? queryOne('SELECT * FROM `groups` WHERE id = ?', [eg.group_id]) : null;
}

test('règle : le nom fait foi, l’identifiant ne sert qu’à défaut, le doute ne pose rien', () => {
  const niveau = (name, idnumber, kind = 'class') =>
    cohortCurriculumNiveau({ name, idnumber }, kind);
  assert.strictEqual(niveau(`4e 2 ${stamp}`, '26#402'), 'cycle4');
  // Nom muet (« Niveau 4 » : un chiffre isolé ne dit rien), identifiant `26#4` : cycle 4.
  assert.strictEqual(niveau(`Niveau 4 ${stamp}`, '26#4', 'unit'), 'cycle4');
  // Nom qui évoque deux niveaux : pas de repli sur l'identifiant.
  assert.strictEqual(niveau(`1re spé et 2nde ${stamp}`, '26#201'), null);
  // Désaccord entre le nom et l'identifiant.
  assert.strictEqual(niveau('6e A', '26#402'), null);
  // Première sans voie ; équipe ou club : rien.
  assert.strictEqual(niveau('1re générale', '26#101'), null);
  assert.strictEqual(niveau('4e 2', '26#402', 'team'), null);
});

test.before(async () => {
  await initSchema();
  await fx.purgeSyncArtifacts();
  ({ fake, client } = await fx.startFakeMoodle());
});

test.after(async () => {
  await fake.stop();
  await fx.purgeSyncArtifacts();
});

test.beforeEach(() => resetProcessLockForTests());

test('application : niveau posé sur la classe et l’unité créées, rien en cas de doute', async () => {
  fx.seedCohort(fake, {
    id: 402,
    idnumber: '26#402',
    name: `4e 2 ${stamp}`,
    members: [fx.member(4201, 'Quatre', `Deux${stamp}`)],
  });
  fx.seedCohort(fake, {
    id: 4,
    idnumber: '26#4',
    name: `Niveau 4 ${stamp}`,
    members: [],
  });
  fx.seedCohort(fake, {
    id: 201,
    idnumber: '26#201',
    name: `1re spé et 2nde ${stamp}`,
    members: [fx.member(2011, 'Doute', `Mixte${stamp}`)],
  });

  const result = await apply([402, 4, 201]);
  assert.strictEqual(
    result.status,
    'succeeded',
    JSON.stringify(result.report.applied?.failedCohorts),
  );
  const ensure = result.report.actions.find(
    (a) => a.kind === 'group.ensure' && a.cohort === '26#402',
  );
  assert.strictEqual(ensure.payload.curriculumNiveau, 'cycle4', 'annoncé dans le rapport');

  assert.strictEqual((await groupOfCohort(402)).curriculum_niveau, 'cycle4');
  const unit = await groupOfCohort(4);
  assert.strictEqual(unit.kind, 'unit');
  assert.strictEqual(unit.curriculum_niveau, 'cycle4');
  assert.strictEqual((await groupOfCohort(201)).curriculum_niveau, null);
});
