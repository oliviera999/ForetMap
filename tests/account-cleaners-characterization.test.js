'use strict';

/**
 * Caractérisation des nettoyages inter-domaines d'un compte (piste B, étape B6 ; ligne 16 du
 * § 3.3 de `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`), écrite **avant** le registre de
 * nettoyeurs (`lib/accounts/cleanerRegistry.js`) :
 *
 *   - suppression d'un élève (`deleteStudentById`) : forum, commentaires contextuels, profils,
 *     jetons de réinitialisation, inscriptions et journaux de tâches, statuts recalculés ;
 *   - fusion de deux comptes (`applyMerge`) : clés étrangères et colonnes polymorphes ;
 *   - suppression d'un groupe (`DELETE /api/groups/:id`) : tâches, fils de forum et
 *     observations détachés ;
 *   - renommage d'un élève (`PATCH /api/rbac/users/student/:id`) : noms dénormalisés des
 *     inscriptions et journaux de tâches.
 *
 * Pour chaque scénario, deux instantanés comparés à
 * `tests/fixtures/account-cleaners-characterization.golden.json` :
 *   - l'**état** des lignes de fixture dans chaque table concernée, après l'opération ;
 *   - le **journal** des écritures effectives, dans l'ordre (`tests/helpers/sqlJournal.js`) —
 *     l'ordre compte (transaction, cascades de clés étrangères).
 * Aucune donnée G&L n'est créée ici : les chemins G&L sont couverts par leurs propres suites.
 *
 * Régénérer la référence (changement de comportement VOULU, à justifier dans la PR) :
 *   B6_CHAR_RECORD=1 node --test tests/account-cleaners-characterization.test.js
 *   npx prettier --write tests/fixtures/account-cleaners-characterization.golden.json
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const database = require('../database');
const { initSchema, queryOne, queryAll, execute } = database;
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { setAssignedRole } = require('../lib/effectiveRole');
const { deleteStudentById } = require('../lib/studentDeletion');
const { applyMerge } = require('../lib/accountMerge');
const { startSqlJournal, normalizeJournal, aliasValue } = require('./helpers/sqlJournal');

const GOLDEN_PATH = path.join(
  __dirname,
  'fixtures',
  'account-cleaners-characterization.golden.json',
);
const RECORD = process.env.B6_CHAR_RECORD === '1';
const recorded = {};
/** Identifiant unique du scénario courant (renouvelé par `makeAliases`). */
let U = crypto.randomUUID().slice(0, 8);
let adminToken;
let adminId;

function expectGolden(name, actual) {
  if (RECORD) {
    recorded[name] = actual;
    return;
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.ok(Object.hasOwn(golden, name), `référence absente : ${name}`);
  assert.deepStrictEqual(actual, golden[name], name);
}

/**
 * Ouvre un scénario : nouvel identifiant unique (les fixtures d'un scénario ne se mêlent pas à
 * celles du précédent) et alias stables des identifiants de fixture.
 */
function makeAliases() {
  U = crypto.randomUUID().slice(0, 8);
  const aliases = new Map([[U, '<U>']]);
  return {
    aliases,
    add(raw, alias) {
      aliases.set(String(raw), alias);
      return raw;
    },
    of(value) {
      return aliasValue(JSON.parse(JSON.stringify(value)), aliases);
    },
  };
}

async function roleId(slug) {
  const row = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [slug]);
  assert.ok(row?.id);
  return row.id;
}

async function createUser(names, userType, firstName, lastName, alias, roleSlug) {
  const id = crypto.randomUUID();
  names.add(id, alias);
  await execute(
    `INSERT INTO users (id, user_type, first_name, last_name, display_name, email, password_hash,
       auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'x', 'local', 1, NOW(), NOW())`,
    [id, userType, firstName, lastName, `${firstName} ${lastName}`, `${alias}.${id}@example.com`],
  );
  if (roleSlug) await setAssignedRole(id, await roleId(roleSlug));
  return id;
}

