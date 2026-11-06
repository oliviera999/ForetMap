'use strict';

/**
 * Nouvelles collections de badges (exploration, reportage, Graine de savant, Bonne idée) et
 * moteur générique (`lib/rewards/core/engine.js`) branché sur un produit factice : c'est le
 * contrat que Gnomes & Licornes reprendra avec sa propre table et son propre catalogue.
 */

require('./helpers/setup');
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../database');
const { setStudentPrimaryRole } = require('./helpers/studentRoles');
const rewards = require('../lib/rewards');
const { createRewardsEngine, RewardAwardError } = require('../lib/rewards/core/engine');
const { foretRewards, STUDENT_ONLY_FAMILIES } = require('../lib/rewards/foretEngine');
const { JOURNAL_ARTICLE_MIN_LENGTH } = require('../lib/rewards/metrics');

const { initSchema, queryAll, queryOne, execute } = db;
const uid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const FAKE_TABLE = 'zz_test_engine_rewards';
let roleThresholds = [];

async function createUser({ type = 'student', role = 'eleve_novice' } = {}) {
  const id = uid(type === 'student' ? 'rwn-stu' : 'rwn-tea');
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, password_hash,
                        auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, 'Badge', ?, 'Badge Test', 'x', 'local', 1, NOW(), NOW())`,
    [id, type, id],
  );
  if (type === 'student' && role) await setStudentPrimaryRole(id, role);
  return id;
}

async function valuesOf(userId, families) {
  const values = await rewards.computeRewardValues(userId, { families });
  return Object.fromEntries(values.map((x) => [x.entry.key, x.value]));
}

async function newKeys(userId, families) {
  return (await rewards.evaluateUser(userId, { families })).map((r) => r.key).sort();
}

async function createPlant() {
  const r = await execute("INSERT INTO plants (name, emoji, description) VALUES (?, '🌿', '')", [
    uid('Espèce'),
  ]);
  return r.insertId;
}

before(async () => {
  await initSchema();
  roleThresholds = await queryAll(
    "SELECT slug, min_done_tasks FROM roles WHERE slug LIKE 'eleve\\_%' OR slug = 'n3beur_bebe'",
  );
  await execute(`DROP TABLE IF EXISTS ${FAKE_TABLE}`);
  await execute(
    `CREATE TABLE ${FAKE_TABLE} (
       player_id VARCHAR(64) NOT NULL,
       reward_key VARCHAR(64) NOT NULL,
       source_type VARCHAR(32) DEFAULT NULL,
       source_ref VARCHAR(64) DEFAULT NULL,
       awarded_at DATETIME NOT NULL,
       awarded_by_user_id VARCHAR(64) DEFAULT NULL,
       note VARCHAR(280) DEFAULT NULL,
       seen_at DATETIME DEFAULT NULL,
       PRIMARY KEY (player_id, reward_key)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
});

after(async () => {
  await execute(`DROP TABLE IF EXISTS ${FAKE_TABLE}`);
  for (const r of roleThresholds) {
    await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [r.min_done_tasks, r.slug]);
  }
});

