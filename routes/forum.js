const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { emitForumChanged } = require('../lib/realtime');
const { getSettingValue, isReportsEnabled } = require('../lib/settings');
const { logAudit } = require('./audit');
const {
  getUserAccessibleGroupIds,
  canBypassGroupScope,
  normalizeId,
} = require('../lib/groupScope');
const {
  persistUserContentImages,
  deleteUserContentImagesFromJson,
  attachPublicImageUrls,
  validateImagesPayload,
} = require('../lib/userContentImages');
const {
  normalizeOptionalString,
  parsePageQuery,
  buildInClauseParams,
} = require('../lib/shared/httpHelpers');

const router = express.Router();

const AUTO_BODY_WITH_PHOTOS = '(Photo)';

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

// O7 — pagination des listes du forum : coercition permissive (jamais de 400 pour une query
// invalide) reproduisant exactement `parsePageQuery` : `page` ≥ 1 (repli 1), `page_size`
// borné à MAX_PAGE_SIZE (repli DEFAULT_PAGE_SIZE), `offset` dérivé.
const forumPageQuerySchema = z
  .object({ page: z.unknown().optional(), page_size: z.unknown().optional() })
  .transform((q) =>
    parsePageQuery(q, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    }),
  );
const { getAllowedReactionSet, normalizeEmoji } = require('../lib/shared/reactionEmojiCore');

const cooldownState = new Map();

function getActor(auth) {
  const userType = String(auth?.userType || '')
    .trim()
    .toLowerCase();
  const userId = String(auth?.canonicalUserId || auth?.userId || '').trim();
  if (!userType || !userId) return null;
  return { userType, userId };
}

function canModerateForum(auth) {
  const roleSlug = String(auth?.roleSlug || '')
    .trim()
    .toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return perms.includes('teacher.access');
}

function isVisitorRole(auth) {
  return (
    String(auth?.roleSlug || '')
      .trim()
      .toLowerCase() === 'visiteur'
  );
}

/** n3boss / comptes non élèves : toujours participatif ; n3beur : selon le profil principal (roles.forum_participate) */
async function userForumParticipationAllowed(auth) {
  if (!auth) return false;
  if (String(auth.userType || '').toLowerCase() !== 'student') return true;
  const row = await queryOne(
    `SELECT COALESCE(r.forum_participate, 1) AS forum_participate
       FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'student' AND ur.is_primary = 1
  LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ? AND u.user_type = 'student' LIMIT 1`,
    [auth.userId],
  );
  if (!row) return true;
  return Number(row.forum_participate) !== 0;
}

async function requireForumParticipation(req, res) {
  const ok = await userForumParticipationAllowed(req.auth);
  if (ok) return true;
  res.status(403).json({
    error: 'Forum en lecture seule : la participation n’est pas activée pour ton profil.',
    code: 'FORUM_READ_ONLY',
  });
  return false;
}

function checkCooldown(actor, action, cooldownMs) {
  if (process.env.NODE_ENV === 'test') return true;
  const key = `${action}:${actor.userType}:${actor.userId}`;
  const now = Date.now();
  const last = cooldownState.get(key) || 0;
  if (now - last < cooldownMs) return false;
  cooldownState.set(key, now);
  return true;
}