async function createTask(names, alias, fields = {}) {
  const id = `${alias}-${U}`;
  names.add(id, alias);
  await execute(
    `INSERT INTO tasks (id, title, status, required_students, project_id, group_id, map_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      `Tâche ${alias} ${U}`,
      fields.status || 'available',
      fields.required ?? 1,
      fields.projectId ?? null,
      fields.groupId ?? null,
      fields.mapId ?? null,
    ],
  );
  return id;
}

async function assign(taskId, studentId, firstName, lastName) {
  await execute(
    'INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at) VALUES (?, ?, ?, ?, NOW())',
    [taskId, studentId, firstName, lastName],
  );
  await execute(
    'INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [taskId, studentId, firstName, lastName, `log ${U}`],
  );
}

async function createThread(names, alias, author, authorType, groupId = null) {
  const id = `${alias}-${U}`;
  names.add(id, alias);
  await execute(
    'INSERT INTO forum_threads (id, group_id, title, author_user_type, author_user_id, created_at, updated_at, last_post_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())',
    [id, groupId, `Fil ${alias}`, authorType, author],
  );
  return id;
}

async function createPost(names, alias, threadId, author, authorType) {
  const id = `${alias}-${U}`;
  names.add(id, alias);
  await execute(
    'INSERT INTO forum_posts (id, thread_id, body, author_user_type, author_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
    [id, threadId, `Message ${alias}`, authorType, author],
  );
  return id;
}

async function createComment(names, alias, author, authorType) {
  const id = `${alias}-${U}`;
  names.add(id, alias);
  await execute(
    'INSERT INTO context_comments (id, context_type, context_id, body, author_user_type, author_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [id, 'zone', `zone-${U}`, `Commentaire ${alias}`, authorType, author],
  );
  return id;
}

async function react(kind, targetId, user, userType) {
  if (kind === 'post') {
    await execute(
      'INSERT INTO forum_post_reactions (post_id, reactor_user_type, reactor_user_id, emoji) VALUES (?, ?, ?, ?)',
      [targetId, userType, user, '👍'],
    );
    await execute(
      'INSERT INTO forum_reports (post_id, reporter_user_type, reporter_user_id, reason) VALUES (?, ?, ?, ?)',
      [targetId, userType, user, `signalement ${U}`],
    );
  } else {
    await execute(
      'INSERT INTO context_comment_reactions (comment_id, reactor_user_type, reactor_user_id, emoji) VALUES (?, ?, ?, ?)',
      [targetId, userType, user, '👍'],
    );
    await execute(
      'INSERT INTO context_comment_reports (comment_id, reporter_user_type, reporter_user_id, reason) VALUES (?, ?, ?, ?)',
      [targetId, userType, user, `signalement ${U}`],
    );
  }
}

async function createResetToken(names, alias, user, userType) {
  const id = `${alias}-${U}`;
  names.add(id, alias);
  await execute(
    'INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW())',
    [id, userType, user, crypto.randomBytes(16).toString('hex')],
  );
}

async function createGroup(names, alias, parentId = null) {
  const id = `${alias}-${U}`;
  names.add(id, alias);
  await execute(
    'INSERT INTO `groups` (id, name, slug, kind, parent_group_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())',
    [id, `Groupe ${alias} ${U}`, `${alias}-${U}`, 'class', parentId],
  );
  return id;
}

/**
 * État des lignes de fixture, table par table (colonnes métier seulement : ni identifiants
 * auto-incrémentés ni horodatages), trié pour être stable.
 */
async function fixtureState(names, ids) {
  const inList = (list) => list.map(() => '?').join(',') || 'NULL';
  const sorted = (rows) =>
    names.of(rows).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const { users = [], tasks = [], threads = [], posts = [], comments = [], tokens = [] } = ids;
  const groups = ids.groups || [];
  return {
    users: sorted(
      await queryAll(
        `SELECT id, user_type, first_name, last_name, email, (password_hash IS NOT NULL) AS has_password
           FROM users WHERE id IN (${inList(users)})`,
        users,
      ),
    ),
    user_roles: sorted(
      await queryAll(
        `SELECT ur.user_type, ur.user_id, r.slug, ur.is_primary FROM user_roles ur
           INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id IN (${inList(users)})`,
        users,
      ),
    ),
    password_reset_tokens: sorted(
      await queryAll(
        `SELECT id, user_type, user_id FROM password_reset_tokens WHERE id IN (${inList(tokens)})`,
        tokens,
      ),
    ),
    tasks: sorted(
      await queryAll(
        `SELECT id, status, group_id, project_id FROM tasks WHERE id IN (${inList(tasks)})`,
        tasks,
      ),
    ),
    task_projects: sorted(
      await queryAll(
        `SELECT id, status, (finished_at IS NOT NULL) AS finished FROM task_projects WHERE title LIKE ?`,
        [`%${U}%`],
      ),
    ),
    task_assignments: sorted(
      await queryAll(
        `SELECT task_id, student_id, student_first_name, student_last_name FROM task_assignments
          WHERE task_id IN (${inList(tasks)})`,
        tasks,
      ),
    ),
    task_logs: sorted(
      await queryAll(
        `SELECT task_id, student_id, student_first_name, student_last_name FROM task_logs
          WHERE task_id IN (${inList(tasks)})`,
        tasks,
      ),
    ),
    forum_threads: sorted(
      await queryAll(
        `SELECT id, group_id, author_user_type, author_user_id FROM forum_threads
          WHERE id IN (${inList(threads)})`,
        threads,
      ),
    ),
    forum_posts: sorted(
      await queryAll(
        `SELECT id, thread_id, author_user_type, author_user_id FROM forum_posts WHERE id IN (${inList(posts)})`,
        posts,
      ),
    ),
    forum_reports: sorted(
      await queryAll(
        `SELECT post_id, reporter_user_type, reporter_user_id FROM forum_reports WHERE reason = ?`,
        [`signalement ${U}`],
      ),
    ),
    forum_post_reactions: sorted(
      await queryAll(
        `SELECT post_id, reactor_user_type, reactor_user_id FROM forum_post_reactions
          WHERE post_id IN (${inList(posts)})`,
        posts,
      ),
    ),
    context_comments: sorted(
      await queryAll(
        `SELECT id, author_user_type, author_user_id FROM context_comments WHERE id IN (${inList(comments)})`,
        comments,
      ),
    ),
    context_comment_reports: sorted(
      await queryAll(
        `SELECT comment_id, reporter_user_type, reporter_user_id FROM context_comment_reports WHERE reason = ?`,
        [`signalement ${U}`],
      ),
    ),
    context_comment_reactions: sorted(
      await queryAll(
        `SELECT comment_id, reactor_user_type, reactor_user_id FROM context_comment_reactions
          WHERE comment_id IN (${inList(comments)})`,
        comments,
      ),
    ),
    observation_logs: sorted(
      await queryAll(
        'SELECT student_id, group_id, content FROM observation_logs WHERE content LIKE ?',
        [`%${U}%`],
      ),
    ),
    groups: sorted(
      await queryAll(
        `SELECT id, parent_group_id, is_active FROM \`groups\` WHERE id IN (${inList(groups)})`,
        groups,
      ),
    ),
    group_members: sorted(
      await queryAll(
        `SELECT group_id, user_id, user_type FROM group_members WHERE group_id IN (${inList(groups)})`,
        groups,
      ),
    ),
  };
}

