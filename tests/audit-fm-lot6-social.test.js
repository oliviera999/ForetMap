'use strict';

/**
 * Audit ForetMap du 19/11/2026, lot 6 (vie sociale) — tests de non-régression écrits à partir
 * des scénarios de rejeu de `docs/AUDIT_BUGS_FORETMAP_2026-11-19.md` :
 *
 * - **T6** : réaction emoji envoyée deux fois au même instant → `ER_DUP_ENTRY` → 500 (forum
 *   ForetMap, forum G&L via le même cœur, commentaires de contexte) ;
 * - **T9** : `GET /api/context-comments/counts` révélait les compteurs d'un contexte invisible
 *   (repère réservé à la surface `staff`, tâche hors du périmètre de cartes) ;
 * - **T10 (photos)** : plafonds de photos d'observation et d'illustrations du carnet comptés
 *   hors verrou — des envois simultanés dépassaient la limite.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const sharp = require('sharp');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { clearMapAccessCache } = require('../lib/mapAccess');
const { invalidateMapsListCache } = require('../routes/maps');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { FORETMAP_FORUM, togglePostReaction } = require('../lib/shared/forumCore');
const { toggleContextCommentReaction } = require('../lib/shared/contextCommentsCore');
const { getAllowedReactionSet } = require('../lib/shared/reactionEmojiCore');
const observationService = require('../lib/terrain/observationService');
const { getAbsolutePath, deleteFile } = require('../lib/uploads');
const fs = require('node:fs');

const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const MAP_IN = `lot6-in-${stamp}`;
const MAP_OUT = `lot6-out-${stamp}`;
const ROUNDS = 15;

let adminToken;
let groupId;
let emoji;

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Élève novice (aucune permission prof), rattaché à `groupId` s'il est fourni. */
async function createStudent({ group = null } = {}) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', NULL, NULL, NULL, 'Lot6', ?, ?, NULL, 'local', 1, NOW(), NOW())`,
    [id, `Eleve${stamp}`, `Lot6 Eleve${stamp}`],
  );
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  assert.ok(role?.id);
  await execute(
    `INSERT INTO user_roles (user_type, user_id, role_id, is_primary)
     VALUES ('student', ?, ?, 1)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [id, role.id],
  );
  await execute('UPDATE users SET assigned_role_id = ? WHERE id = ?', [role.id, id]);
  if (group) {
    await execute(
      `INSERT INTO group_members (group_id, user_id, user_type) VALUES (?, ?, 'student')`,
      [group, id],
    );
  }
  clearMapAccessCache();
  const token = await signAuthToken({
    product: 'foret',
    userType: 'student',
    userId: id,
    roleSlug: 'eleve_novice',
    permissions: [],
  });
  return { id, token };
}

async function insertComment(contextType, contextId) {
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO context_comments
      (id, context_type, context_id, body, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, 'Commentaire lot 6', 'student', 'lot6', 0)`,
    [id, contextType, String(contextId)],
  );
  return id;
}

/**
 * Lance `ROUNDS` paires d'appels simultanés, en repartant d'un état vide à chaque tour, et
 * vérifie l'invariant d'une bascule : aucun rejet (plus de 500) et
 * `lignes finales = ajouts − retraits` (jamais deux ajouts pour la même clé).
 */
async function assertConcurrentToggleConsistent({ reset, toggle, countRows }) {
  for (let round = 0; round < ROUNDS; round += 1) {
    await reset();
    const results = await Promise.all([toggle(), toggle()]);
    let delta = 0;
    for (const r of results) {
      assert.equal(typeof r.reacted, 'boolean', `réponse inattendue : ${JSON.stringify(r)}`);
      delta += r.reacted ? 1 : -1;
    }
    const rows = await countRows();
    assert.ok(rows === 0 || rows === 1, `au plus une réaction par clé (tour ${round})`);
    assert.equal(rows, delta, `état final cohérent avec les réponses (tour ${round})`);
  }
}