async function loadThreadThreadSafe(threadId) {
  return queryOne(
    `SELECT t.id, t.group_id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.is_pinned, t.created_at, t.updated_at, t.last_post_at,
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
    [threadId],
  );
}

async function resolveForumVisibleGroupIds(auth) {
  if (canBypassGroupScope(auth)) return null;
  return getUserAccessibleGroupIds(auth, { includeDescendants: true });
}

async function loadForumPostReactions(postIds = [], actor = null) {
  if (!Array.isArray(postIds) || postIds.length === 0) return new Map();
  const inClause = buildInClauseParams(postIds);
  const rows = await queryAll(
    `SELECT r.post_id, r.emoji, COUNT(*) AS c,
            SUM(CASE WHEN r.reactor_user_type = ? AND r.reactor_user_id = ? THEN 1 ELSE 0 END) AS mine
       FROM forum_post_reactions r
      WHERE r.post_id IN ${inClause.clause}
      GROUP BY r.post_id, r.emoji
      ORDER BY r.post_id ASC, MIN(r.created_at) ASC, r.emoji ASC`,
    [actor?.userType || '', actor?.userId || '', ...inClause.params],
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.post_id)) map.set(row.post_id, []);
    map.get(row.post_id).push({
      emoji: row.emoji,
      count: Number(row.c || 0),
      reacted_by_me: Number(row.mine || 0) > 0,
    });
  }
  return map;
}

router.use(requireAuth);
router.use(async (req, res, next) => {
  try {
    const on = await getSettingValue('ui.modules.forum_enabled', true);
    if (!on) return res.status(503).json({ error: 'Forum désactivé' });
    return next();
  } catch (e) {
    logRouteError(e, req);
    return next(e);
  }
});
router.use((req, res, next) => {
  if (isVisitorRole(req.auth)) {
    return res.status(403).json({ error: 'Accès refusé au forum pour le profil visiteur' });
  }
  return next();
});

router.get(
  '/threads',
  validate({ query: forumPageQuerySchema }),
  asyncHandler(async (req, res) => {
    const requestedGroupId = normalizeId(req.query?.group_id);
    const visibleGroupIds = await resolveForumVisibleGroupIds(req.auth);
    if (
      requestedGroupId &&
      Array.isArray(visibleGroupIds) &&
      !visibleGroupIds.includes(requestedGroupId)
    ) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const { page, pageSize, offset } = req.validatedQuery;
    const sqlLimit = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
    const sqlOffset = Math.max(0, Number(offset) || 0);
    if (Array.isArray(visibleGroupIds) && !visibleGroupIds.length && !requestedGroupId) {
      return res.json({ items: [], page, page_size: pageSize, total: 0 });
    }
    const whereParts = [];
    const whereParams = [];
    if (requestedGroupId) {
      whereParts.push('t.group_id = ?');
      whereParams.push(requestedGroupId);
    } else if (Array.isArray(visibleGroupIds)) {
      whereParts.push(`t.group_id IN (${visibleGroupIds.map(() => '?').join(',')})`);
      whereParams.push(...visibleGroupIds);
    }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const totalRow = await queryOne(
      `SELECT COUNT(*) AS c FROM forum_threads t ${whereSql}`,
      whereParams,
    );
    const total = Number(totalRow?.c || 0);
    const rows = await queryAll(
      `SELECT t.id, t.group_id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.is_pinned, t.created_at, t.updated_at, t.last_post_at,
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
      ${whereSql}
      ORDER BY t.is_pinned DESC, t.last_post_at DESC, t.created_at DESC
      LIMIT ${sqlLimit} OFFSET ${sqlOffset}`,
      whereParams,
    );
    res.json({ items: rows, page, page_size: pageSize, total });
  }),
);

router.post(
  '/threads',
  asyncHandler(async (req, res) => {
    if (!(await requireForumParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const visibleGroupIds = await resolveForumVisibleGroupIds(req.auth);
    let groupId = normalizeId(req.body?.group_id);
    if (!groupId) {
      if (Array.isArray(visibleGroupIds)) {
        if (!visibleGroupIds.length) {
          return res.status(400).json({ error: 'Aucun groupe accessible pour créer un sujet' });
        }
        groupId = visibleGroupIds[0];
      }
    } else if (Array.isArray(visibleGroupIds) && !visibleGroupIds.includes(groupId)) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const title = normalizeOptionalString(req.body?.title);
    const imagesCheck = validateImagesPayload(req.body?.images);
    if (imagesCheck.error) return res.status(400).json({ error: imagesCheck.error });
    const imageList = imagesCheck.images || [];
    let body = normalizeOptionalString(req.body?.body);
    if (!title || title.length < MIN_THREAD_TITLE_LEN || title.length > MAX_THREAD_TITLE_LEN) {
      return res.status(400).json({
        error: `Titre invalide (${MIN_THREAD_TITLE_LEN}-${MAX_THREAD_TITLE_LEN} caractères)`,
      });
    }
    if (
      imageList.length === 0 &&
      (!body || body.length < MIN_POST_BODY_LEN || body.length > MAX_POST_BODY_LEN)
    ) {
      return res.status(400).json({
        error: `Message invalide (${MIN_POST_BODY_LEN}-${MAX_POST_BODY_LEN} caractères), ou ajoute au moins une image`,
      });
    }
    if (imageList.length > 0 && (!body || !String(body).trim())) {
      body = AUTO_BODY_WITH_PHOTOS;
    }
    if (!body || body.length < MIN_POST_BODY_LEN || body.length > MAX_POST_BODY_LEN) {
      return res
        .status(400)
        .json({ error: `Message invalide (${MIN_POST_BODY_LEN}-${MAX_POST_BODY_LEN} caractères)` });
    }
    if (!checkCooldown(actor, 'thread', THREAD_COOLDOWN_MS)) {
      return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
    }

    const threadId = uuidv4();
    const postId = uuidv4();
    let pathsJson = null;
    if (imageList.length > 0) {
      const persisted = persistUserContentImages('forum-posts', postId, imageList);
      if (persisted.error) {
        return res.status(400).json({ error: persisted.error });
      }
      pathsJson = persisted.pathsJson;
    }
    await execute(
      `INSERT INTO forum_threads
      (id, group_id, title, author_user_type, author_user_id, is_locked, is_pinned, last_post_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, NOW())`,
      [threadId, groupId, title, actor.userType, actor.userId],
    );
    await execute(
      `INSERT INTO forum_posts
      (id, thread_id, body, image_paths_json, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [postId, threadId, body, pathsJson, actor.userType, actor.userId],
    );

    const thread = await loadThreadThreadSafe(threadId);
    await logAudit('forum_thread_create', 'forum_thread', threadId, title, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { post_id: postId, images_count: imageList.length },
    });
    emitForumChanged({ reason: 'thread_created', threadId });
    res.status(201).json({ thread, first_post_id: postId });
  }),
);

