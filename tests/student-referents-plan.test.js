'use strict';

// Moteur des élèves référents automatiques (lib/tasks/studentReferents.js, lot 3) sur le jeu
// fictif de tests/helpers/studentReferentsFixture.js (forme de l'état du 21/11/2026).

require('./helpers/setup');
const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { initDatabase, execute, queryOne } = require('../database');
const {
  REASONS,
  INACTIVE,
  computeStudentReferentPlan,
  applyStudentReferentPlan,
  filterPlanToSeries,
  runStudentReferentSync,
} = require('../lib/tasks/studentReferents');
const { setSetting } = require('../lib/settings');
const {
  createStudentReferentsFixture,
  EXPECTED_LINKS,
} = require('./helpers/studentReferentsFixture');

let fx = null;

async function plan(overrides = {}, extra = {}) {
  return computeStudentReferentPlan({ config: fx.config(overrides), ...extra });
}

before(async () => {
  await initDatabase();
});

afterEach(async () => {
  if (fx) await fx.cleanup();
  fx = null;
});

test('copie sans liens élève : exactement les douze liens attendus (seuil 2, sans plafond)', async () => {
  fx = await createStudentReferentsFixture();
  const p = await plan();
  assert.equal(p.inactiveReason, null);
  assert.deepEqual(fx.labels(p.toAdd), [...EXPECTED_LINKS]);
  assert.deepEqual(fx.labels(p.toRemove), []);
  const s13 = p.skipped.find((e) => fx.label(e) === 'A:S13');
  assert.equal(s13?.reason, REASONS.NO_ACTIVE_OCCURRENCE, 'série sans occurrence active');
  assert.ok(!fx.labels(p.toAdd).some((l) => l.startsWith('E:')), 'élève hors groupe exclu');
  assert.ok(!fx.labels(p.toAdd).includes('B:S1'), 'sous le seuil');
  const c = p.toAdd.find((e) => fx.label(e) === 'C:S12');
  assert.equal(c.count, 2, 'inscription ancienne sans identifiant comptée (règle de progression)');
});

test('état du 21/11 (douze liens manuels) : 0 ajout, 0 retrait, 12 adoptables', async () => {
  fx = await createStudentReferentsFixture({ links: 'manual' });
  const p = await plan();
  assert.deepEqual(fx.labels(p.toAdd), []);
  assert.deepEqual(fx.labels(p.toRemove), []);
  assert.deepEqual(fx.labels(p.adoptable), [...EXPECTED_LINKS]);
  const summary = await applyStudentReferentPlan(p, { adoptExisting: true, notify: false });
  assert.equal(summary.adopted, 12);
  assert.deepEqual(await fx.linkLabels('auto'), [...EXPECTED_LINKS]);
  assert.deepEqual(await fx.linkLabels('manual'), []);
  const again = await plan();
  assert.deepEqual(fx.labels(again.toAdd), []);
  assert.deepEqual(fx.labels(again.adoptable), []);
  assert.equal(again.kept.filter((k) => fx.label(k)).length, 12);
});

test('idempotence : deux applications = un seul changement', async () => {
  fx = await createStudentReferentsFixture();
  const first = await applyStudentReferentPlan(await plan(), { notify: false });
  assert.ok(first.added >= 12);
  assert.deepEqual(await fx.linkLabels('auto'), [...EXPECTED_LINKS]);
  const p2 = await plan();
  assert.deepEqual(fx.labels(p2.toAdd), []);
  assert.deepEqual(fx.labels(p2.toRemove), []);
});

test('plafond par élève à 3 : A reçoit S8 et S9 (sans référent) puis S3 (3 réalisations)', async () => {
  fx = await createStudentReferentsFixture();
  const p = await plan({ max_series_per_student: 3 });
  const added = fx.labels(p.toAdd);
  assert.deepEqual(
    added.filter((l) => l.startsWith('A:')),
    ['A:S3', 'A:S8', 'A:S9'],
  );
  assert.deepEqual(
    added.filter((l) => !l.startsWith('A:')),
    ['B:S10', 'B:S11', 'C:S12'],
  );
  const capped = p.skipped.filter((e) => e.reason === REASONS.MAX_SERIES_PER_STUDENT);
  assert.equal(fx.labels(capped).length, 6);
});

