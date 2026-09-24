'use strict';

const express = require('express');
const { queryAll, queryOne } = require('../../database');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const { requireModuleEnabled } = require('../../lib/shared/moduleGate');
const { parsePageQuery } = require('../../lib/shared/httpHelpers');
const { z, validate } = require('../../lib/validate');
const { isReportsEnabled } = require('../../lib/settings');
const { getAllowedReactionSet } = require('../../lib/shared/reactionEmojiCore');
const { emitGlForumChanged } = require('../../lib/realtime');
const forumCore = require('../../lib/shared/forumCore');

const router = express.Router();
const FORUM = forumCore.GL_FORUM;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// O7 — pagination de GET /threads : coercition permissive (jamais de 400 pour une query
// invalide) reproduisant exactement `parsePageQuery` : `page` ≥ 1 (repli 1), `page_size`
// borné à [1, MAX_PAGE_SIZE] (repli DEFAULT_PAGE_SIZE), `offset` dérivé.
const glForumPageQuerySchema = z
  .object({ page: z.unknown().optional(), page_size: z.unknown().optional() })
  .transform((q) =>
    parsePageQuery(q, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    }),
  );

/** MJ et administrateurs G&L (même type de compte `gl_admin`). */
function canModerate(auth) {
  return String(auth?.userType || '').toLowerCase() === 'gl_admin';
}

function isGuest(auth) {
  return String(auth?.userType || '').toLowerCase() === 'gl_guest';
}

function actorOf(req) {
  return {
    userType: String(req.glAuth?.userType || 'gl_player'),
    userId: String(req.glAuth?.userId || ''),
  };
}

/** Le mode invité est une consultation : aucune écriture dans le forum. */
function rejectGuestWrite(req, res) {
  if (!isGuest(req.glAuth)) return false;
  res.status(403).json({ error: 'Le mode invité ne permet pas d’écrire dans le forum' });
  return true;
}

function rejectNonModerator(req, res) {
  if (canModerate(req.glAuth)) return false;
  res.status(403).json({ error: 'Permission insuffisante' });
  return true;
}

function parseIntId(req, res) {
  const id = Number(req.params.id);
  if (Number.isInteger(id) && id > 0) return id;
  res.status(400).json({ error: 'Identifiant invalide' });
  return null;
}

async function loadThreadForApi(threadId) {
  const author = FORUM.displayName('ta', 't.author_user_type', 't.author_user_id');
  return queryOne(
    `SELECT t.id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.is_pinned,
            t.created_at, t.updated_at, t.last_post_at,
            ${author.select} AS author_display_name
       FROM gl_forum_threads t
       ${author.join}
      WHERE t.id = ? AND t.is_deleted = 0
      LIMIT 1`,
    [threadId],
  );
}

async function loadPostOr404(req, res) {
  const id = parseIntId(req, res);
  if (id == null) return null;
  const post = await forumCore.loadPostWithThread(FORUM, id);
  if (!post) {
    res.status(404).json({ error: 'Message introuvable' });
    return null;
  }
  return post;
}

async function requireReportsEnabled(res) {
  if (await isReportsEnabled()) return true;
  res.status(403).json({ error: 'Les signalements sont désactivés.', code: 'REPORTS_DISABLED' });
  return false;
}

router.use(requireGlAuth);
router.use(requireModuleEnabled('gl', 'forum', 'Forum désactivé'));

/**
 * Réglages utiles à l'écran du forum. Les emojis de réaction et l'interrupteur des
 * signalements sont des réglages partagés avec ForetMap, qu'un jeton G&L ne peut pas lire
 * ailleurs.
 */
router.get('/config', async (req, res) => {
  const reactions = await getAllowedReactionSet();
  return res.json({
    reaction_emojis: [...reactions],
    reports_enabled: await isReportsEnabled(),
    can_moderate: canModerate(req.glAuth),
    can_participate: !isGuest(req.glAuth),
    moderator_can_reply_locked: true,
  });
});