router.get(
  '/threads/:id',
  validate({ query: forumPageQuerySchema }),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    const { page, pageSize, offset } = req.validatedQuery;
    const sqlLimit = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
    const sqlOffset = Math.max(0, Number(offset) || 0);
    const thread = await loadThreadThreadSafe(req.params.id);
    if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
    const visibleGroupIds = await resolveForumVisibleGroupIds(req.auth);
    if (
      Array.isArray(visibleGroupIds) &&
      !visibleGroupIds.includes(String(thread.group_id || ''))
    ) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }

    const countRow = await queryOne('SELECT COUNT(*) AS c FROM forum_posts WHERE thread_id = ?', [
      thread.id,
    ]);
    const posts = await queryAll(
      `SELECT p.id, p.thread_id, p.body, p.image_paths_json, p.author_user_type, p.author_user_id, p.is_deleted, p.created_at, p.updated_at,
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
      LIMIT ${sqlLimit} OFFSET ${sqlOffset}`,
      [thread.id],
    );
    const sanitizedPosts = posts.map((p) => {
      const row = { ...p, body: Number(p.is_deleted) ? '' : p.body };
      if (Number(p.is_deleted)) {
        delete row.image_paths_json;
        row.image_urls = [];
      } else {
        attachPublicImageUrls(row, 'forum-posts');
      }
      return row;
    });
    const reactionsByPost = await loadForumPostReactions(
      sanitizedPosts.map((p) => p.id),
      actor,
    );
    const enrichedPosts = sanitizedPosts.map((p) => ({
      ...p,
      reactions: reactionsByPost.get(p.id) || [],
    }));
    res.json({
      thread,
      posts: enrichedPosts,
      page,
      page_size: pageSize,
      total_posts: Number(countRow?.c || 0),
    });
  }),
);