/** Exécute `work` sous journal ; les écritures brutes sont normalisées plus tard (alias). */
async function withJournal(work, options) {
  const journal = startSqlJournal(database.pool, options);
  let result;
  try {
    result = await work();
  } finally {
    journal.stop();
  }
  return { result, entries: journal.entries };
}

test.before(async () => {
  await initSchema();
  const admin = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [String(process.env.TEACHER_ADMIN_EMAIL || '').trim()],
  );
  adminId = admin.id;
  adminToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: admin.id,
      canonicalUserId: admin.id,
      roleId: await roleId('admin'),
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );
});

test.after(() => {
  if (RECORD) fs.writeFileSync(GOLDEN_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
});

test('suppression d’un élève : chaque table vidée comme aujourd’hui, dans le même ordre', async () => {
  const names = makeAliases();
  const first = `Suppr ${U}`;
  const S = await createUser(names, 'student', first, 'Cible', 'eleve', 'eleve_novice');
  const H = await createUser(names, 'student', first, 'Cible', 'homonyme', 'eleve_novice');
  const T = await createUser(names, 'teacher', `Prof ${U}`, 'Temoin', 'prof', 'prof');
  const projectId = `projet-${U}`;
  names.add(projectId, 'projet');
  await execute(
    "INSERT INTO task_projects (id, map_id, title, status, created_at) VALUES (?, 'foret', ?, 'active', NOW())",
    [projectId, `Projet ${U}`],
  );
  const t1 = await createTask(names, 'tache1', {
    status: 'in_progress',
    projectId,
    mapId: 'foret',
  });
  const t2 = await createTask(names, 'tache2', { status: 'in_progress' });
  await assign(t1, S, first, 'Cible');
  await assign(t1, null, first, 'Cible'); // ligne héritée, sans identifiant : appariée par nom
  await assign(t2, H, first, 'Cible');
  const thS = await createThread(names, 'fil-eleve', S, 'student');
  const thT = await createThread(names, 'fil-prof', T, 'teacher');
  const poS = await createPost(names, 'msg-eleve', thT, S, 'student');
  const poT1 = await createPost(names, 'msg-prof-dans-fil-eleve', thS, T, 'teacher');
  const poT2 = await createPost(names, 'msg-prof', thT, T, 'teacher');
  await react('post', poT2, S, 'student');
  await react('post', poS, T, 'teacher');
  const ccS = await createComment(names, 'com-eleve', S, 'student');
  const ccT = await createComment(names, 'com-prof', T, 'teacher');
  await react('comment', ccT, S, 'student');
  await react('comment', ccS, T, 'teacher');
  await createResetToken(names, 'jeton-eleve', S, 'student');
  await createResetToken(names, 'jeton-prof', T, 'teacher');
  await execute('INSERT INTO observation_logs (student_id, content) VALUES (?, ?), (?, ?)', [
    S,
    `observation eleve ${U}`,
    H,
    `observation homonyme ${U}`,
  ]);
  const ids = {
    users: [S, H, T],
    tasks: [t1, t2],
    threads: [thS, thT],
    posts: [poS, poT1, poT2],
    comments: [ccS, ccT],
    tokens: [`jeton-eleve-${U}`, `jeton-prof-${U}`],
  };

  const { result, entries } = await withJournal(() => deleteStudentById(S));
  expectGolden('delete_student.result', names.of(result));
  expectGolden('delete_student.journal', normalizeJournal(entries, names.aliases));
  expectGolden('delete_student.state', await fixtureState(names, ids));
});

test('fusion de deux comptes : réattributions et abandons comme aujourd’hui, dans le même ordre', async () => {
  const names = makeAliases();
  const A = await createUser(names, 'student', `Cible ${U}`, 'Fusion', 'cible', 'eleve_novice');
  await execute('UPDATE users SET email = NULL, password_hash = NULL WHERE id = ?', [A]);
  const B = await createUser(names, 'student', `Absorbe ${U}`, 'Fusion', 'absorbe', 'eleve_avance');
  const T = await createUser(names, 'teacher', `Prof ${U}`, 'Fusion', 'prof', 'prof');
  const g1 = await createGroup(names, 'groupe1');
  const g2 = await createGroup(names, 'groupe2');
  for (const [g, u] of [
    [g1, B],
    [g2, B],
    [g2, A],
  ]) {
    await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
      g,
      u,
      'student',
    ]);
  }
  const t1 = await createTask(names, 'tache1', { status: 'in_progress' });
  await assign(t1, B, `Absorbe ${U}`, 'Fusion');
  const thB = await createThread(names, 'fil-absorbe', B, 'student');
  const poB = await createPost(names, 'msg-absorbe', thB, B, 'student');
  const poT = await createPost(names, 'msg-prof', thB, T, 'teacher');
  await react('post', poT, B, 'student');
  const ccB = await createComment(names, 'com-absorbe', B, 'student');
  const ccT = await createComment(names, 'com-prof', T, 'teacher');
  await react('comment', ccT, B, 'student');
  await createResetToken(names, 'jeton-absorbe', B, 'student');
  await execute('INSERT INTO observation_logs (student_id, content) VALUES (?, ?)', [
    B,
    `observation absorbe ${U}`,
  ]);
  const ids = {
    users: [A, B, T],
    tasks: [t1],
    threads: [thB],
    posts: [poB, poT],
    comments: [ccB, ccT],
    tokens: [`jeton-absorbe-${U}`],
    groups: [g1, g2],
  };

  const { result, entries } = await withJournal(
    () => applyMerge({ fromUserId: B, intoUserId: A, actorUserId: null }),
    // Tables sans rapport avec la fixture ignorées (journaux d'exploitation écrits en fond).
    {
      tables: [
        'users',
        'user_roles',
        'password_reset_tokens',
        'group_members',
        'task_assignments',
        'task_logs',
        'observation_logs',
        'forum_threads',
        'forum_posts',
        'forum_reports',
        'forum_post_reactions',
        'context_comments',
        'context_comment_reports',
        'context_comment_reactions',
        'sync_runs',
        'sync_actions',
      ],
    },
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  // Numéro d'exécution `sync_runs` : variable d'un run à l'autre, remplacé là où il figure
  // (1er paramètre de `sync_actions`, dernier de la mise à jour de `sync_runs`).
  const runId = Number(result.runId);
  const journal = normalizeJournal(
    entries.map((e) => {
      const params = [...e.params];
      if (e.table === 'sync_actions' && Number(params[0]) === runId) params[0] = '<run>';
      if (e.table === 'sync_runs' && Number(params[params.length - 1]) === runId) {
        params[params.length - 1] = '<run>';
      }
      return { ...e, params };
    }),
    names.aliases,
  );
  expectGolden('merge.result', { ...names.of(result), runId: '<run>' });
  expectGolden('merge.journal', journal);
  expectGolden('merge.state', await fixtureState(names, ids));
});