router.get('/threads', validate({ query: glForumPageQuerySchema }), async (req, res) => {
  const { page, pageSize, offset } = req.validatedQuery;
  const totalRow = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_forum_threads WHERE is_deleted = 0',
  );
  const total = Number(totalRow?.c || 0);
  const author = FORUM.displayName('ta', 't.author_user_type', 't.author_user_id');
  const stats = forumCore.threadListStatsSql(FORUM, 't', actorOf(req));
  const rows = await queryAll(
    `SELECT t.id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.is_pinned,
            t.created_at, t.updated_at, t.last_post_at,
            ${author.select} AS author_display_name,
            ${stats.select}
       FROM gl_forum_threads t
       ${author.join}
      WHERE t.is_deleted = 0
      ORDER BY t.is_pinned DESC, t.last_post_at DESC, t.id DESC
      LIMIT ? OFFSET ?`,
    // Bornes deja validees par le schema de query ; parametrees par convention (audit
    // 2026-09, G5). En chaine : mysql2 encoderait un nombre JS en DOUBLE, refuse pour LIMIT.
    [...stats.params, String(pageSize), String(offset)],
  );
  return res.json({ items: rows, page, page_size: pageSize, total });
});

router.post('/threads', async (req, res) => {
  if (rejectGuestWrite(req, res)) return undefined;
  const titleCheck = forumCore.resolveThreadTitle(FORUM, req.body?.title);
  if (titleCheck.error) return res.status(400).json({ error: titleCheck.error });
  const payload = forumCore.resolvePostPayload(FORUM, req.body?.body, req.body?.images);
  if (payload.error) return res.status(400).json({ error: payload.error });
  const created = await forumCore.insertThreadWithFirstPost(FORUM, {
    title: titleCheck.title,
    body: payload.body,
    images: payload.images,
    actor: actorOf(req),
  });
  if (created.error) return res.status(400).json({ error: created.error });
  const thread = await loadThreadForApi(created.threadId);
  emitGlForumChanged({ reason: 'thread_created', threadId: created.threadId });
  // Champs du sujet à plat (contrat historique) + `thread` / `first_post_id` (contrat ForetMap).
  return res.status(201).json({ ...thread, thread, first_post_id: created.postId });
});

router.get('/threads/:id', validate({ query: glForumPageQuerySchema }), async (req, res) => {
  const id = parseIntId(req, res);
  if (id == null) return undefined;
  const thread = await loadThreadForApi(id);
  if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
  const { page, pageSize, offset } = req.validatedQuery;
  const { posts, total } = await forumCore.listThreadPosts(FORUM, id, {
    actor: actorOf(req),
    limit: pageSize,
    offset,
  });
  return res.json({ thread, posts, page, page_size: pageSize, total_posts: total });
});

router.post('/threads/:id/posts', async (req, res) => {
  if (rejectGuestWrite(req, res)) return undefined;
  const threadId = parseIntId(req, res);
  if (threadId == null) return undefined;
  const thread = await queryOne(
    'SELECT id, is_locked, is_deleted FROM gl_forum_threads WHERE id = ? LIMIT 1',
    [threadId],
  );
  if (!thread || Number(thread.is_deleted))
    return res.status(404).json({ error: 'Sujet introuvable' });
  // Le MJ peut encore répondre dans un sujet verrouillé (clore une discussion par un mot).
  if (Number(thread.is_locked) && !canModerate(req.glAuth)) {
    return res.status(409).json({ error: 'Sujet verrouillé' });
  }
  const payload = forumCore.resolvePostPayload(FORUM, req.body?.body, req.body?.images);
  if (payload.error) return res.status(400).json({ error: payload.error });
  const actor = actorOf(req);
  const inserted = await forumCore.insertPost(FORUM, {
    threadId,
    body: payload.body,
    images: payload.images,
    actor,
  });
  if (inserted.error) return res.status(400).json({ error: inserted.error });
  await forumCore.touchThreadLastPost(FORUM, threadId);
  const post = await forumCore.loadPostForApi(FORUM, inserted.postId, actor);
  emitGlForumChanged({ reason: 'post_created', threadId, postId: inserted.postId });
  return res.status(201).json(post);
});

router.patch('/posts/:id', async (req, res) => {
  if (rejectGuestWrite(req, res)) return undefined;
  const post = await loadPostOr404(req, res);
  if (!post) return undefined;
  const actor = actorOf(req);
  const refusal = forumCore.checkPostEditable({
    post,
    threadLocked: Number(post.thread_is_locked) === 1,
    actor,
    moderatorBypassLock: canModerate(req.glAuth),
  });
  if (refusal) return res.status(refusal.status).json({ error: refusal.error });
  const edit = forumCore.resolveEditBody(FORUM, req.body?.body, {
    hasImages: !!post.image_paths_json,
  });
  if (edit.error) return res.status(400).json({ error: edit.error });
  await forumCore.editPostBody(FORUM, post.id, edit.body);
  const updated = await forumCore.loadPostForApi(FORUM, post.id, actor);
  emitGlForumChanged({ reason: 'post_edited', threadId: post.thread_id, postId: post.id });
  return res.json(updated);
});

