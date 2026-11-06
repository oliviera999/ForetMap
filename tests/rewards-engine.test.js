'use strict';

/**
 * Moteur de badges (lot E) : règle de crédit, familles aux seuils exacts (n - 1 → rien,
 * n → palier), suites « Fidèle au poste » et « Parole tenue », Cycle complet, Phénologue aux
 * bornes de saison, Notion maîtrisée, idempotence (`INSERT IGNORE`), jamais de retrait,
 * encadrement éligible et visiteurs exclus, module éteint (attribution sans annonce), erreur d'évaluation
 * sans effet sur l'action, longueur des clés.
 */

require('./helpers/setup');
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { setSetting } = require('../lib/settings');
const rewards = require('../lib/rewards');
const { creditedTasksQuery } = require('../lib/rewards/creditedTasks');
const metrics = require('../lib/rewards/metrics');
const { scheduleRewardsEvaluation } = require('../lib/rewards/evaluator');

const { initSchema, queryAll, queryOne, execute } = db;
const MODULE_KEY = 'ui.modules.rewards_enabled';
let moduleSnapshot;
let roleThresholds = [];

const uid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

async function createUser({ type = 'student', role = 'eleve_novice' } = {}) {
  const id = uid(type === 'student' ? 'rw-stu' : 'rw-tea');
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, 'Badge', ?, 'Badge Test', 'x', 'local', 1, NOW(), NOW())`,
    [id, type, id],
  );
  if (type === 'student' && role) await setStudentPrimaryRole(id, role);
  return id;
}

async function createTask(opts = {}) {
  const id = opts.id || uid('rw-task');
  await execute(
    `INSERT INTO tasks (id, title, description, map_id, project_id, required_students, status,
                        completion_mode, category, format, project_phase, recurrence,
                        recurrence_series_id, due_date, validated_at, archived_at,
                        proposed_by_user_id, created_at)
     VALUES (?, ?, '', 'foret', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.title || `Tâche ${id}`,
      opts.projectId || null,
      opts.status || 'validated',
      opts.completionMode || 'single_done',
      opts.category || null,
      opts.format || null,
      opts.phase || null,
      opts.recurrence || null,
      opts.seriesId || null,
      opts.dueDate || null,
      opts.status === undefined || opts.status === 'validated'
        ? opts.validatedAt === undefined
          ? new Date()
          : opts.validatedAt
        : null,
      opts.archivedAt || null,
      opts.proposedBy || null,
      opts.createdAt || new Date(),
    ],
  );
  return id;
}

async function assign(taskId, studentId, { doneAt = null, assignedAt = new Date() } = {}) {
  await execute(
    `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at, done_at)
     VALUES (?, ?, 'Badge', ?, ?, ?)`,
    [taskId, studentId, studentId, assignedAt, doneAt],
  );
}

async function creditedTask(studentId, opts = {}) {
  const id = await createTask(opts);
  await assign(id, studentId, opts.assignment || {});
  return id;
}

async function rewardKeys(userId) {
  const rows = await queryAll('SELECT reward_key FROM user_rewards WHERE user_id = ?', [userId]);
  return rows.map((r) => r.reward_key).sort();
}

before(async () => {
  await initSchema();
  moduleSnapshot = await snapshotSetting(MODULE_KEY);
  roleThresholds = await queryAll(
    "SELECT slug, min_done_tasks FROM roles WHERE slug LIKE 'eleve\\_%' OR slug = 'n3beur_bebe'",
  );
});

after(async () => {
  await restoreSetting(moduleSnapshot);
  // La progression n3beur peut avoir relevé des paliers : seuils inchangés par ce fichier.
  for (const r of roleThresholds) {
    await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [r.min_done_tasks, r.slug]);
  }
});

