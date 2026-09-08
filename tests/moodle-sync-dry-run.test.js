'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne, queryAll } = require('../database');
const { runSync, getRun, listRuns, resetProcessLockForTests } = require('../lib/moodle/syncRun');
const { dbFingerprint, diffFingerprints } = require('./helpers/dbFingerprint');
const fx = require('./helpers/moodleFixtures');

let fake;
let client;

test.before(async () => {
  await initSchema();
  await fx.purgeSyncArtifacts();
  ({ fake, client } = await fx.startFakeMoodle());
});

test.after(async () => {
  await fake.stop();
  await fx.purgeSyncArtifacts();
});

test.beforeEach(() => {
  resetProcessLockForTests();
});

test('simulation : plan complet sans aucune écriture, rapport structuré', async () => {
  const stamp = Date.now();
  const existing = await fx.createStudent({
    firstName: 'Zoé',
    lastName: `Martin${stamp}`,
    email: `zoe.martin${stamp}@lyautey.test`,
  });
  const byName = await fx.createStudent({
    firstName: 'Paul',
    lastName: `Durand${stamp}`,
    email: null,
  });
  const teacher = await fx.createTeacher({
    firstName: 'Prof',
    lastName: 'X',
    email: `prof${stamp}@lyautey.test`,
  });

  fx.seedCohort(fake, {
    id: 603,
    idnumber: '26#603',
    name: '6e 3',
    members: [
      fx.member(1001, 'Zoé', `Martin${stamp}`, { email: existing.email }), // e-mail
      fx.member(1002, 'Paul', `Durand${stamp}`), // nom
      fx.member(1003, 'Neo', `Vu${stamp}`), // création
      fx.member(1004, 'Prof', 'X', { email: teacher.email }), // conflit enseignant
      fx.member(1005, 'Sus', `Pendu${stamp}`, { suspended: true }), // suspendu : ni créé ni bloquant
    ],
  });
  fake.addCohort({ id: 700, idnumber: '26#club-echecs', name: 'Club' }); // sans politique
  fake.addCohort({ id: 701, idnumber: '25#603', name: 'Ancienne' }); // hors année

  const before = await dbFingerprint();
  const result = await runSync({
    mode: 'dry_run',
    cohortIds: [603],
    deps: { client, settings: fx.buildSettings() },
  });
  const after = await dbFingerprint();
  assert.deepStrictEqual(diffFingerprints(before, after), [], 'une simulation n’écrit rien');

  assert.strictEqual(result.status, 'succeeded');
  const { report } = result;
  assert.strictEqual(report.mode, 'dry_run');
  assert.deepStrictEqual(report.scope.cohortIdnumbers, ['26#603']);
  assert.strictEqual(report.totals.creations, 1);
  assert.strictEqual(report.totals.emailMatches, 1);
  assert.strictEqual(report.totals.nameMatches, 1);
  assert.strictEqual(report.totals.emailConflicts, 1);
  assert.strictEqual(report.totals.deactivations, 0);
  assert.strictEqual(report.lists.unmatchedCohorts.length, 1);
  assert.strictEqual(report.lists.unmatchedCohorts[0].idnumber, '26#club-echecs');
  const kinds = report.actions.map((a) => a.kind);
  assert.ok(kinds.includes('group.ensure'));
  assert.ok(kinds.includes('gl_class.ensure'));
  assert.ok(kinds.includes('user.create'));
  assert.strictEqual(kinds.filter((k) => k === 'user.link').length, 2);
  assert.strictEqual(kinds.filter((k) => k === 'group.member.add').length, 3);
  assert.strictEqual(
    kinds.filter((k) => k === 'gl_player.ensure').length,
    3,
    'un joueur G&L par membre (dont le compte à créer)',
  );
  assert.ok(report.lists.emailMatches[0].user.userId === existing.id);
  assert.ok(report.lists.nameMatches[0].user.userId === byName.id);
  assert.ok(report.lists.offMoodle.length >= 0);
  assert.strictEqual(report.thresholds.blocked, false);

  const row = await getRun(result.runId);
  assert.strictEqual(row.mode, 'dry_run');
  assert.strictEqual(row.status, 'succeeded');
  assert.ok(row.report.totals.creations === 1);
  const list = await listRuns({ limit: 5 });
  assert.ok(list.items.some((r) => r.id === result.runId));
});

test('simulation : contrôles amont bloquants (e-mail absent) → exécution failed, rien d’écrit', async () => {
  fake.state.cohorts = [];
  fake.state.members = new Map();
  fx.seedCohort(fake, {
    id: 604,
    idnumber: '26#604',
    name: '6e 4',
    members: [fx.member(2001, 'Sans', 'Mail', { email: '' })],
  });
  const result = await runSync({
    mode: 'dry_run',
    cohortIds: [604],
    deps: { client, settings: fx.buildSettings() },
  });
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.report.upstreamErrors[0].code, 'member_without_email');
  const run = await queryOne('SELECT status, error_text FROM sync_runs WHERE id = ?', [
    result.runId,
  ]);
  assert.strictEqual(run.status, 'failed');
  assert.match(run.error_text, /Contrôles amont/);
});

test('simulation : périmètre inconnu → 400 ; seuil de création dépassé → blocked dans le rapport', async () => {
  fake.state.cohorts = [];
  fake.state.members = new Map();
  fx.seedCohort(fake, {
    id: 605,
    idnumber: '26#605',
    name: '6e 5',
    members: [fx.member(3001, 'Un', 'Nouveau'), fx.member(3002, 'Deux', 'Nouveau')],
  });
  await assert.rejects(
    runSync({ mode: 'dry_run', cohortIds: [9999], deps: { client, settings: fx.buildSettings() } }),
    (err) => err.status === 400,
  );
  const strict = fx.buildSettings({ thresholds: { createPct: 0.0001 } });
  const result = await runSync({
    mode: 'dry_run',
    cohortIds: [605],
    deps: { client, settings: strict },
  });
  assert.strictEqual(result.status, 'succeeded');
  assert.strictEqual(result.report.thresholds.blocked, true);
  assert.strictEqual(result.report.thresholds.breaches[0].key, 'create_pct');
});

test('verrou : une exécution en cours refuse la suivante (409)', async () => {
  fake.state.cohorts = [];
  fake.state.members = new Map();
  fx.seedCohort(fake, {
    id: 606,
    idnumber: '26#606',
    name: '6e 6',
    members: [fx.member(4001, 'Lock', 'Un')],
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const slowClient = {
    ...client,
    searchCohorts: async (...args) => {
      await gate;
      return client.searchCohorts(...args);
    },
  };
  const first = runSync({
    mode: 'dry_run',
    cohortIds: [606],
    deps: { client: slowClient, settings: fx.buildSettings() },
  });
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(
    runSync({ mode: 'dry_run', cohortIds: [606], deps: { client, settings: fx.buildSettings() } }),
    (err) => err.status === 409,
  );
  release();
  const result = await first;
  assert.strictEqual(result.status, 'succeeded');
  const running = await queryAll("SELECT id FROM sync_runs WHERE status = 'running'");
  assert.strictEqual(running.length, 0);
});

test('mode invalide → 400 ; apply sans réglage enabled → 409', async () => {
  await assert.rejects(
    runSync({ mode: 'nope', deps: { client, settings: fx.buildSettings() } }),
    (e) => e.status === 400,
  );
  await assert.rejects(
    runSync({
      mode: 'apply',
      cohortIds: [606],
      deps: { client, settings: fx.buildSettings({ enabled: false }) },
    }),
    (e) => e.status === 409,
  );
});
