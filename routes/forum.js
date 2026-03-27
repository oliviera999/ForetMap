const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitForumChanged } = require('../lib/realtime');
const { logAudit } = require('./audit');

const router = express.Router();

const MAX_THREAD_TITLE_LEN = 180;
const MIN_THREAD_TITLE_LEN = 4;
const MAX_POST_BODY_LEN = 4000;
const MIN_POST_BODY_LEN = 3;
const MAX_REPORT_REASON_LEN = 500;
const MIN_REPORT_REASON_LEN = 3;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const THREAD_COOLDOWN_MS = 10_000;
const POST_COOLDOWN_MS = 5_000;

const cooldownState = new Map();

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parsePage(req) {
  const page = parsePositiveInt(req.query?.page, 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, parsePositiveInt(req.query?.page_size, DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function getActor(auth) {
  const userType = String(auth?.userType || '').trim().toLowerCase();
  const userId = String(auth?.canonicalUserId || auth?.userId || '').trim();
  if (!userType || !userId) return null;
  return { userType, userId };
}

function canModerateForum(auth) {
  const roleSlug = String(auth?.roleSlug || '').trim().toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return perms.includes('teacher.access');
}

function isVisitorRole(auth) {
  return String(auth?.roleSlug || '').trim().toLowerCase() === 'visiteur';
}

function checkCooldown(actor, action, cooldownMs) {
  const key = `${action}:${actor.userType}:${actor.userId}`;
  const now = Date.now();
  const last = cooldownState.get(key) || 0;
  if (now - last < cooldownMs) return false;
  cooldownState.set(key, now);
  return true;
}

async function loadThreadThreadSafe(threadId) {
  return queryOne(
    `SELECT t.id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.is_pinned, t.created_at, t.updated_at, t.last_post_at,
            COALESCE(
              NULLIF(u.display_name, ''),
              NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''),
              NULLIF(u.pseudo, ''),
              NULLIF(u.email, ''),
              t.author_user_id
            ) AS author_display_name
       FROM forum_threads t
  LEFT JOIN users u ON u.id = t.author_user_id AND u.user_type = t.author_user_type
      WHERE t.id = ?
      LIMIT 1`,
    [threadId]
  );
}

router.use(requireAuth);
router.use((req, res, next) => {
  if (isVisitorRole(req.auth)) {
    return res.status(403).json({ error: 'Accès refusé au forum pour le profil visiteur' });
  }
  return next();
});

router.get('/threads', async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePage(req);
    const totalRow = await queryOne('SELECT COUNT(*) AS c FROM forum_threads');
    const total = Number(totalRow?.c || 0);
    const rows = await queryAll(
      `SELECT t.id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.is_pinned, t.created_at, t.updated_at, t.last_post_at,
              COALESCE(
                NULLIF(u.display_name, ''),
                NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''),
                NULLIF(u.pseudo, ''),
                NULLIF(u.email, ''),
                t.author_user_id
              ) AS author_display_name,
              (
                SELECT COUNT(*)
                  FROM forum_posts fp
                 WHERE fp.thread_id = t.id
              ) AS posts_count
         FROM forum_threads t
    LEFT JOIN users u ON u.id = t.author_user_id AND u.user_type = t.author_user_type
        ORDER BY t.is_pinned DESC, t.last_post_at DESC, t.created_at DESC
        LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    res.json({ items: rows, page, page_size: pageSize, total });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/threads', async (req, res) => {
  try {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const title = normalizeOptionalString(req.body?.title);
    const body = normalizeOptionalString(req.body?.body);
    if (!title || title.length < MIN_THREAD_TITLE_LEN || title.length > MAX_THREAD_TITLE_LEN) {
      return res.status(400).json({ error: `Titre invalide (${MIN_THREAD_TITLE_LEN}-${MAX_THREAD_TITLE_LEN} caractères)` });
    }
    if (!body || body.length < MIN_POST_BODY_LEN || body.length > MAX_POST_BODY_LEN) {
      return res.status(400).json({ error: `Message invalide (${MIN_POST_BODY_LEN}-${MAX_POST_BODY_LEN} caractères)` });
    }
    if (!checkCooldown(actor, 'thread', THREAD_COOLDOWN_MS)) {
      return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
    }

    const threadId = uuidv4();
    const postId = uuidv4();
    await execute(
      `INSERT INTO forum_threads
        (id, title, author_user_type, author_user_id, is_locked, is_pinned, last_post_at)
       VALUES (?, ?, ?, ?, 0, 0, NOW())`,
      [threadId, title, actor.userType, actor.userId]
    );
    await execute(
      `INSERT INTO forum_posts
        (id, thread_id, body, author_user_type, author_user_id, is_deleted)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [postId, threadId, body, actor.userType, actor.userId]
    );

    const thread = await loadThreadThreadSafe(threadId);
    await logAudit('forum_thread_create', 'forum_thread', threadId, title, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { post_id: postId },
    });
    emitForumChanged({ reason: 'thread_created', threadId });
    res.status(201).json({ thread, first_post_id: postId });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/threads/:id', async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePage(req);
    const thread = await loadThreadThreadSafe(req.params.id);
    if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });

    const countRow = await queryOne('SELECT COUNT(*) AS c FROM forum_posts WHERE thread_id = ?', [thread.id]);
    const posts = await queryAll(
      `SELECT p.id, p.thread_id, p.body, p.author_user_type, p.author_user_id, p.is_deleted, p.created_at, p.updated_at,
              COALESCE(
                NULLIF(u.display_name, ''),
                NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''),
                NULLIF(u.pseudo, ''),
                NULLIF(u.email, ''),
                p.author_user_id
              ) AS author_display_name
         FROM forum_posts p
    LEFT JOIN users u ON u.id = p.author_user_id AND u.user_type = p.author_user_type
        WHERE p.thread_id = ?
        ORDER BY p.created_at ASC, p.id ASC
        LIMIT ? OFFSET ?`,
      [thread.id, pageSize, offset]
    );
    const sanitizedPosts = posts.map((p) => ({
      ...p,
      body: Number(p.is_deleted) ? '' : p.body,
    }));
    res.json({
      thread,
      posts: sanitizedPosts,
      page,
      page_size: pageSize,
      total_posts: Number(countRow?.c || 0),
    });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/threads/:id/posts', async (req, res) => {
  try {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const body = normalizeOptionalString(req.body?.body);
    if (!body || body.length < MIN_POST_BODY_LEN || body.length > MAX_POST_BODY_LEN) {
      return res.status(400).json({ error: `Message invalide (${MIN_POST_BODY_LEN}-${MAX_POST_BODY_LEN} caractères)` });
    }
    if (!checkCooldown(actor, 'post', POST_COOLDOWN_MS)) {
      return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
    }

    const thread = await queryOne('SELECT id, title, is_locked FROM forum_threads WHERE id = ? LIMIT 1', [req.params.id]);
    if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
    if (Number(thread.is_locked)) return res.status(409).json({ error: 'Sujet verrouillé' });

    const postId = uuidv4();
    await execute(
      `INSERT INTO forum_posts
        (id, thread_id, body, author_user_type, author_user_id, is_deleted)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [postId, thread.id, body, actor.userType, actor.userId]
    );
    await execute('UPDATE forum_threads SET last_post_at = NOW(), updated_at = NOW() WHERE id = ?', [thread.id]);
    const post = await queryOne(
      `SELECT p.id, p.thread_id, p.body, p.author_user_type, p.author_user_id, p.is_deleted, p.created_at, p.updated_at,
              COALESCE(
                NULLIF(u.display_name, ''),
                NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''),
                NULLIF(u.pseudo, ''),
                NULLIF(u.email, ''),
                p.author_user_id
              ) AS author_display_name
         FROM forum_posts p
    LEFT JOIN users u ON u.id = p.author_user_id AND u.user_type = p.author_user_type
        WHERE p.id = ?
        LIMIT 1`,
      [postId]
    );
    await logAudit('forum_post_create', 'forum_post', postId, `Réponse dans ${thread.title}`, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { thread_id: thread.id },
    });
    emitForumChanged({ reason: 'post_created', threadId: thread.id, postId });
    res.status(201).json(post);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/posts/:id/report', async (req, res) => {
  try {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const reason = normalizeOptionalString(req.body?.reason);
    if (!reason || reason.length < MIN_REPORT_REASON_LEN || reason.length > MAX_REPORT_REASON_LEN) {
      return res.status(400).json({ error: `Motif invalide (${MIN_REPORT_REASON_LEN}-${MAX_REPORT_REASON_LEN} caractères)` });
    }
    const post = await queryOne(
      'SELECT id, thread_id, author_user_type, author_user_id FROM forum_posts WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!post) return res.status(404).json({ error: 'Message introuvable' });

    const duplicate = await queryOne(
      `SELECT id
         FROM forum_reports
        WHERE post_id = ? AND reporter_user_type = ? AND reporter_user_id = ? AND status = 'open'
        LIMIT 1`,
      [post.id, actor.userType, actor.userId]
    );
    if (duplicate) return res.status(409).json({ error: 'Signalement déjà envoyé pour ce message' });

    const insert = await execute(
      `INSERT INTO forum_reports
        (post_id, reporter_user_type, reporter_user_id, reason, status)
       VALUES (?, ?, ?, ?, 'open')`,
      [post.id, actor.userType, actor.userId, reason]
    );
    await logAudit('forum_post_report', 'forum_post', post.id, 'Signalement message forum', {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { report_id: insert.insertId, thread_id: post.thread_id },
    });
    emitForumChanged({ reason: 'post_reported', threadId: post.thread_id, postId: post.id });
    res.status(201).json({ ok: true, report_id: insert.insertId });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/threads/:id/lock', requirePermission('teacher.access'), async (req, res) => {
  try {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const thread = await queryOne('SELECT id, title, is_locked FROM forum_threads WHERE id = ? LIMIT 1', [req.params.id]);
    if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
    const nextLocked = !!req.body?.locked;
    await execute('UPDATE forum_threads SET is_locked = ?, updated_at = NOW() WHERE id = ?', [nextLocked ? 1 : 0, thread.id]);
    const updated = await loadThreadThreadSafe(thread.id);
    await logAudit('forum_thread_lock', 'forum_thread', thread.id, `${nextLocked ? 'Verrouillage' : 'Déverrouillage'} sujet forum`, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { locked: nextLocked },
    });
    emitForumChanged({ reason: nextLocked ? 'thread_locked' : 'thread_unlocked', threadId: thread.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const post = await queryOne(
      'SELECT id, thread_id, author_user_type, author_user_id, is_deleted FROM forum_posts WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!post) return res.status(404).json({ error: 'Message introuvable' });
    if (Number(post.is_deleted)) return res.json({ ok: true, already_deleted: true });

    const ownsPost = post.author_user_type === actor.userType && post.author_user_id === actor.userId;
    const moderator = canModerateForum(req.auth);
    if (!ownsPost && !moderator) return res.status(403).json({ error: 'Permission insuffisante' });

    await execute(
      'UPDATE forum_posts SET is_deleted = 1, body = ?, updated_at = NOW() WHERE id = ?',
      ['[message supprimé]', post.id]
    );
    await execute(
      `UPDATE forum_threads
          SET last_post_at = COALESCE(
            (SELECT MAX(created_at) FROM forum_posts WHERE thread_id = ? AND is_deleted = 0),
            created_at
          ),
              updated_at = NOW()
        WHERE id = ?`,
      [post.thread_id, post.thread_id]
    );
    await logAudit('forum_post_delete', 'forum_post', post.id, 'Suppression message forum', {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { thread_id: post.thread_id, moderator_action: moderator && !ownsPost },
    });
    emitForumChanged({ reason: 'post_deleted', threadId: post.thread_id, postId: post.id });
    res.json({ ok: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