describe('Règle de crédit (creditedTasksQuery)', () => {
  test('validation, part faite en collectif, archivée comptée, « test » et ancien format exclus', async () => {
    const s = await createUser();
    const ok = await creditedTask(s);
    const archived = await creditedTask(s, { archivedAt: new Date() });
    const collectiveDone = await creditedTask(s, {
      completionMode: 'all_assignees_done',
      assignment: { doneAt: new Date() },
    });
    await creditedTask(s, { completionMode: 'all_assignees_done' }); // part non faite
    await creditedTask(s, { status: 'done' });
    await creditedTask(s, { validatedAt: null }); // validée sans date
    await creditedTask(s, { title: '  Test ' });
    const legacy = await createTask();
    await execute(
      `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
       VALUES (?, NULL, 'Badge', ?, NOW())`,
      [legacy, s],
    );
    const c = creditedTasksQuery({ userId: s });
    const rows = await queryAll(`SELECT task_id FROM (${c.sql}) c`, c.params);
    assert.deepEqual(rows.map((r) => r.task_id).sort(), [ok, archived, collectiveDone].sort());
  });
});

describe('Familles aux seuils exacts', () => {
  test('Main verte : 1 tâche → rien, 2 → Bourgeon', async () => {
    const s = await createUser();
    await creditedTask(s, { category: 'jardinage' });
    assert.deepEqual(await rewards.evaluateUser(s, { families: ['metiers'] }), []);
    await creditedTask(s, { category: 'jardinage' });
    const got = await rewards.evaluateUser(s, { families: ['metiers'] });
    assert.deepEqual(
      got.map((r) => r.key),
      ['metier.jardinage.1'],
    );
    assert.equal(got[0].tier, 1);
  });

  test('Colibri (Flash) : 2 → rien, 3 → Bourgeon ; Écotone : 3 métiers distincts', async () => {
    const s = await createUser();
    for (const category of ['jardinage', 'animaux']) {
      await creditedTask(s, { category, format: 'flash' });
    }
    let keys = (await rewards.evaluateUser(s)).map((r) => r.key);
    assert.ok(!keys.includes('format.colibri.1'));
    assert.ok(!keys.includes('ecotone.1'));
    await creditedTask(s, { category: 'entretien', format: 'flash' });
    keys = (await rewards.evaluateUser(s)).map((r) => r.key);
    assert.ok(keys.includes('format.colibri.1'));
    assert.ok(keys.includes('ecotone.1'));
  });

  test('phases et Cycle complet : projet validé, ≥ 3 phases, crédité dans chacune', async () => {
    const s = await createUser();
    const project = uid('rw-proj');
    await execute(
      "INSERT INTO task_projects (id, map_id, title, status, created_at) VALUES (?, 'foret', 'Projet badges', 'validated', NOW())",
      [project],
    );
    await creditedTask(s, { projectId: project, phase: 'concevoir' });
    await creditedTask(s, { projectId: project, phase: 'realiser' });
    // Troisième phase représentée, menée par quelqu'un d'autre : pas de cycle complet.
    const other = await createUser();
    const tester = await creditedTask(other, { projectId: project, phase: 'tester' });
    let keys = (await rewards.evaluateUser(s, { families: ['projet'] })).map((r) => r.key);
    assert.ok(keys.includes('phase.concevoir.1'));
    assert.ok(keys.includes('phase.realiser.1'));
    assert.ok(!keys.includes('projet.cycle_complet'));
    await assign(tester, s);
    keys = (await rewards.evaluateUser(s, { families: ['projet'] })).map((r) => r.key);
    assert.deepEqual(keys.sort(), ['phase.tester.1', 'projet.cycle_complet']);
  });

  test('Fidèle au poste : suite d’occurrences consécutives d’une même série', async () => {
    const s = await createUser();
    const series = uid('rw-series');
    const dates = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];
    const ids = [];
    for (const dueDate of dates) {
      ids.push(
        await createTask({ seriesId: series, recurrence: 'weekly', dueDate, format: 'routine' }),
      );
    }
    // Crédité aux occurrences 1, 2, 4, 5 : la plus longue suite vaut 2.
    for (const i of [0, 1, 3, 4]) await assign(ids[i], s);
    assert.ok(
      !(await rewards.evaluateUser(s, { families: ['engagement'] })).some(
        (r) => r.key === 'format.fidele.1',
      ),
    );
    await assign(ids[2], s);
    const keys = (await rewards.evaluateUser(s, { families: ['engagement'] })).map((r) => r.key);
    assert.ok(keys.includes('format.fidele.1'), 'suite de 5 ≥ 3');
    assert.equal(
      metrics.longestSeriesStreak([
        { series: 'a', credited: 1, due_date: '2026-01-03' },
        { series: 'a', credited: 0, due_date: '2026-01-02' },
        { series: 'a', credited: 1, due_date: '2026-01-01' },
        { series: 'b', credited: 1, due_date: '2026-01-01' },
        { series: 'b', credited: 1, due_date: '2026-01-02' },
      ]),
      2,
    );
  });

  test('Parole tenue : une désinscription de soi-même casse la suite', async () => {
    const s = await createUser();
    const base = new Date('2026-10-01T08:00:00Z').getTime();
    for (let i = 0; i < 4; i += 1) {
      await creditedTask(s, { assignment: { assignedAt: new Date(base + i * 3600e3) } });
    }
    await execute(
      `INSERT INTO audit_log (action, target_type, target_id, details, created_at, actor_user_type, actor_user_id)
       VALUES ('unassign_task', 'task', 'x', 'désinscription', ?, 'student', ?)`,
      [new Date(base + 4 * 3600e3), s],
    );
    for (let i = 5; i < 9; i += 1) {
      await creditedTask(s, { assignment: { assignedAt: new Date(base + i * 3600e3) } });
    }
    assert.ok(
      !(await rewards.evaluateUser(s, { families: ['engagement'] })).some(
        (r) => r.key === 'engagement.parole.1',
      ),
      '4 puis 4 : pas de suite de 5',
    );
    await creditedTask(s, { assignment: { assignedAt: new Date(base + 10 * 3600e3) } });
    const keys = (await rewards.evaluateUser(s, { families: ['engagement'] })).map((r) => r.key);
    assert.ok(keys.includes('engagement.parole.1'));
  });

  test('Phénologue : bornes de saison et année scolaire ; Racines : deux années', async () => {
    assert.equal(metrics.schoolSeasonOf(new Date(2026, 10, 30)), 0);
    assert.equal(metrics.schoolSeasonOf(new Date(2026, 11, 1)), 1);
    assert.equal(metrics.schoolSeasonOf(new Date(2027, 1, 28)), 1);
    assert.equal(metrics.schoolSeasonOf(new Date(2027, 2, 1)), 2);
    assert.equal(metrics.schoolSeasonOf(new Date(2027, 5, 1)), 3);
    assert.equal(metrics.schoolYearOf(new Date(2027, 7, 31)), 2026);
    assert.equal(metrics.schoolYearOf(new Date(2027, 8, 1)), 2027);
    // Août et septembre : même saison « calendaire » voisine, mais deux années scolaires.
    assert.equal(
      metrics.maxSeasonsInSchoolYear([
        new Date(2027, 7, 31),
        new Date(2027, 8, 1),
        new Date(2027, 11, 1),
      ]),
      2,
    );

    // Date du travail = inscription : des tâches de trois saisons validées toutes le même
    // jour d'été (validation en bloc) comptent bien pour trois saisons.
    const bulkValidation = new Date(2027, 6, 22);
    const done = (assignedAt) => ({ validatedAt: bulkValidation, assignment: { assignedAt } });
    const s = await createUser();
    await creditedTask(s, done(new Date(2026, 9, 10)));
    await creditedTask(s, done(new Date(2027, 0, 10)));
    let keys = (await rewards.evaluateUser(s, { families: ['temps'] })).map((r) => r.key);
    assert.deepEqual(keys, [], 'deux saisons seulement');
    await creditedTask(s, done(new Date(2027, 3, 10)));
    keys = (await rewards.evaluateUser(s, { families: ['temps'] })).map((r) => r.key);
    assert.deepEqual(keys, ['temps.phenologue']);
    await creditedTask(s, {
      validatedAt: new Date(2027, 9, 20),
      assignment: { assignedAt: new Date(2027, 9, 10) },
    });
    keys = (await rewards.evaluateUser(s, { families: ['temps'] })).map((r) => r.key);
    assert.deepEqual(keys, ['temps.racines']);
  });

  test('Semeur d’idées et Tuteur', async () => {
    const s = await createUser();
    await createTask({ proposedBy: s, status: 'proposed' });
    assert.ok(!(await rewards.evaluateUser(s, { families: ['collectif'] })).length);
    await createTask({ proposedBy: s, status: 'available' });
    let keys = (await rewards.evaluateUser(s, { families: ['collectif'] })).map((r) => r.key);
    assert.deepEqual(keys, ['collectif.semeur.1']);

    const tutee = await createUser();
    for (let i = 0; i < 2; i += 1) {
      const t = await creditedTask(tutee);
      await execute('INSERT INTO task_referents (task_id, user_id) VALUES (?, ?)', [t, s]);
    }
    // Référent de sa propre tâche seulement : ne compte pas.
    const own = await creditedTask(s);
    await execute('INSERT INTO task_referents (task_id, user_id) VALUES (?, ?)', [own, s]);
    keys = (await rewards.evaluateUser(s, { families: ['collectif'] })).map((r) => r.key);
    assert.deepEqual(keys, ['collectif.tuteur.1']);
  });

  test('savoirs : Herbier vivant, Entomologiste, Lecteur de terrain', async () => {
    const s = await createUser();
    const plants = [];
    for (const [kingdom, phylum] of [
      ['Animal (Métazoaires)', 'Arthropoda'],
      ['Animal (Métazoaires)', 'Mollusca'],
      ['Animal (Métazoaires)', 'Chordata'],
    ]) {
      const r = await execute(
        "INSERT INTO plants (name, emoji, description, taxon_kingdom, taxon_phylum) VALUES (?, '🐞', '', ?, ?)",
        [uid('Espèce'), kingdom, phylum],
      );
      plants.push(r.insertId);
    }
    for (const plantId of plants) {
      await execute(
        `INSERT INTO species_observations (observer_user_id, map_id, plant_id, observed_at, body, status)
         VALUES (?, 'foret', ?, CURRENT_DATE, 'vu', 'validee')`,
        [s, plantId],
      );
    }
    await execute(
      `INSERT INTO species_observations (observer_user_id, map_id, plant_id, observed_at, body, status)
       VALUES (?, 'foret', ?, CURRENT_DATE, 'vu', 'soumise')`,
      [s, plants[0]],
    );
    const tutorial = await queryOne('SELECT id FROM tutorials ORDER BY id LIMIT 1');
    const questions = await queryAll(
      'SELECT question_code FROM quiz_questions ORDER BY question_code LIMIT 1',
    );
    // Lien question ↔ tutoriel dans la source unique (`resource_question_links`), retiré en
    // fin de test : il ne doit pas fausser les contrôles de contenu qui tournent après.
    let createdLinkId = null;
    if (tutorial && questions.length) {
      const existing = await queryOne(
        `SELECT id FROM resource_question_links
          WHERE resource_type = 'tutorial' AND resource_ref = ? AND question_code = ?`,
        [String(tutorial.id), questions[0].question_code],
      );
      if (!existing) {
        const link = await execute(
          `INSERT INTO resource_question_links
             (resource_type, resource_ref, question_code, is_gating, weight, origin, status, created_at, updated_at)
           VALUES ('tutorial', ?, ?, 0, 1, 'manual', 'approved', NOW(), NOW())`,
          [String(tutorial.id), questions[0].question_code],
        );
        createdLinkId = link.insertId;
      }
      await execute(
        'INSERT INTO user_tutorial_reads (user_id, tutorial_id, acknowledged_at) VALUES (?, ?, ?)',
        [s, tutorial.id, new Date(Date.now() - 3600e3)],
      );
      await execute(
        'INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct, answered_at) VALUES (?, ?, NULL, 1, NOW())',
        [s, questions[0].question_code],
      );
    }
    const values = await rewards.computeRewardValues(s, { families: ['nature'] });
    const v = Object.fromEntries(values.map((x) => [x.entry.key, x.value]));
    assert.equal(v['nature.herbier'], 3, 'espèces distinctes validées');
    assert.equal(v['nature.entomo'], 2, 'invertébrés seulement');
    if (createdLinkId) {
      await execute('DELETE FROM resource_question_links WHERE id = ?', [createdLinkId]);
    }
    if (tutorial && questions.length) assert.equal(v['nature.lecteur'], 1);
    assert.equal(typeof v['nature.notion'], 'number', 'requête des notions exécutée');
    const keys = (await rewards.evaluateUser(s, { families: ['nature'] })).map((r) => r.key);
    assert.ok(keys.includes('nature.herbier.1'));
    assert.ok(keys.includes('nature.entomo.1'));
  });

  test('Notion maîtrisée : 5 questions distinctes réussies et 80 % sur les 10 dernières', () => {
    const attempt = (code, ok) => ({
      notion_id: 'n1',
      question_code: code,
      is_correct: ok ? 1 : 0,
    });
    const fiveDistinct = ['a', 'b', 'c', 'd', 'e'].map((c) => attempt(c, true));
    assert.equal(metrics.countMasteredNotions(fiveDistinct.slice(0, 4)), 0, '4 questions');
    assert.equal(metrics.countMasteredNotions(fiveDistinct), 1);
    // Plus récentes d'abord : 3 échecs sur les 10 dernières → 70 %.
    const recentFailures = [
      attempt('a', false),
      attempt('b', false),
      attempt('c', false),
      ...['a', 'b', 'c', 'd', 'e', 'a', 'b'].map((c) => attempt(c, true)),
    ];
    assert.equal(metrics.countMasteredNotions(recentFailures), 0);
    recentFailures.shift();
    recentFailures.push(attempt('c', true));
    assert.equal(metrics.countMasteredNotions(recentFailures), 1, '8 sur 10');
  });
});