describe('Exploration', () => {
  test('Cartographe : lieux actifs de la visite seulement, 4 → rien, 5 → Bourgeon', async () => {
    const s = await createUser();
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const id = uid('rwn-vz');
      await execute(
        `INSERT INTO visit_zones (id, map_id, name, points, is_active) VALUES (?, 'foret', ?, '[]', 1)`,
        [id, id],
      );
      ids.push(['zone', id]);
    }
    const inactive = uid('rwn-vm');
    await execute(
      `INSERT INTO visit_markers (id, map_id, x_pct, y_pct, label, is_active)
       VALUES (?, 'foret', 1, 1, 'Repère retiré', 0)`,
      [inactive],
    );
    for (const [type, id] of ids.slice(0, 4)) {
      await execute(
        'INSERT INTO visit_seen_students (student_id, target_type, target_id) VALUES (?, ?, ?)',
        [s, type, id],
      );
    }
    await execute(
      "INSERT INTO visit_seen_students (student_id, target_type, target_id) VALUES (?, 'marker', ?)",
      [s, inactive],
    );
    assert.equal((await valuesOf(s, ['exploration']))['exploration.cartographe'], 4);
    assert.deepEqual(await newKeys(s, ['exploration']), []);
    await execute(
      'INSERT INTO visit_seen_students (student_id, target_type, target_id) VALUES (?, ?, ?)',
      [s, ids[4][0], ids[4][1]],
    );
    assert.deepEqual(await newKeys(s, ['exploration']), ['exploration.cartographe.1']);
  });

  test('Premières rencontres : espèces distinctes ; Arpenteur : un arbre par mois', async () => {
    const s = await createUser();
    const plants = [];
    for (let i = 0; i < 5; i += 1) plants.push(await createPlant());
    for (const plantId of plants) {
      await execute(
        'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at) VALUES (?, ?, ?)',
        [s, plantId, new Date()],
      );
    }
    // Deuxième confirmation de la même espèce : ne compte pas deux fois.
    await execute(
      'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at) VALUES (?, ?, ?)',
      [s, plants[0], new Date()],
    );
    const tree = await execute(
      "INSERT INTO tracked_individuals (plant_id, map_id, label) VALUES (?, 'foret', 'Arbre test')",
      [plants[0]],
    );
    for (const day of ['2026-10-02', '2026-10-20']) {
      await execute(
        'INSERT INTO individual_measurements (individual_id, measured_at, observer_user_id) VALUES (?, ?, ?)',
        [tree.insertId, day, s],
      );
    }
    let v = await valuesOf(s, ['exploration']);
    assert.equal(v['exploration.rencontres'], 5);
    assert.equal(v['exploration.arpenteur'], 1, 'deux mesures le même mois = une');
    await execute(
      "INSERT INTO individual_measurements (individual_id, measured_at, observer_user_id) VALUES (?, '2026-11-03', ?)",
      [tree.insertId, s],
    );
    v = await valuesOf(s, ['exploration']);
    assert.equal(v['exploration.arpenteur'], 2);
    const keys = await newKeys(s, ['exploration']);
    assert.deepEqual(keys, ['exploration.arpenteur.1', 'exploration.rencontres.1']);
  });
});

describe('Reportage et carnet', () => {
  test('Œil de lynx : photo sur une tâche créditée ; Plume verte : article assez long', async () => {
    const s = await createUser();
    const credited = uid('rwn-task');
    const notCredited = uid('rwn-task');
    for (const [id, status] of [
      [credited, 'validated'],
      [notCredited, 'available'],
    ]) {
      await execute(
        `INSERT INTO tasks (id, title, description, map_id, required_students, status,
                            completion_mode, category, format, validated_at, created_at)
         VALUES (?, ?, '', 'foret', 1, ?, 'single_done', NULL, NULL, ?, NOW())`,
        [id, `Tâche ${id}`, status, status === 'validated' ? new Date() : null],
      );
      await execute(
        `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
         VALUES (?, ?, 'Badge', ?, NOW())`,
        [id, s, s],
      );
      await execute(
        `INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at)
         VALUES (?, ?, 'Badge', ?, 'fait', 'uploads/task-logs/x.jpg', ?)`,
        [id, s, s, new Date()],
      );
    }
    // Compte rendu sans photo : ne compte pas.
    await execute(
      `INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at)
       VALUES (?, ?, 'Badge', ?, 'texte seul', NULL, ?)`,
      [credited, s, s, new Date()],
    );
    await execute(
      'INSERT INTO user_journal_articles (user_id, title, body_markdown) VALUES (?, ?, ?)',
      [s, 'Brouillon', 'trop court'],
    );
    let v = await valuesOf(s, ['reportage']);
    assert.equal(v['reportage.oeil'], 1, 'tâche non validée exclue');
    assert.equal(v['reportage.plume'], 0, 'article trop court exclu');
    await execute(
      'INSERT INTO user_journal_articles (user_id, title, body_markdown) VALUES (?, ?, ?)',
      [s, 'Les fourmis', 'a'.repeat(JOURNAL_ARTICLE_MIN_LENGTH)],
    );
    v = await valuesOf(s, ['reportage']);
    assert.equal(v['reportage.plume'], 1);
    assert.deepEqual(await newKeys(s, ['reportage']), ['reportage.oeil.1', 'reportage.plume.1']);
  });
});