router.post(
  '/posts/:id/reactions',
  asyncHandler(async (req, res) => {
    if (!(await requireForumParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const allowedReactions = await getAllowedReactionSet();
    const emoji = normalizeEmoji(req.body?.emoji, allowedReactions);
    if (!emoji) return res.status(400).json({ error: 'Emoji non supporté' });

    const post = await queryOne(
      'SELECT id, thread_id, is_deleted FROM forum_posts WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!post) return res.status(404).json({ error: 'Message introuvable' });
    if (Number(post.is_deleted)) return res.status(409).json({ error: 'Message supprimé' });

    const existing = await queryOne(
      `SELECT post_id
       FROM forum_post_reactions
      WHERE post_id = ? AND reactor_user_type = ? AND reactor_user_id = ? AND emoji = ?
      LIMIT 1`,
      [post.id, actor.userType, actor.userId, emoji],
    );

    let reacted = false;
    if (existing) {
      await execute(
        `DELETE FROM forum_post_reactions
        WHERE post_id = ? AND reactor_user_type = ? AND reactor_user_id = ? AND emoji = ?`,
        [post.id, actor.userType, actor.userId, emoji],
      );
      reacted = false;
    } else {
      await execute(
        `INSERT INTO forum_post_reactions
        (post_id, reactor_user_type, reactor_user_id, emoji)
       VALUES (?, ?, ?, ?)`,
        [post.id, actor.userType, actor.userId, emoji],
      );
      reacted = true;
    }

    await logAudit(
      'forum_post_reaction_toggle',
      'forum_post',
      post.id,
      'Réaction emoji message forum',
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: { thread_id: post.thread_id, emoji, reacted },
      },
    );
    emitForumChanged({
      reason: 'post_reaction_changed',
      threadId: post.thread_id,
      postId: post.id,
      emoji,
    });
    return res.json({ ok: true, reacted, emoji });
  }),
);

router.post(
  '/threads/:id/posts',
  asyncHandler(async (req, res) => {
    if (!(await requireForumParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const imagesCheck = validateImagesPayload(req.body?.images);
    if (imagesCheck.error) return res.status(400).json({ error: imagesCheck.error });
    const imageList = imagesCheck.images || [];
    let body = normalizeOptionalString(req.body?.body);
    if (
      imageList.length === 0 &&
      (!body || body.length < MIN_POST_BODY_LEN || body.length > MAX_POST_BODY_LEN)
    ) {
      return res.status(400).json({
        error: `Message invalide (${MIN_POST_BODY_LEN}-${MAX_POST_BODY_LEN} caractères), ou ajoute au moins une image`,
      });
    }
    if (imageList.length > 0 && (!body || !String(body).trim())) {
      body = AUTO_BODY_WITH_PHOTOS;
    }
    if (!body || body.length < MIN_POST_BODY_LEN || body.length > MAX_POST_BODY_LEN) {
      return res
        .status(400)
        .json({ error: `Message invalide (${MIN_POST_BODY_LEN}-${MAX_POST_BODY_LEN} caractères)` });
    }
    if (!checkCooldown(actor, 'post', POST_COOLDOWN_MS)) {
      return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
    }

    const thread = await queryOne(
      'SELECT id, title, is_locked FROM forum_threads WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
    if (Number(thread.is_locked)) return res.status(409).json({ error: 'Sujet verrouillé' });

    const postId = uuidv4();
    let pathsJson = null;
    if (imageList.length > 0) {
      const persisted = persistUserContentImages('forum-posts', postId, imageList);
      if (persisted.error) {
        return res.status(400).json({ error: persisted.error });
      }
      pathsJson = persisted.pathsJson;
    }
    await execute(
      `INSERT INTO forum_posts
      (id, thread_id, body, image_paths_json, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [postId, thread.id, body, pathsJson, actor.userType, actor.userId],
    );
    await execute(
      'UPDATE forum_threads SET last_post_at = NOW(), updated_at = NOW() WHERE id = ?',
      [thread.id],
    );
    const post = await queryOne(
      `SELECT p.id, p.thread_id, p.body, p.image_paths_json, p.author_user_type, p.author_user_id, p.is_deleted, p.created_at, p.updated_at,
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
      [postId],
    );
    attachPublicImageUrls(post, 'forum-posts');
    await logAudit('forum_post_create', 'forum_post', postId, `Réponse dans ${thread.title}`, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { thread_id: thread.id, images_count: imageList.length },
    });
    emitForumChanged({ reason: 'post_created', threadId: thread.id, postId });
    res.status(201).json(post);
  }),
);

router.post(
  '/posts/:id/report',
  asyncHandler(async (req, res) => {
    if (!(await isReportsEnabled())) {
      return res.status(403).json({
        error: 'Les signalements sont désactivés.',
        code: 'REPORTS_DISABLED',
      });
    }
    if (!(await requireForumParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const reason = normalizeOptionalString(req.body?.reason);
    if (!reason || reason.length < MIN_REPORT_REASON_LEN || reason.length > MAX_REPORT_REASON_LEN) {
      return res.status(400).json({
        error: `Motif invalide (${MIN_REPORT_REASON_LEN}-${MAX_REPORT_REASON_LEN} caractères)`,
      });
    }
    const post = await queryOne(
      'SELECT id, thread_id, author_user_type, author_user_id FROM forum_posts WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!post) return res.status(404).json({ error: 'Message introuvable' });

    const duplicate = await queryOne(
      `SELECT id
       FROM forum_reports
      WHERE post_id = ? AND reporter_user_type = ? AND reporter_user_id = ? AND status = 'open'
      LIMIT 1`,
      [post.id, actor.userType, actor.userId],
    );
    if (duplicate)
      return res.status(409).json({ error: 'Signalement déjà envoyé pour ce message' });

    const insert = await execute(
      `INSERT INTO forum_reports
      (post_id, reporter_user_type, reporter_user_id, reason, status)
     VALUES (?, ?, ?, ?, 'open')`,
      [post.id, actor.userType, actor.userId, reason],
    );
    await logAudit('forum_post_report', 'forum_post', post.id, 'Signalement message forum', {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { report_id: insert.insertId, thread_id: post.thread_id },
    });
    emitForumChanged({ reason: 'post_reported', threadId: post.thread_id, postId: post.id });
    res.status(201).json({ ok: true, report_id: insert.insertId });
  }),
);

router.patch(
  '/threads/:id/lock',
  requirePermission('teacher.access'),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const thread = await queryOne(
      'SELECT id, title, is_locked FROM forum_threads WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
    const nextLocked = !!req.body?.locked;
    await execute('UPDATE forum_threads SET is_locked = ?, updated_at = NOW() WHERE id = ?', [
      nextLocked ? 1 : 0,
      thread.id,
    ]);
    const updated = await loadThreadThreadSafe(thread.id);
    await logAudit(
      'forum_thread_lock',
      'forum_thread',
      thread.id,
      `${nextLocked ? 'Verrouillage' : 'Déverrouillage'} sujet forum`,
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: { locked: nextLocked },
      },
    );
    emitForumChanged({
      reason: nextLocked ? 'thread_locked' : 'thread_unlocked',
      threadId: thread.id,
    });
    res.json(updated);
  }),
);

router.delete(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    if (!(await requireForumParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const post = await queryOne(
      'SELECT id, thread_id, author_user_type, author_user_id, is_deleted, image_paths_json FROM forum_posts WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!post) return res.status(404).json({ error: 'Message introuvable' });
    if (Number(post.is_deleted)) return res.json({ ok: true, already_deleted: true });

    const ownsPost =
      post.author_user_type === actor.userType && post.author_user_id === actor.userId;
    const moderator = canModerateForum(req.auth);
    if (!ownsPost && !moderator) return res.status(403).json({ error: 'Permission insuffisante' });

    deleteUserContentImagesFromJson(post.image_paths_json, 'forum-posts');
    await execute(
      'UPDATE forum_posts SET is_deleted = 1, body = ?, image_paths_json = NULL, updated_at = NOW() WHERE id = ?',
      ['[message supprimé]', post.id],
    );
    await execute(
      `UPDATE forum_threads
        SET last_post_at = COALESCE(
          (SELECT MAX(created_at) FROM forum_posts WHERE thread_id = ? AND is_deleted = 0),
          created_at
        ),
            updated_at = NOW()
      WHERE id = ?`,
      [post.thread_id, post.thread_id],
    );
    await logAudit('forum_post_delete', 'forum_post', post.id, 'Suppression message forum', {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { thread_id: post.thread_id, moderator_action: moderator && !ownsPost },
    });
    emitForumChanged({ reason: 'post_deleted', threadId: post.thread_id, postId: post.id });
    res.json({ ok: true });
  }),
);

module.exports = router;
module.exports.forumPageQuerySchema = forumPageQuerySchema; // exporté pour test no-DB du contrat O7