describe('Attribution', () => {
  test('idempotence (INSERT IGNORE) et jamais de retrait', async () => {
    const s = await createUser();
    const t1 = await creditedTask(s, { category: 'bricolage' });
    const first = await rewards.evaluateUser(s, { source: { type: 'task', ref: t1 } });
    assert.ok(first.some((r) => r.key === 'metier.bricolage.1'));
    assert.deepEqual(await rewards.evaluateUser(s), [], 'rien de nouveau');
    const row = await queryOne(
      "SELECT source_type, source_ref FROM user_rewards WHERE user_id = ? AND reward_key = 'metier.bricolage.1'",
      [s],
    );
    assert.deepEqual({ ...row }, { source_type: 'task', source_ref: t1 });
    await execute("UPDATE tasks SET status = 'available', validated_at = NULL WHERE id = ?", [t1]);
    assert.deepEqual(await rewards.evaluateUser(s), []);
    assert.ok((await rewardKeys(s)).includes('metier.bricolage.1'), 'badge conservé');
  });

  test('encadrement éligible (admin, prof, prof de classe) ; visiteur, personnel, mode collectif exclus', async () => {
    const eligible = [];
    for (const role of [null, 'admin', 'prof', 'prof_classe']) {
      const id = await createUser({ type: 'teacher' });
      // Sans profil attribué, un compte enseignant est « prof de classe » par défaut.
      if (role) await setStudentPrimaryRole(id, role);
      eligible.push([role || 'défaut', id]);
    }
    const excluded = [['visiteur', await createUser({ role: null })]];
    const personnel = await createUser({ type: 'teacher' });
    await setStudentPrimaryRole(personnel, 'personnel');
    excluded.push(['personnel', personnel]);
    // Compte partagé « mode collectif » (rang 400, non semé en test) : ni encadrement, ni
    // palier n3beur.
    const roles = require('../lib/shared/n3beurRolesCore');
    assert.equal(roles.isEncadrementRoleSlug('mode_collectif'), false);
    assert.equal(roles.isN3beurTierSlug('mode_collectif', 400), false);
    for (const [, u] of [...eligible, ...excluded]) {
      await creditedTask(u, { category: 'jardinage' });
      await creditedTask(u, { category: 'jardinage' });
    }
    for (const [label, u] of eligible) {
      assert.equal(await rewards.isRewardEligibleStudent(u), true, label);
      const keys = (await rewards.evaluateUser(u)).map((r) => r.key);
      assert.ok(keys.includes('metier.jardinage.1'), `${label} : badge de tâche`);
    }
    for (const [label, u] of excluded) {
      assert.equal(await rewards.isRewardEligibleStudent(u), false, label);
      const got = await rewards.evaluateUser(u);
      assert.ok(!got.some((r) => r.family !== 'seances'), `${label} : aucun badge de tâche`);
    }
  });

  test('module éteint : attribution sans annonce ; allumé : une notification regroupée', async () => {
    const s = await createUser();
    await creditedTask(s, { category: 'animaux' });
    await creditedTask(s, { category: 'animaux' });
    await setSetting(MODULE_KEY, false);
    const awarded = await rewards.evaluateUser(s);
    assert.ok(awarded.length >= 1);
    assert.equal(await rewards.announceRewards(s, awarded), false);
    let notes = await queryAll(
      "SELECT id FROM notifications WHERE user_id = ? AND kind = 'reward'",
      [s],
    );
    assert.equal(notes.length, 0);
    await setSetting(MODULE_KEY, true);
    const several = [awarded[0], rewards.describeReward('ecotone.1')];
    assert.equal(await rewards.announceRewards(s, several), true);
    notes = await queryAll(
      "SELECT title FROM notifications WHERE user_id = ? AND kind = 'reward'",
      [s],
    );
    assert.equal(notes.length, 1, 'une seule notification pour plusieurs badges');
    assert.match(notes[0].title, /2 nouveaux badges/);
  });

  test('une erreur d’évaluation est journalisée, sans faire échouer l’appelant', async () => {
    const broken = {
      queryOne: async () => {
        throw new Error('base indisponible');
      },
      queryAll: async () => [],
      execute: async () => ({}),
    };
    await assert.doesNotReject(scheduleRewardsEvaluation(['x'], { db: broken }));
  });

  test('séance et fresque passent par le même évaluateur (clés historiques)', async () => {
    const s = await createUser({ role: null });
    assert.deepEqual(
      await rewards.evaluateSessionRewards(s, { run: { sessionId: 's', completionCount: 1 } }),
      [],
      'aucune séance terminée',
    );
    assert.equal(
      await rewards.awardReward(s, 'fresque_climat_junior', { type: 'fresque_board', ref: 'b' }),
      true,
    );
    assert.equal(await rewards.awardReward(s, 'fresque_climat_junior'), false);
    assert.equal(await rewards.awardReward(s, 'inconnu'), false);
  });
});