test.before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({ elevated: true });
  emoji = [...(await getAllowedReactionSet())][0];
  assert.ok(emoji, 'au moins un emoji autorisé');

  await execute(
    'INSERT INTO maps (id, label, map_image_url, sort_order, is_active) VALUES (?, ?, NULL, 910, 1), (?, ?, NULL, 911, 1)',
    [MAP_IN, `Lot 6 dedans ${stamp}`, MAP_OUT, `Lot 6 dehors ${stamp}`],
  );
  groupId = `grp-lot6-${stamp}`;
  await execute(
    "INSERT INTO `groups` (id, slug, name, kind, is_active) VALUES (?, ?, ?, 'class', 1)",
    [groupId, groupId, `Classe lot 6 ${stamp}`],
  );
  await execute('INSERT INTO group_scopes (group_id, map_id, project_id) VALUES (?, ?, NULL)', [
    groupId,
    MAP_IN,
  ]);
  invalidateMapsListCache();
  clearMapAccessCache();
});

test.after(async () => {
  await execute('DELETE FROM context_comments WHERE body = ?', ['Commentaire lot 6']);
  await execute('DELETE FROM tasks WHERE map_id IN (?, ?)', [MAP_IN, MAP_OUT]);
  await execute('DELETE FROM map_markers WHERE map_id IN (?, ?)', [MAP_IN, MAP_OUT]);
  await execute('DELETE FROM group_scopes WHERE group_id = ?', [groupId]);
  await execute('DELETE FROM group_members WHERE group_id = ?', [groupId]);
  await execute('DELETE FROM `groups` WHERE id = ?', [groupId]);
  await execute('DELETE FROM species_observations WHERE map_id IN (?, ?)', [MAP_IN, MAP_OUT]);
  await execute('DELETE FROM maps WHERE id IN (?, ?)', [MAP_IN, MAP_OUT]);
  invalidateMapsListCache();
  clearMapAccessCache();
});

// --- T6 : réactions concurrentes -------------------------------------------------------------

test('T6 forum : deux bascules simultanées de la même réaction → aucune 500, état cohérent', async () => {
  const threadId = crypto.randomUUID();
  const postId = crypto.randomUUID();
  await execute(
    `INSERT INTO forum_threads (id, title, author_user_type, author_user_id)
     VALUES (?, ?, 'student', 'lot6')`,
    [threadId, `Fil lot 6 ${stamp}`],
  );
  await execute(
    `INSERT INTO forum_posts (id, thread_id, body, author_user_type, author_user_id)
     VALUES (?, ?, 'Message lot 6', 'student', 'lot6')`,
    [postId, threadId],
  );
  const actor = { userType: 'student', userId: `lot6-reactor-${stamp}` };
  try {
    await assertConcurrentToggleConsistent({
      reset: () => execute('DELETE FROM forum_post_reactions WHERE post_id = ?', [postId]),
      toggle: () => togglePostReaction(FORETMAP_FORUM, postId, actor, emoji),
      countRows: async () =>
        Number(
          (
            await queryOne(
              'SELECT COUNT(*) AS n FROM forum_post_reactions WHERE post_id = ? AND emoji = ?',
              [postId, emoji],
            )
          ).n,
        ),
    });
    // La bascule séquentielle reste une bascule.
    await execute('DELETE FROM forum_post_reactions WHERE post_id = ?', [postId]);
    const first = await togglePostReaction(FORETMAP_FORUM, postId, actor, emoji);
    const second = await togglePostReaction(FORETMAP_FORUM, postId, actor, emoji);
    assert.equal(first.reacted, true);
    assert.equal(second.reacted, false);
  } finally {
    await execute('DELETE FROM forum_threads WHERE id = ?', [threadId]);
  }
});