describe('Savoirs et collectif', () => {
  test('Graine de savant : semaines ISO distinctes avec une bonne réponse', async () => {
    const s = await createUser();
    const q = await queryOne(
      'SELECT question_code FROM quiz_questions ORDER BY question_code LIMIT 1',
    );
    if (!q) return;
    const attempt = (when, ok) =>
      execute(
        'INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct, answered_at) VALUES (?, ?, NULL, ?, ?)',
        [s, q.question_code, ok ? 1 : 0, new Date(when)],
      );
    // Lundi 2 et dimanche 8 novembre 2026 : même semaine ISO. Une erreur seule ne compte pas.
    await attempt('2026-11-02T10:00:00', true);
    await attempt('2026-11-08T10:00:00', true);
    await attempt('2026-11-10T10:00:00', false);
    assert.equal((await valuesOf(s, ['nature']))['nature.savant'], 1);
    await attempt('2026-11-09T10:00:00', true);
    assert.equal((await valuesOf(s, ['nature']))['nature.savant'], 2);
    assert.ok((await newKeys(s, ['nature'])).includes('nature.savant.1'));
  });

  test('Bonne idée : réaction d’une autre personne, message non supprimé', async () => {
    const s = await createUser();
    const other = await createUser();
    const thread = uid('rwn-th');
    await execute(
      "INSERT INTO forum_threads (id, title, author_user_type, author_user_id) VALUES (?, 'Sujet', 'student', ?)",
      [thread, s],
    );
    const posts = [uid('rwn-p'), uid('rwn-p'), uid('rwn-p')];
    for (const [i, id] of posts.entries()) {
      await execute(
        `INSERT INTO forum_posts (id, thread_id, body, author_user_type, author_user_id, is_deleted)
         VALUES (?, ?, 'Idée', 'student', ?, ?)`,
        [id, thread, s, i === 2 ? 1 : 0],
      );
    }
    const react = (postId, reactor) =>
      execute(
        "INSERT INTO forum_post_reactions (post_id, reactor_user_type, reactor_user_id, emoji) VALUES (?, 'student', ?, '👍')",
        [postId, reactor],
      );
    await react(posts[0], s); // sa propre réaction : ne compte pas
    await react(posts[2], other); // message supprimé : ne compte pas
    assert.equal((await valuesOf(s, ['collectif']))['collectif.bonne_idee'], 0);
    await react(posts[0], other);
    const comment = uid('rwn-cc');
    await execute(
      `INSERT INTO context_comments (id, context_type, context_id, body, author_user_type, author_user_id)
       VALUES (?, 'zone', 'z-test', 'Belle zone', 'student', ?)`,
      [comment, s],
    );
    await execute(
      "INSERT INTO context_comment_reactions (comment_id, reactor_user_type, reactor_user_id, emoji) VALUES (?, 'student', ?, '❤️')",
      [comment, other],
    );
    assert.equal((await valuesOf(s, ['collectif']))['collectif.bonne_idee'], 2);
    assert.ok((await newKeys(s, ['collectif'])).includes('collectif.bonne_idee.1'));
  });

  test('nouvelles familles réservées aux comptes éligibles ; un prof en reçoit aussi', async () => {
    for (const family of ['exploration', 'reportage']) {
      assert.ok(STUDENT_ONLY_FAMILIES.has(family), family);
      assert.ok(foretRewards.restrictedFamilies.has(family), family);
    }
    const blocked = await rewards.computeRewardValues(await createUser({ role: null }), {
      eligible: false,
      families: ['exploration', 'reportage'],
    });
    assert.equal(blocked.length, 0);
    // Un enseignant (prof de classe par défaut) qui écrit dans son carnet : Plume verte.
    const teacher = await createUser({ type: 'teacher', role: null });
    await execute(
      'INSERT INTO user_journal_articles (user_id, title, body_markdown) VALUES (?, ?, ?)',
      [teacher, 'Relevé', 'b'.repeat(JOURNAL_ARTICLE_MIN_LENGTH)],
    );
    assert.ok((await newKeys(teacher, ['reportage'])).includes('reportage.plume.1'));
  });
});

