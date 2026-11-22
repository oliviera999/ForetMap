'use strict';

// Élèves référents automatiques — lot 5 : script de reprise (simulation, --adopt-existing,
// --apply), liste blanche des scripts d'exploitation, action `student_referents` du connecteur.
// Critères du prompt rejoués sur le jeu fictif (forme de l'état du 21/11/2026).

require('./helpers/setup');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const mcp = require('./helpers/mcpFixtures');

mcp.enableMcpEnv();

const { initDatabase } = require('../database');
const { app } = require('../server');
const { setSetting } = require('../lib/settings');
const { main, parseArgs } = require('../scripts/student-referents-sync');
const ops = require('../lib/mcp/domains/opsScripts');
const {
  createStudentReferentsFixture,
  EXPECTED_LINKS,
} = require('./helpers/studentReferentsFixture');

let fx = null;
let adminToken;

async function runScript(args) {
  const lines = [];
  const out = await main(args, { log: (l) => lines.push(String(l)) });
  return { ...out, text: lines.join('\n') };
}

before(async () => {
  await initDatabase();
  const admin = await mcp.createAccount('admin');
  adminToken = (await mcp.obtainTokens(app, admin)).access_token;
});

after(async () => {
  await mcp.cleanupAccounts();
});

afterEach(async () => {
  await setSetting('tasks.student_referent_enabled', false);
  await setSetting('tasks.student_referent_group_id', '');
  if (fx) await fx.cleanup();
  fx = null;
});

test('parseArgs : simulation par défaut, surcharges reconnues, option inconnue signalée', () => {
  const a = parseArgs(['--group=moodle-26-n3', '--max-series=3', '--adopt-existing']);
  assert.equal(a.apply, false);
  assert.equal(a.adopt, true);
  assert.deepEqual(a.overrides, { group_id: 'moodle-26-n3', max_series_per_student: 3 });
  assert.deepEqual(parseArgs(['--rm=-rf']).errors.length, 1);
});

test('état du 21/11 : simulation 0 ajout, 0 retrait ; --adopt-existing simulé = 12 conversions, rien écrit', async () => {
  fx = await createStudentReferentsFixture({ links: 'manual' });
  const sim = await runScript([`--group=${fx.groupSlug}`]);
  assert.deepEqual(fx.labels(sim.plan.toAdd), []);
  assert.deepEqual(fx.labels(sim.plan.toRemove), []);
  assert.match(sim.text, /Simulation : rien n’a été écrit/);
  const adopt = await runScript([`--group=${fx.groupSlug}`, '--adopt-existing']);
  assert.deepEqual(fx.labels(adopt.plan.adoptable), [...EXPECTED_LINKS]);
  assert.match(adopt.text, /À convertir en auto/);
  assert.deepEqual(await fx.linkLabels('auto'), [], 'simulation : aucune écriture');
});

test('copie sans liens élève : simulation = exactement les 12 liens ; plafond 3 ; inactivité 30', async () => {
  fx = await createStudentReferentsFixture();
  const sim = await runScript([`--group=${fx.groupSlug}`]);
  assert.deepEqual(fx.labels(sim.plan.toAdd), [...EXPECTED_LINKS]);
  assert.doesNotMatch(sim.text, /Alpha|Bravo|Charlie/, 'aucun nom d’élève dans la sortie');
  const capped = await runScript([`--group=${fx.groupSlug}`, '--max-series=3']);
  assert.deepEqual(
    fx.labels(capped.plan.toAdd).filter((l) => l.startsWith('A:')),
    ['A:S3', 'A:S8', 'A:S9'],
  );
  // Inactivité à 30 j : retraits listés seulement parmi les liens auto.
  await fx.setLinks(['A:S1', 'A:S2'], 'auto');
  await fx.setLinks(['B:S10'], 'manual');
  const inactive = await runScript([`--group=${fx.groupSlug}`, '--inactivity-days=30']);
  assert.deepEqual(fx.labels(inactive.plan.toRemove), ['A:S1', 'A:S2']);
});

test('--apply : refusé avec des surcharges, refusé fonction désactivée, puis reprise effective', async () => {
  fx = await createStudentReferentsFixture({ links: 'manual' });
  await assert.rejects(runScript(['--apply', `--group=${fx.groupSlug}`]), /refusées avec --apply/);
  await setSetting('tasks.student_referent_group_id', fx.groupSlug);
  await assert.rejects(runScript(['--apply', '--adopt-existing']), /activer la fonction/);
  await setSetting('tasks.student_referent_enabled', true);
  const res = await runScript(['--apply', '--adopt-existing']);
  assert.equal(res.applied.adopted, 12);
  assert.equal(res.applied.added, 0);
  assert.deepEqual(await fx.linkLabels('auto'), [...EXPECTED_LINKS]);
});

test('liste blanche : student_referents_sync, simulation par défaut, --apply en application', () => {
  const listed = ops.listScripts().find((x) => x.id === 'student_referents_sync');
  assert.ok(listed);
  assert.equal(listed.apply_available, true);
  assert.deepEqual(ops.buildArgs('student_referents_sync', {}, { apply: false }), []);
  assert.deepEqual(
    ops.buildArgs('student_referents_sync', { 'adopt-existing': true }, { apply: true }),
    ['--adopt-existing', '--apply'],
  );
  assert.deepEqual(
    ops.buildArgs(
      'student_referents_sync',
      { group: 'moodle-26-n3', 'max-series': '3' },
      { apply: false },
    ),
    ['--group=moodle-26-n3', '--max-series=3'],
  );
  assert.throws(
    () => ops.buildArgs('student_referents_sync', { group: 'x; rm -rf /' }, { apply: false }),
    /refusée/,
  );
});

test('connecteur : foretmap_tasks student_referents (lecture seule, par série et par élève)', async () => {
  fx = await createStudentReferentsFixture();
  await setSetting('tasks.student_referent_group_id', fx.groupSlug);
  const r = await mcp.callTool(app, adminToken, 'foretmap_tasks', { action: 'student_referents' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.enabled, false);
  assert.equal(r.data.group.slug, fx.groupSlug);
  assert.ok(r.data.totals.to_add >= 12);
  assert.deepEqual(
    r.data.by_series[fx.series.S10.id].to_add.map((e) => e.user_id),
    [fx.users.B],
  );
  assert.equal(r.data.by_student[fx.users.A].to_add.length, 9);
  assert.deepEqual(await fx.linkLabels(), [], 'lecture seule');
});