test('T6 commentaires de contexte : deux bascules simultanées → aucune 500, état cohérent', async () => {
  const commentId = await insertComment('plant', `lot6-${stamp}`);
  const actor = { userType: 'student', userId: `lot6-reactor-${stamp}` };
  await assertConcurrentToggleConsistent({
    reset: () => execute('DELETE FROM context_comment_reactions WHERE comment_id = ?', [commentId]),
    toggle: () => toggleContextCommentReaction(commentId, actor, emoji),
    countRows: async () =>
      Number(
        (
          await queryOne(
            'SELECT COUNT(*) AS n FROM context_comment_reactions WHERE comment_id = ? AND emoji = ?',
            [commentId, emoji],
          )
        ).n,
      ),
  });
  await execute('DELETE FROM context_comment_reactions WHERE comment_id = ?', [commentId]);
  const first = await toggleContextCommentReaction(commentId, actor, emoji);
  const second = await toggleContextCommentReaction(commentId, actor, emoji);
  assert.equal(first.reacted, true);
  assert.equal(second.reacted, false);
});

// --- T9 : compteurs de commentaires d'un contexte invisible ----------------------------------

test('T9 : /counts répond 0 pour un repère réservé à la surface staff', async () => {
  const student = await createStudent();
  const visibleId = `lot6-mk-vis-${stamp}`;
  const staffOnlyId = `lot6-mk-staff-${stamp}`;
  await execute(
    `INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, hidden_surfaces, created_at)
     VALUES (?, 'foret', 10, 10, ?, '', NOW()), (?, 'foret', 20, 20, ?, 'map', NOW())`,
    [visibleId, `Repère visible ${stamp}`, staffOnlyId, `Repère personnels ${stamp}`],
  );
  try {
    await insertComment('marker', visibleId);
    await insertComment('marker', staffOnlyId);
    await insertComment('marker', staffOnlyId);

    // Le repère réservé est bien invisible pour cet élève sur la carte : la liste répond 404.
    await request(app)
      .get(`/api/context-comments?contextType=marker&contextId=${staffOnlyId}`)
      .set(auth(student.token))
      .expect(404);

    const res = await request(app)
      .get(`/api/context-comments/counts?contextType=marker&contextIds=${visibleId},${staffOnlyId}`)
      .set(auth(student.token))
      .expect(200);
    assert.equal(res.body.counts[visibleId].total, 1);
    assert.notEqual(res.body.counts[visibleId].newestId, '');
    assert.deepEqual(res.body.counts[staffOnlyId], { total: 0, newestId: '' });
  } finally {
    await execute('DELETE FROM map_markers WHERE id IN (?, ?)', [visibleId, staffOnlyId]);
  }
});