router.post('/posts/:id/reactions', async (req, res) => {
  if (rejectGuestWrite(req, res)) return undefined;
  const post = await loadPostOr404(req, res);
  if (!post) return undefined;
  if (Number(post.is_deleted)) return res.status(409).json({ error: 'Message supprimé' });
  const toggle = await forumCore.togglePostReaction(FORUM, post.id, actorOf(req), req.body?.emoji);
  if (toggle.error) return res.status(toggle.status).json({ error: toggle.error });
  emitGlForumChanged({
    reason: 'post_reaction_changed',
    threadId: post.thread_id,
    postId: post.id,
    emoji: toggle.emoji,
  });
  return res.json({ ok: true, reacted: toggle.reacted, emoji: toggle.emoji });
});

router.post('/posts/:id/report', async (req, res) => {
  if (!(await requireReportsEnabled(res))) return undefined;
  if (rejectGuestWrite(req, res)) return undefined;
  const reasonCheck = forumCore.resolveReportReason(req.body?.reason);
  if (reasonCheck.error) return res.status(400).json({ error: reasonCheck.error });
  const post = await loadPostOr404(req, res);
  if (!post) return undefined;
  const report = await forumCore.createPostReport(FORUM, post.id, actorOf(req), reasonCheck.reason);
  if (report.error) return res.status(report.status).json({ error: report.error });
  emitGlForumChanged({ reason: 'post_reported', threadId: post.thread_id, postId: post.id });
  return res.status(201).json({ ok: true, report_id: report.reportId });
});

router.get('/reports', async (req, res) => {
  if (rejectNonModerator(req, res)) return undefined;
  const { page, pageSize, offset } = parsePageQuery(req.query, {
    defaultPageSize: 50,
    maxPageSize: 100,
  });
  const result = await forumCore.listPostReports(FORUM, {
    status: req.query?.status,
    limit: pageSize,
    offset,
  });
  return res.json({ ...result, page, page_size: pageSize });
});

router.patch('/reports/:id', async (req, res) => {
  if (rejectNonModerator(req, res)) return undefined;
  const id = parseIntId(req, res);
  if (id == null) return undefined;
  const report = await forumCore.loadReport(FORUM, id);
  if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
  const outcome = await forumCore.resolvePostReport(
    FORUM,
    report.id,
    req.body?.status,
    actorOf(req),
  );
  if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
  const status = String(req.body.status).trim().toLowerCase();
  emitGlForumChanged({ reason: 'report_resolved', threadId: report.thread_id });
  return res.json({ ok: true, id: report.id, status });
});

async function setThreadFlagRoute(req, res, column, value, reasons) {
  if (rejectNonModerator(req, res)) return undefined;
  const id = parseIntId(req, res);
  if (id == null) return undefined;
  const thread = await queryOne(
    'SELECT id FROM gl_forum_threads WHERE id = ? AND is_deleted = 0 LIMIT 1',
    [id],
  );
  if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
  await forumCore.setThreadFlag(FORUM, id, column, value);
  const updated = await loadThreadForApi(id);
  emitGlForumChanged({ reason: value ? reasons[0] : reasons[1], threadId: id });
  return res.json({ ok: true, ...updated });
}

router.patch('/threads/:id/lock', (req, res) =>
  setThreadFlagRoute(req, res, 'is_locked', !!req.body?.locked, [
    'thread_locked',
    'thread_unlocked',
  ]),
);

router.patch('/threads/:id/pin', (req, res) =>
  setThreadFlagRoute(req, res, 'is_pinned', !!req.body?.pinned, [
    'thread_pinned',
    'thread_unpinned',
  ]),
);

router.delete('/posts/:id', async (req, res) => {
  if (rejectGuestWrite(req, res)) return undefined;
  const post = await loadPostOr404(req, res);
  if (!post) return undefined;
  if (Number(post.is_deleted)) return res.json({ ok: true, already_deleted: true });
  const actor = actorOf(req);
  if (!forumCore.actorOwns(post, actor) && !canModerate(req.glAuth)) {
    return res.status(403).json({ error: 'Permission insuffisante' });
  }
  await forumCore.softDeletePost(FORUM, post, actor);
  emitGlForumChanged({ reason: 'post_deleted', threadId: post.thread_id, postId: post.id });
  return res.json({ ok: true });
});

module.exports = router;
module.exports.glForumPageQuerySchema = glForumPageQuerySchema; // exporté pour test no-DB du contrat O7