describe('Moteur générique (produit factice, contrat G&L)', () => {
  const catalogue = [
    {
      key: 'quete.etoiles',
      family: 'quetes',
      emoji: '⭐',
      title: 'Chasseur d’étoiles',
      description: 'Ramasse des étoiles.',
      tiers: [1, 3, 5],
      unit: 'étoile',
      source: 'auto',
      metric: 'etoiles',
    },
    {
      key: 'quete.secret',
      family: 'quetes',
      emoji: '🗝️',
      title: 'Gardien du secret',
      description: 'Trouve le secret.',
      tiers: null,
      source: 'auto',
      metric: 'secret',
    },
    {
      key: 'mj.bravo',
      family: 'mj',
      emoji: '🎖️',
      title: 'Bravo du MJ',
      description: 'Décerné par le MJ.',
      tiers: null,
      source: 'manual',
    },
  ];
  const families = [
    { key: 'quetes', label: 'Quêtes' },
    { key: 'mj', label: 'Le MJ' },
  ];
  const values = new Map();
  const makeEngine = (extra = {}) =>
    createRewardsEngine({
      product: 'test',
      catalogue,
      families,
      store: { table: FAKE_TABLE, ownerColumn: 'player_id' },
      createMetricContext: (_db, ownerId) => ({
        value: async (metric) => values.get(`${ownerId}:${metric}`) || 0,
      }),
      loadOwnerNames: async (ids) => ids.map((id) => ({ id, name: `Joueur ${id}` })),
      ...extra,
    });

  test('catalogue et identifiants contrôlés au chargement', () => {
    assert.throws(() => makeEngine({ store: { table: 'x; DROP', ownerColumn: 'id' } }), /SQL/);
    assert.throws(
      () =>
        createRewardsEngine({
          product: 'test',
          catalogue: [catalogue[0], catalogue[0]],
          families,
          createMetricContext: () => ({ value: async () => 0 }),
        }),
      /double/,
    );
  });

  test('évaluation, progression, vitrine, badge manuel, fusion — dans la table du produit', async () => {
    const engine = makeEngine();
    const p1 = uid('pl');
    const p2 = uid('pl');
    values.set(`${p1}:etoiles`, 3);
    values.set(`${p1}:secret`, 1);
    let awarded = (await engine.evaluate(p1)).map((r) => r.key).sort();
    assert.deepEqual(awarded, ['quete.etoiles.1', 'quete.etoiles.2', 'quete.secret']);
    assert.deepEqual(await engine.evaluate(p1), [], 'idempotent');
    values.set(`${p1}:etoiles`, 0);
    assert.deepEqual(await engine.evaluate(p1), [], 'jamais de retrait');
    const { progress } = await engine.buildProgress(p1);
    const etoiles = progress.find((p) => p.key === 'quete.etoiles');
    assert.equal(etoiles.tier, 2, 'palier enregistré gardé');
    assert.equal(etoiles.nextThreshold, 5);

    values.set(`${p2}:etoiles`, 2);
    const showcase = await engine.buildShowcase([p2, p1]);
    assert.deepEqual(
      showcase.students.map((s) => s.id),
      [p1, p2].sort((a, b) => `Joueur ${a}`.localeCompare(`Joueur ${b}`, 'fr')),
    );
    assert.ok(showcase.near.some((n) => n.studentId === p2 && n.key === 'quete.etoiles'));

    await assert.rejects(
      () => engine.awardManual({ ownerId: p1, type: 'bravo', note: '' }),
      RewardAwardError,
    );
    const first = await engine.awardManual({ ownerId: p1, type: 'bravo', note: 'Bien joué' });
    assert.equal(first.reward.key, 'mj.bravo.1');
    await engine.awardManual({ ownerId: p2, type: 'bravo', note: 'Super' });

    await db.withTransaction((tx) => engine.prepareMerge(tx, p2, p1));
    const moved = await queryAll(
      `SELECT reward_key FROM ${FAKE_TABLE} WHERE player_id = ? AND reward_key LIKE 'mj.%'`,
      [p2],
    );
    assert.deepEqual(
      moved.map((r) => r.reward_key),
      ['mj.bravo.2'],
    );

    assert.equal(await engine.markSeen(p1), 4);
    const forest = await queryOne(
      'SELECT COUNT(*) AS n FROM user_rewards WHERE user_id IN (?, ?)',
      [p1, p2],
    );
    assert.equal(Number(forest.n), 0, 'rien écrit dans la table de la forêt');
  });

  test('familles restreintes : non éligible → familles ignorées', async () => {
    const engine = makeEngine({ restrictedFamilies: ['quetes'], isEligible: async () => false });
    const p = uid('pl');
    values.set(`${p}:etoiles`, 5);
    assert.deepEqual(await engine.evaluate(p), []);
  });
});