test('plafond par élève : les liens élève manuels comptent dedans', async () => {
  fx = await createStudentReferentsFixture();
  await fx.setLinks(['A:S1', 'A:S2'], 'manual');
  const p = await plan({ max_series_per_student: 3 });
  assert.deepEqual(
    fx.labels(p.toAdd).filter((l) => l.startsWith('A:')),
    ['A:S9'],
    'deux manuels + un seul automatique (série sans référent la plus récente)',
  );
});

test('plafond par série à 1 : la série déjà servie ne reçoit plus d’élève ; égalités départagées', async () => {
  fx = await createStudentReferentsFixture();
  // B rattrape A sur S2 (même nombre, réalisation plus récente) : B passe devant.
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
     VALUES (?, ?, 'Bravo', ?, '2026-10-20'), (?, ?, 'Bravo', ?, '2026-10-20')`,
    [
      fx.series.S2.validated[0],
      fx.users.B,
      `Ref${fx.stamp}`,
      fx.series.S2.validated[1],
      fx.users.B,
      `Ref${fx.stamp}`,
    ],
  );
  await execute("UPDATE tasks SET validated_at = '2026-10-25 10:00:00' WHERE id = ?", [
    fx.series.S2.validated[1],
  ]);
  const p = await plan({ max_students_per_series: 1 });
  const s2 = fx.labels(p.toAdd).filter((l) => l.endsWith(':S2'));
  assert.equal(s2.length, 1);
  // Même compte (2) et même dernière réalisation : départage par identifiant d'élève.
  assert.deepEqual(s2, [fx.users.A < fx.users.B ? 'A:S2' : 'B:S2']);
  const capped = p.skipped.filter((e) => e.reason === REASONS.MAX_STUDENTS_PER_SERIES);
  assert.equal(fx.labels(capped).length, 1);
});

test('priorité : séries sans aucun référent, puis sans référent élève, puis les autres', async () => {
  fx = await createStudentReferentsFixture();
  const p = await plan({ max_series_per_student: 1 });
  // A : S8 et S9 n'ont aucun référent ; S9 a la réalisation la plus récente.
  assert.deepEqual(
    fx.labels(p.toAdd).filter((l) => l.startsWith('A:')),
    ['A:S9'],
  );
});

test('veto : le couple n’est pas proposé ; un lien auto existant est retiré', async () => {
  fx = await createStudentReferentsFixture({ links: 'auto' });
  await execute(
    'INSERT INTO task_series_referent_vetoes (series_id, user_id, created_at) VALUES (?, ?, NOW())',
    [fx.series.S1.id, fx.users.A],
  );
  const p = await plan();
  assert.deepEqual(fx.labels(p.toRemove), ['A:S1']);
  assert.equal(p.toRemove.find((e) => fx.label(e) === 'A:S1').reason, REASONS.VETO);
  await applyStudentReferentPlan(p, { notify: false });
  const p2 = await plan();
  assert.ok(!fx.labels(p2.toAdd).includes('A:S1'));
});

test('lien manuel jamais retiré ; lien auto retiré quand l’élève sort du groupe', async () => {
  fx = await createStudentReferentsFixture();
  await fx.setLinks(['A:S1', 'A:S2'], 'auto');
  await fx.setLinks(['C:S12'], 'manual');
  await execute('DELETE FROM group_members WHERE group_id = ? AND user_id IN (?, ?)', [
    fx.groupId,
    fx.users.A,
    fx.users.C,
  ]);
  const p = await plan();
  assert.deepEqual(fx.labels(p.toRemove), ['A:S1', 'A:S2']);
  assert.ok(p.toRemove.every((e) => !fx.label(e) || e.reason === REASONS.NOT_ELIGIBLE));
  await applyStudentReferentPlan(p, { notify: false });
  // B (toujours membre) reçoit ses deux séries ; le lien manuel de C reste.
  assert.deepEqual(await fx.linkLabels(), ['B:S10', 'B:S11', 'C:S12']);
});

test('compte désactivé : plus candidat, son lien auto est retiré', async () => {
  fx = await createStudentReferentsFixture({ links: 'auto' });
  await execute('UPDATE users SET is_active = 0 WHERE id = ?', [fx.users.B]);
  const p = await plan();
  assert.deepEqual(fx.labels(p.toRemove), ['B:S10', 'B:S11']);
  assert.deepEqual(fx.labels(p.toAdd), []);
});

test('seuil relevé à 3 : seul A:S3 reste ; les autres liens auto sont retirés', async () => {
  fx = await createStudentReferentsFixture({ links: 'auto' });
  const p = await plan({ min_validations: 3 });
  assert.deepEqual(
    fx.labels(p.toRemove),
    EXPECTED_LINKS.filter((l) => l !== 'A:S3'),
  );
  assert.ok(p.toRemove.every((e) => !fx.label(e) || e.reason === REASONS.BELOW_THRESHOLD));
});

test('inactivité : 0 = désactivée ; à N jours, seuls des liens auto sont retirés', async () => {
  fx = await createStudentReferentsFixture({ links: 'auto' });
  await fx.setLinks(['B:S1'], 'manual');
  const now = new Date('2026-11-21T12:00:00Z');
  const off = await plan({ inactivity_days: 0 }, { now });
  assert.deepEqual(fx.labels(off.toRemove), []);
  // 30 jours avant le 21/11 = 22/10 : aucune réalisation du jeu n'est aussi récente.
  const on = await plan({ inactivity_days: 30 }, { now });
  assert.deepEqual(fx.labels(on.toRemove), [...EXPECTED_LINKS]);
  assert.ok(on.toRemove.every((e) => !fx.label(e) || e.reason === REASONS.INACTIVITY));
  assert.ok(!fx.labels(on.toRemove).includes('B:S1'), 'manuel jamais retiré');
  // À 40 jours (12/10 à midi), A:S3 (dernière réalisation le 17/10) reste.
  const relaxed = await plan({ inactivity_days: 40 }, { now });
  assert.ok(!fx.labels(relaxed.toRemove).includes('A:S3'));
});

test('groupe vide, inexistant ou inactif : moteur inactif, aucune erreur, rien retiré', async () => {
  fx = await createStudentReferentsFixture({ links: 'auto' });
  assert.equal((await plan({ group_id: '' })).inactiveReason, INACTIVE.NO_GROUP);
  assert.equal(
    (await plan({ group_id: 'groupe-qui-n-existe-pas' })).inactiveReason,
    INACTIVE.GROUP_NOT_FOUND,
  );
  await execute('UPDATE `groups` SET is_active = 0 WHERE id = ?', [fx.groupId]);
  const p = await plan();
  assert.equal(p.inactiveReason, INACTIVE.GROUP_INACTIVE);
  assert.deepEqual(p.toRemove, []);
  const summary = await applyStudentReferentPlan(p, { notify: false });
  assert.deepEqual(summary, { added: 0, removed: 0, adopted: 0, links: 0 });
  // Groupe désigné par son identifiant : même résultat que par le slug.
  await execute('UPDATE `groups` SET is_active = 1 WHERE id = ?', [fx.groupId]);
  const byId = await plan({ group_id: fx.groupId });
  assert.equal(byId.group.slug, fx.groupSlug);
});

test('fonction désactivée : le déclencheur n’écrit rien', async () => {
  fx = await createStudentReferentsFixture();
  await setSetting('tasks.student_referent_group_id', fx.groupSlug);
  await setSetting('tasks.student_referent_enabled', false);
  try {
    const res = await runStudentReferentSync({ reason: 'test' });
    assert.equal(res.skipped, 'disabled');
    assert.deepEqual(await fx.linkLabels(), []);
    // Activer l'interrupteur lance la première synchronisation (crochet de réglage) ; l'appel
    // suivant s'enchaîne derrière elle et ne trouve plus rien à faire.
    await setSetting('tasks.student_referent_enabled', true);
    const after = await runStudentReferentSync({ reason: 'test' });
    assert.equal(after.added, 0);
    assert.deepEqual(await fx.linkLabels('auto'), [...EXPECTED_LINKS]);
  } finally {
    await setSetting('tasks.student_referent_enabled', false);
    await setSetting('tasks.student_referent_group_id', '');
  }
  const audit = await queryOne(
    "SELECT action, actor_user_type FROM audit_log WHERE action = 'student_referent_auto_add' AND target_id = ? ORDER BY id DESC LIMIT 1",
    [fx.series.S10.id],
  );
  assert.equal(audit?.actor_user_type, 'system');
});

test('déclencheur ciblé : le plan est restreint à la série demandée', async () => {
  fx = await createStudentReferentsFixture();
  const full = await plan();
  const only = filterPlanToSeries(full, fx.series.S10.id);
  assert.deepEqual(fx.labels(only.toAdd), ['B:S10']);
  assert.equal(only.toAdd.length, 1);
  assert.equal(filterPlanToSeries(full, null), full);
});
