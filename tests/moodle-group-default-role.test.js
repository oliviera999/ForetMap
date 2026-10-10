'use strict';

// Synchronisation Moodle : une politique qui nomme un profil qui n'est pas un profil élève
// (politique enregistrée avant la garde d'écriture) donne un groupe **sans** profil par défaut,
// signalé par l'alerte `policy_role_not_student` ; ses membres restent visiteurs.
// Règle : `lib/groupDefaultRolePolicy.js` (un groupe ne confère qu'un profil élève).

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne } = require('../database');
const { runSync, resetProcessLockForTests } = require('../lib/moodle/syncRun');
const { getPrimaryRoleForUser } = require('../lib/rbac');
const fx = require('./helpers/moodleFixtures');

let fake;
let client;
const stamp = Date.now();

// `buildSettings` passe par `normalizePolicies` (forme seule) : c'est l'état d'une politique
// déjà enregistrée, que la lecture continue d'accepter.
const settings = () =>
  fx.buildSettings({
    policies: [
      {
        key: 'encadrement',
        pattern: '^{year}#enc',
        group_kind: 'class',
        role: 'prof',
        n3beur: true,
        create_accounts: true,
      },
      {
        key: 'novices',
        pattern: '^{year}#nov',
        group_kind: 'class',
        role: 'eleve_novice',
        create_accounts: true,
      },
    ],
  });

async function apply(cohortIds) {
  return runSync({
    mode: 'apply',
    cohortIds,
    force: true,
    forceReason: 'test',
    deps: { client, settings: settings() },
  });
}

async function groupOfCohort(cohortId) {
  const eg = await queryOne(
    "SELECT group_id FROM external_groups WHERE provider = 'moodle' AND external_id = ?",
    [String(cohortId)],
  );
  return eg ? queryOne('SELECT * FROM `groups` WHERE id = ?', [eg.group_id]) : null;
}

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

test('cohorte d’une politique « prof » : groupe sans profil par défaut, membres visiteurs', async () => {
  fx.seedCohort(fake, {
    id: 9301,
    idnumber: '26#enc1',
    name: `Encadrement ${stamp}`,
    members: [fx.member(93011, 'Sans', `Encadrement${stamp}`)],
  });
  fx.seedCohort(fake, {
    id: 9302,
    idnumber: '26#nov1',
    name: `Novices ${stamp}`,
    members: [fx.member(93021, 'Avec', `Novice${stamp}`)],
  });

  const result = await apply([9301, 9302]);
  assert.strictEqual(
    result.status,
    'succeeded',
    JSON.stringify(result.report.applied?.failedCohorts),
  );
  const alert = (result.report.lists?.alerts || []).find(
    (a) => a.code === 'policy_role_not_student' && a.cohort === '26#enc1',
  );
  assert.ok(alert, 'alerte policy_role_not_student attendue');

  const encadrement = await groupOfCohort(9301);
  assert.ok(encadrement, 'groupe créé');
  assert.strictEqual(encadrement.default_role_id, null);
  const novices = await groupOfCohort(9302);
  const novice = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice'");
  assert.strictEqual(Number(novices.default_role_id), Number(novice.id));

  const member = await queryOne(
    "SELECT u.id FROM users u WHERE u.auth_provider = 'moodle' AND u.last_name = ?",
    [`Encadrement${stamp}`],
  );
  assert.ok(member, 'compte créé par la synchronisation');
  assert.strictEqual((await getPrimaryRoleForUser('student', member.id))?.slug, 'visiteur');
});