describe('Catalogue', () => {
  test('clés enregistrées ≤ 64 caractères, descriptions tutoyées, aucun badge de danger', () => {
    const keys = rewards.REWARD_CATALOGUE.flatMap((e) =>
      e.source === 'manual' ? [`${e.key}.99999`] : rewards.storedKeysOf(e),
    );
    for (const key of keys) assert.ok(key.length <= 64, `${key} trop longue`);
    assert.equal(new Set(keys).size, keys.length, 'clés uniques');
    for (const e of rewards.REWARD_CATALOGUE) {
      assert.ok(e.title && e.emoji && e.description, e.key);
      assert.doesNotMatch(e.key, /danger/);
      if (e.tiers) assert.equal(e.tiers.length, 3, `${e.key} : trois paliers`);
    }
    for (const legacy of [
      'session_first',
      'session_three',
      'session_replay',
      'session_lycee',
      'fresque_climat_junior',
    ]) {
      assert.ok(rewards.describeReward(legacy), legacy);
    }
    assert.equal(
      rewards.describeReward('metier.jardinage'),
      null,
      'clé de base d’un badge à paliers',
    );
    assert.equal(rewards.describeReward('metier.jardinage.4'), null);
    assert.equal(rewards.describeReward('manuel.guide.2').occurrence, 2);
    assert.ok(
      !rewards.REWARD_CATALOGUE.some((e) => e.key === 'nature.cle'),
      'pas de suivi des clés',
    );
  });
});
