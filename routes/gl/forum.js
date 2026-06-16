'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const { normalizeOptionalString, parsePageQuery } = require('../../lib/shared/httpHelpers');
const { z, validate } = require('../../lib/validate');

const router = express.Router();

const MIN_TITLE = 3;
const MAX_TITLE = 200;
const MIN_BODY = 2;
const MAX_BODY = 4000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// O7 — pagination de GET /threads : coercition permissive (jamais de 400 pour une query
// invalide) reproduisant exactement `parsePageQuery` : `page` ≥ 1 (repli 1), `page_size`
// borné à [1, MAX_PAGE_SIZE] (repli DEFAULT_PAGE_SIZE), `offset` dérivé. `pageSize`/`offset`
// étant interpolés dans le SQL (LIMIT/OFFSET), ces bornes garantissent des entiers sûrs.
const glForumPageQuerySchema = z
  .object({ page: z.unknown().optional(), page_size: z.unknown().optional() })
  .transform((q) =>
    parsePageQuery(q, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    }),
  );

function canModerate(auth) {
  return String(auth?.userType || '').toLowerCase() === 'gl_admin';
}

router.use(requireGlAuth);

router.get('/threads', validate({ query: glForumPageQuerySchema }), async (req, res) => {
  const { page, pageSize, offset } = req.validatedQuery;
  const totalRow = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_forum_threads WHERE is_deleted = 0',
  );
  const total = Number(totalRow?.c || 0);
  const rows = await queryAll(
    `SELECT t.id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM gl_forum_posts p WHERE p.thread_id = t.id AND p.is_deleted = 0) AS posts_count
       FROM gl_forum_threads t
      WHERE t.is_deleted = 0
      ORDER BY t.updated_at DESC, t.id DESC
      LIMIT ${pageSize} OFFSET ${offset}`,
  );
  return res.json({ items: rows, page, page_size: pageSize, total });
});

router.post('/threads', async (req, res) => {
  const title = normalizeOptionalString(req.body?.title);
  const body = normalizeOptionalString(req.body?.body);
  if (!title || title.length < MIN_TITLE || title.length > MAX_TITLE) {
    return res.status(400).json({ error: `Titre invalide (${MIN_TITLE}-${MAX_TITLE} caractères)` });
  }
  if (!body || body.length < MIN_BODY || body.length > MAX_BODY) {
    return res.status(400).json({ error: `Message invalide (${MIN_BODY}-${MAX_BODY} caractères)` });
  }
  const userType = String(req.glAuth.userType || 'gl_player');
  const userId = String(req.glAuth.userId || '');
  const result = await execute(
    `INSERT INTO gl_forum_threads (title, author_user_type, author_user_id, created_at, updated_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [title, userType, userId],
  );
  const threadId = Number(result.insertId);
  await execute(
    `INSERT INTO gl_forum_posts (thread_id, body, author_user_type, author_user_id, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [threadId, body, userType, userId],
  );
  const created = await queryOne('SELECT * FROM gl_forum_threads WHERE id = ? LIMIT 1', [threadId]);
  return res.status(201).json(created);
});

router.get('/threads/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const thread = await queryOne(
    'SELECT * FROM gl_forum_threads WHERE id = ? AND is_deleted = 0 LIMIT 1',
    [id],
  );
  if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
  const posts = await queryAll(
    `SELECT id, thread_id, body, author_user_type, author_user_id, is_deleted, created_at
       FROM gl_forum_posts
      WHERE thread_id = ?
      ORDER BY id ASC`,
    [id],
  );
  return res.json({
    thread,
    posts: posts.map((p) => ({ ...p, body: Number(p.is_deleted) ? '[message supprimé]' : p.body })),
  });
});

router.post('/threads/:id/posts', async (req, res) => {
  const threadId = Number(req.params.id);
  if (!Number.isFinite(threadId)) return res.status(400).json({ error: 'Identifiant invalide' });
  const thread = await queryOne(
    'SELECT id, is_locked, is_deleted FROM gl_forum_threads WHERE id = ? LIMIT 1',
    [threadId],
  );
  if (!thread || Number(thread.is_deleted))
    return res.status(404).json({ error: 'Sujet introuvable' });
  if (Number(thread.is_locked) && !canModerate(req.glAuth)) {
    return res.status(409).json({ error: 'Sujet verrouillé' });
  }
  const body = normalizeOptionalString(req.body?.body);
  if (!body || body.length < MIN_BODY || body.length > MAX_BODY) {
    return res.status(400).json({ error: `Message invalide (${MIN_BODY}-${MAX_BODY} caractères)` });
  }
  const userType = String(req.glAuth.userType || 'gl_player');
  const userId = String(req.glAuth.userId || '');
  const result = await execute(
    `INSERT INTO gl_forum_posts (thread_id, body, author_user_type, author_user_id, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [threadId, body, userType, userId],
  );
  await execute('UPDATE gl_forum_threads SET updated_at = NOW() WHERE id = ?', [threadId]);
  const created = await queryOne('SELECT * FROM gl_forum_posts WHERE id = ? LIMIT 1', [
    result.insertId,
  ]);
  return res.status(201).json(created);
});

router.patch('/threads/:id/lock', async (req, res) => {
  if (!canModerate(req.glAuth)) return res.status(403).json({ error: 'Permission insuffisante' });
  const id = Number(req.params.id);
  const locked = !!req.body?.locked;
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  await execute('UPDATE gl_forum_threads SET is_locked = ?, updated_at = NOW() WHERE id = ?', [
    locked ? 1 : 0,
    id,
  ]);
  return res.json({ ok: true, is_locked: locked });
});

router.delete('/posts/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const post = await queryOne(
    'SELECT id, author_user_type, author_user_id, is_deleted FROM gl_forum_posts WHERE id = ? LIMIT 1',
    [id],
  );
  if (!post) return res.status(404).json({ error: 'Message introuvable' });
  const owns =
    post.author_user_type === req.glAuth.userType &&
    String(post.author_user_id) === String(req.glAuth.userId);
  if (!owns && !canModerate(req.glAuth))
    return res.status(403).json({ error: 'Permission insuffisante' });
  await execute('UPDATE gl_forum_posts SET is_deleted = 1 WHERE id = ?', [id]);
  return res.json({ ok: true });
});

module.exports = router;
module.exports.glForumPageQuerySchema = glForumPageQuerySchema; // exporté pour test no-DB du contrat O7