test('T9 : /counts répond 0 pour une tâche hors du périmètre de cartes du lecteur', async () => {
  const student = await createStudent({ group: groupId });
  const taskIn = `lot6-task-in-${stamp}`;
  const taskOut = `lot6-task-out-${stamp}`;
  await execute(
    `INSERT INTO tasks (id, title, status, required_students, map_id, created_at)
     VALUES (?, ?, 'available', 1, ?, NOW()), (?, ?, 'available', 1, ?, NOW())`,
    [taskIn, `Tâche dedans ${stamp}`, MAP_IN, taskOut, `Tâche dehors ${stamp}`, MAP_OUT],
  );
  await insertComment('task', taskIn);
  await insertComment('task', taskOut);
  await insertComment('task', taskOut);

  await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${taskOut}`)
    .set(auth(student.token))
    .expect(404);

  const res = await request(app)
    .get(`/api/context-comments/counts?contextType=task&contextIds=${taskIn},${taskOut}`)
    .set(auth(student.token))
    .expect(200);
  assert.equal(res.body.counts[taskIn].total, 1);
  assert.deepEqual(res.body.counts[taskOut], { total: 0, newestId: '' });

  // Un compte prof (non borné) voit toujours les deux compteurs.
  const asTeacher = await request(app)
    .get(`/api/context-comments/counts?contextType=task&contextIds=${taskIn},${taskOut}`)
    .set(auth(adminToken))
    .expect(200);
  assert.equal(asTeacher.body.counts[taskOut].total, 2);
});

// --- T10 (photos) : plafonds sous verrou -----------------------------------------------------

async function smallJpegDataUrl() {
  const buf = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 30, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

test('T10 photos d’observation : envois simultanés au bord du plafond → la limite tient', async () => {
  const student = await createStudent();
  const { observation } = await observationService.recordObservation({
    observerId: student.id,
    mapId: 'foret',
    text: 'Observation lot 6',
  });
  const max = observationService.MAX_PHOTOS_PER_OBSERVATION;
  const image = await smallJpegDataUrl();
  try {
    for (let i = 0; i < max - 1; i += 1) {
      await observationService.addObservationPhoto(observation.id, image);
    }
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        observationService.addObservationPhoto(observation.id, image),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1, 'une seule photo passe sous la limite');
    for (const r of refused) assert.equal(r.reason?.status, 409, String(r.reason));
    const rows = await queryAll(
      'SELECT file_path FROM species_observation_photos WHERE observation_id = ?',
      [observation.id],
    );
    assert.equal(rows.length, max, 'le plafond n’est jamais dépassé');
    // Les fichiers des envois refusés ont été retirés : seuls restent ceux des lignes.
    const dir = getAbsolutePath(`observations/species/${observation.id}`);
    assert.equal(fs.readdirSync(dir).length, max);
  } finally {
    const rows = await queryAll(
      'SELECT file_path FROM species_observation_photos WHERE observation_id = ?',
      [observation.id],
    );
    for (const r of rows) deleteFile(r.file_path);
    await execute('DELETE FROM species_observations WHERE id = ?', [observation.id]);
  }
});

test('T10 illustrations du carnet : envois simultanés au bord du plafond → la limite tient', async () => {
  const student = await createStudent();
  await request(app)
    .put('/api/settings/admin/observations.journal_max_assets')
    .set(auth(adminToken))
    .send({ value: 2 })
    .expect(200);
  try {
    const created = await request(app)
      .post('/api/user-journal/me/articles')
      .set(auth(student.token))
      .send({ title: 'Carnet lot 6', bodyMarkdown: 'Illustrations simultanées.' })
      .expect(201);
    const articleId = created.body.article.id;
    const image = await smallJpegDataUrl();
    await request(app)
      .post(`/api/user-journal/me/articles/${articleId}/assets`)
      .set(auth(student.token))
      .send({ imageData: image })
      .expect(201);

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app)
          .post(`/api/user-journal/me/articles/${articleId}/assets`)
          .set(auth(student.token))
          .send({ imageData: image }),
      ),
    );
    const statuses = results.map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 201).length, 1, `statuts : ${statuses}`);
    assert.equal(statuses.filter((s) => s === 400).length, 5, `statuts : ${statuses}`);
    const winner = results.find((r) => r.status === 201);
    assert.equal(winner.body.usage.assetCount, 2);
    const rows = await queryAll(
      'SELECT asset_path FROM user_journal_article_assets WHERE article_id = ?',
      [articleId],
    );
    assert.equal(rows.length, 2, 'le plafond n’est jamais dépassé');
    // Les fichiers des envois refusés ont été retirés.
    const dir = getAbsolutePath(rows[0].asset_path).replace(/\/[^/]+$/, '');
    const onDisk = fs.readdirSync(dir).filter((f) => f.startsWith(`${articleId}-`));
    assert.equal(onDisk.length, 2);

    await request(app)
      .delete(`/api/user-journal/me/articles/${articleId}`)
      .set(auth(student.token))
      .expect(200);
  } finally {
    await request(app)
      .put('/api/settings/admin/observations.journal_max_assets')
      .set(auth(adminToken))
      .send({ value: 0 })
      .expect(200);
  }
});