test('suppression d’un groupe : tâches, fils de forum et observations détachés, dans le même ordre', async () => {
  const names = makeAliases();
  const M = await createUser(names, 'student', `Membre ${U}`, 'Groupe', 'membre', 'eleve_novice');
  const G = await createGroup(names, 'groupe');
  const C = await createGroup(names, 'sous-groupe', G);
  const G2 = await createGroup(names, 'autre-groupe');
  await execute('INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, ?)', [
    G,
    M,
    'student',
  ]);
  const t1 = await createTask(names, 'tache-groupe', { groupId: G });
  const t2 = await createTask(names, 'tache-autre', { groupId: G2 });
  const th = await createThread(names, 'fil-groupe', M, 'student', G);
  await execute('INSERT INTO observation_logs (student_id, group_id, content) VALUES (?, ?, ?)', [
    M,
    G,
    `observation groupe ${U}`,
  ]);
  const ids = { users: [M], tasks: [t1, t2], threads: [th], groups: [G, C, G2] };

  names.add(adminId, '<admin>');
  const { result, entries } = await withJournal(
    () =>
      request(app)
        .delete(`/api/groups/${G}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'caracterisation-b6'),
    {
      tables: [
        'tasks',
        'forum_threads',
        'observation_logs',
        'groups',
        'group_members',
        'audit_log',
      ],
    },
  );
  expectGolden('delete_group.response', { status: result.status, body: result.body });
  expectGolden('delete_group.journal', normalizeJournal(entries, names.aliases));
  expectGolden('delete_group.state', await fixtureState(names, ids));
});

test('renommage d’un élève : noms dénormalisés des tâches mis à jour, dans le même ordre', async () => {
  const names = makeAliases();
  const S = await createUser(names, 'student', `Avant ${U}`, 'Nom', 'eleve', 'eleve_novice');
  const H = await createUser(names, 'student', `Avant ${U}`, 'Nom', 'homonyme', 'eleve_novice');
  const t1 = await createTask(names, 'tache', { status: 'in_progress', required: 3 });
  await assign(t1, S, `Avant ${U}`, 'Nom');
  await assign(t1, H, `Avant ${U}`, 'Nom');
  await assign(t1, null, `Avant ${U}`, 'Nom');
  const ids = { users: [S, H], tasks: [t1] };

  names.add(adminId, '<admin>');
  const { result, entries } = await withJournal(
    () =>
      request(app)
        .patch(`/api/rbac/users/student/${S}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ first_name: `Apres ${U}`, last_name: 'Renomme' }),
    { tables: ['users', 'task_assignments', 'task_logs'] },
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  expectGolden('rename_student.journal', normalizeJournal(entries, names.aliases));
  expectGolden('rename_student.state', await fixtureState(names, ids));
});
