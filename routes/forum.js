const express = require('express');
const { queryAll, queryOne } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { emitForumChanged } = require('../lib/realtime');
const { isReportsEnabled } = require('../lib/settings');
const { requireModuleEnabled } = require('../lib/shared/moduleGate');
const {
  getActor,
  canModerateWithTeacherAccess,
  isParticipationExcludedRole,
  createCooldownChecker,
  studentParticipationAllowed,
} = require('../lib/shared/participationGuards');
const { logAudit } = require('../lib/auditLog');
const {
  getUserAccessibleGroupIds,
  canBypassGroupScope,
  normalizeId,
} = require('../lib/groupScope');
const { parsePageQuery } = require('../lib/shared/httpHelpers');
const forumCore = require('../lib/shared/forumCore');

const router = express.Router();
const FORUM = forumCore.FORETMAP_FORUM;

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

// Noyau commun avec routes/context-comments.js (lib/shared/participationGuards) —
// mêmes comportements ; seuls le message 403, le code et la colonne de rôle sont locaux.
const canModerateForum = canModerateWithTeacherAccess;
const checkCooldown = createCooldownChecker();

/** n3boss / comptes non élèves : toujours participatif ; n3beur : selon le profil principal (roles.forum_participate) */
async function userForumParticipationAllowed(auth) {
  return studentParticipationAllowed(auth, 'forum_participate');
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

async function requireReportsEnabled(res) {
  if (await isReportsEnabled()) return true;
  res.status(403).json({
    error: 'Les signalements sont désactivés.',
    code: 'REPORTS_DISABLED',
  });
  return false;
}

async function loadThreadForApi(threadId) {
  const author = FORUM.displayName('ta', 't.author_user_type', 't.author_user_id');
  return queryOne(
    `SELECT t.id, t.group_id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.is_pinned, t.created_at, t.updated_at, t.last_post_at,
            ${author.select} AS author_display_name
       FROM forum_threads t
       ${author.join}
      WHERE t.id = ?
      LIMIT 1`,
    [threadId],
  );
}

async function resolveForumVisibleGroupIds(auth) {
  if (canBypassGroupScope(auth)) return null;
  return getUserAccessibleGroupIds(auth, { includeDescendants: true });
}

/**
 * Vrai si le groupe d'un sujet est dans le périmètre visible de l'acteur.
 * `null` (bypass admin / non scoped) => toujours autorisé. Applique le contrôle de
 * périmètre aux écritures (post, réaction, signalement), pas seulement aux lectures.
 */
async function isForumGroupInScope(auth, groupId) {
  const visibleGroupIds = await resolveForumVisibleGroupIds(auth);
  if (!Array.isArray(visibleGroupIds)) return true;
  return visibleGroupIds.includes(String(groupId || ''));
}

/** Charge un sujet et vérifie qu'il est dans le périmètre ; répond 404/403 sinon. */
async function loadThreadInScope(req, res) {
  const thread = await queryOne(
    'SELECT id, title, is_locked, is_pinned, group_id FROM forum_threads WHERE id = ? LIMIT 1',
    [req.params.id],
  );
  if (!thread) {
    res.status(404).json({ error: 'Sujet introuvable' });
    return null;
  }
  if (!(await isForumGroupInScope(req.auth, thread.group_id))) {
    res.status(403).json({ error: 'Groupe hors périmètre' });
    return null;
  }
  return thread;
}

/** Charge un message (avec l'état de son sujet) dans le périmètre ; répond 404/403 sinon. */
async function loadPostInScope(req, res) {
  const post = await forumCore.loadPostWithThread(FORUM, req.params.id);
  if (!post) {
    res.status(404).json({ error: 'Message introuvable' });
    return null;
  }
  if (!(await isForumGroupInScope(req.auth, post.group_id))) {
    res.status(403).json({ error: 'Groupe hors périmètre' });
    return null;
  }
  return post;
}

router.use(requireAuth);
router.use(requireModuleEnabled('foret', 'forum', 'Forum désactivé'));
/*
 * Le forum est fermé au seul profil « visiteur ». Il l'était aussi à « personnel », parce que
 * la garde s'appuyait sur la liste des profils **sans carte de travail ni tâches**, qui n'a
 * jamais eu vocation à décider de la parole. Un agent, un AED, un membre de la vie scolaire
 * participe (docs/reference/foretmap/stats-forum-et-suivi.md).
 */
router.use((req, res, next) => {
  if (isParticipationExcludedRole(req.auth)) {
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
    const author = FORUM.displayName('ta', 't.author_user_type', 't.author_user_id');
    const stats = forumCore.threadListStatsSql(FORUM, 't', getActor(req.auth));
    const rows = await queryAll(
      `SELECT t.id, t.group_id, t.title, t.author_user_type, t.author_user_id, t.is_locked, t.is_pinned, t.created_at, t.updated_at, t.last_post_at,
            ${author.select} AS author_display_name,
            ${stats.select}
       FROM forum_threads t
       ${author.join}
      ${whereSql}
      ORDER BY t.is_pinned DESC, t.last_post_at DESC, t.created_at DESC
      LIMIT ? OFFSET ?`,
      // Valeurs deja bornees par `parsePageQuery` ; parametrees par convention (audit
      // 2026-09, G5 / audit biodiversite, P8). En chaine : mysql2 encoderait un nombre JS
      // en DOUBLE, refuse par MySQL pour LIMIT.
      [...stats.params, ...whereParams, String(sqlLimit), String(sqlOffset)],
    );
    res.json({ items: rows, page, page_size: pageSize, total });
  }),
);

/**
 * Marqueur du dernier message publié par **quelqu'un d'autre** dans le périmètre visible :
 * le client le compare à son curseur de lecture local pour allumer le point « non lus ».
 * Ses propres messages sont exclus, sinon publier allumerait son propre point.
 */
router.get(
  '/unread-marker',
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const visibleGroupIds = await resolveForumVisibleGroupIds(req.auth);
    if (Array.isArray(visibleGroupIds) && !visibleGroupIds.length) {
      return res.json({ latest_post_id: null, latest_post_at: null });
    }
    const whereParts = [
      'p.is_deleted = 0',
      'NOT (p.author_user_type = ? AND p.author_user_id = ?)',
    ];
    const whereParams = [actor.userType, actor.userId];
    if (Array.isArray(visibleGroupIds)) {
      whereParts.push(`t.group_id IN (${visibleGroupIds.map(() => '?').join(',')})`);
      whereParams.push(...visibleGroupIds);
    }
    const row = await queryOne(
      `SELECT p.id, p.created_at
         FROM forum_posts p
         JOIN forum_threads t ON t.id = p.thread_id
        WHERE ${whereParts.join(' AND ')}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 1`,
      whereParams,
    );
    res.json({
      latest_post_id: row?.id || null,
      latest_post_at: row?.created_at || null,
    });
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
    const titleCheck = forumCore.resolveThreadTitle(FORUM, req.body?.title);
    if (titleCheck.error) return res.status(400).json({ error: titleCheck.error });
    const payload = forumCore.resolvePostPayload(FORUM, req.body?.body, req.body?.images);
    if (payload.error) return res.status(400).json({ error: payload.error });
    if (!checkCooldown(actor, 'thread', THREAD_COOLDOWN_MS)) {
      return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
    }

    const created = await forumCore.insertThreadWithFirstPost(FORUM, {
      title: titleCheck.title,
      body: payload.body,
      images: payload.images,
      actor,
      groupId: groupId || null,
    });
    if (created.error) return res.status(400).json({ error: created.error });
    const { threadId, postId } = created;

    const thread = await loadThreadForApi(threadId);
    await logAudit('forum_thread_create', 'forum_thread', threadId, titleCheck.title, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { post_id: postId, images_count: payload.images.length },
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
    const thread = await loadThreadForApi(req.params.id);
    if (!thread) return res.status(404).json({ error: 'Sujet introuvable' });
    const visibleGroupIds = await resolveForumVisibleGroupIds(req.auth);
    if (
      Array.isArray(visibleGroupIds) &&
      !visibleGroupIds.includes(String(thread.group_id || ''))
    ) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const { posts, total } = await forumCore.listThreadPosts(FORUM, thread.id, {
      actor,
      limit: sqlLimit,
      offset: sqlOffset,
    });
    res.json({
      thread,
      posts,
      page,
      page_size: pageSize,
      total_posts: total,
    });
  }),
);

router.post(
  '/posts/:id/reactions',
  asyncHandler(async (req, res) => {
    if (!(await requireForumParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const post = await loadPostInScope(req, res);
    if (!post) return;
    if (Number(post.is_deleted)) return res.status(409).json({ error: 'Message supprimé' });
    const toggle = await forumCore.togglePostReaction(FORUM, post.id, actor, req.body?.emoji);
    if (toggle.error) return res.status(toggle.status).json({ error: toggle.error });
    const { emoji, reacted } = toggle;

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
    const payload = forumCore.resolvePostPayload(FORUM, req.body?.body, req.body?.images);
    if (payload.error) return res.status(400).json({ error: payload.error });
    const thread = await loadThreadInScope(req, res);
    if (!thread) return;
    if (Number(thread.is_locked)) return res.status(409).json({ error: 'Sujet verrouillé' });
    // Cooldown consommé APRÈS les refus 404/403/409 : un POST rejeté ne doit pas imposer l'attente.
    if (!checkCooldown(actor, 'post', POST_COOLDOWN_MS)) {
      return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
    }

    const inserted = await forumCore.insertPost(FORUM, {
      threadId: thread.id,
      body: payload.body,
      images: payload.images,
      actor,
    });
    if (inserted.error) return res.status(400).json({ error: inserted.error });
    const { postId } = inserted;
    await forumCore.touchThreadLastPost(FORUM, thread.id);
    const post = await forumCore.loadPostForApi(FORUM, postId, actor);
    await logAudit('forum_post_create', 'forum_post', postId, `Réponse dans ${thread.title}`, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { thread_id: thread.id, images_count: payload.images.length },
    });
    emitForumChanged({ reason: 'post_created', threadId: thread.id, postId });
    res.status(201).json(post);
  }),
);

/**
 * Modifier son message : l'auteur seulement, jamais un message supprimé ni dans un sujet
 * verrouillé. `edited_at` alimente la mention « modifié ».
 */
router.patch(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    if (!(await requireForumParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const post = await loadPostInScope(req, res);
    if (!post) return;
    const refusal = forumCore.checkPostEditable({
      post,
      threadLocked: Number(post.thread_is_locked) === 1,
      actor,
    });
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });
    const edit = forumCore.resolveEditBody(FORUM, req.body?.body, {
      hasImages: !!post.image_paths_json,
    });
    if (edit.error) return res.status(400).json({ error: edit.error });
    await forumCore.editPostBody(FORUM, post.id, edit.body);
    const updated = await forumCore.loadPostForApi(FORUM, post.id, actor);
    await logAudit('forum_post_edit', 'forum_post', post.id, 'Modification message forum', {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { thread_id: post.thread_id },
    });
    emitForumChanged({ reason: 'post_edited', threadId: post.thread_id, postId: post.id });
    res.json(updated);
  }),
);

router.post(
  '/posts/:id/report',
  asyncHandler(async (req, res) => {
    if (!(await requireReportsEnabled(res))) return;
    if (!(await requireForumParticipation(req, res))) return;
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const reasonCheck = forumCore.resolveReportReason(req.body?.reason);
    if (reasonCheck.error) return res.status(400).json({ error: reasonCheck.error });
    const post = await loadPostInScope(req, res);
    if (!post) return;
    const report = await forumCore.createPostReport(FORUM, post.id, actor, reasonCheck.reason);
    if (report.error) return res.status(report.status).json({ error: report.error });
    await logAudit('forum_post_report', 'forum_post', post.id, 'Signalement message forum', {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { report_id: report.reportId, thread_id: post.thread_id },
    });
    emitForumChanged({ reason: 'post_reported', threadId: post.thread_id, postId: post.id });
    res.status(201).json({ ok: true, report_id: report.reportId });
  }),
);

/**
 * Signalements à traiter, pour les modérateurs, limités à leur périmètre de groupe.
 * `?status=open` (défaut), `resolved`, `dismissed` ou `all`.
 */
router.get(
  '/reports',
  requirePermission('forum.group.moderate'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePageQuery(req.query, {
      defaultPageSize: 50,
      maxPageSize: 100,
    });
    const visibleGroupIds = await resolveForumVisibleGroupIds(req.auth);
    const result = await forumCore.listPostReports(FORUM, {
      status: req.query?.status,
      groupIds: visibleGroupIds,
      limit: pageSize,
      offset,
    });
    res.json({ ...result, page, page_size: pageSize });
  }),
);

router.patch(
  '/reports/:id',
  requirePermission('forum.group.moderate'),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const report = await forumCore.loadReport(FORUM, req.params.id);
    if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
    if (!(await isForumGroupInScope(req.auth, report.group_id))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const outcome = await forumCore.resolvePostReport(FORUM, report.id, req.body?.status, actor);
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });
    const status = String(req.body.status).trim().toLowerCase();
    await logAudit('forum_report_resolve', 'forum_report', report.id, 'Traitement signalement', {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { post_id: report.post_id, status },
    });
    emitForumChanged({ reason: 'report_resolved', threadId: report.thread_id });
    res.json({ ok: true, id: report.id, status });
  }),
);

router.patch(
  '/threads/:id/lock',
  requirePermission('forum.group.moderate'),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const thread = await loadThreadInScope(req, res);
    if (!thread) return;
    const nextLocked = !!req.body?.locked;
    await forumCore.setThreadFlag(FORUM, thread.id, 'is_locked', nextLocked);
    const updated = await loadThreadForApi(thread.id);
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

/** Épingler un sujet : il reste en tête de liste, avant l'ordre par activité. */
router.patch(
  '/threads/:id/pin',
  requirePermission('forum.group.moderate'),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const thread = await loadThreadInScope(req, res);
    if (!thread) return;
    const nextPinned = !!req.body?.pinned;
    await forumCore.setThreadFlag(FORUM, thread.id, 'is_pinned', nextPinned);
    const updated = await loadThreadForApi(thread.id);
    await logAudit(
      'forum_thread_pin',
      'forum_thread',
      thread.id,
      `${nextPinned ? 'Épinglage' : 'Désépinglage'} sujet forum`,
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: { pinned: nextPinned },
      },
    );
    emitForumChanged({
      reason: nextPinned ? 'thread_pinned' : 'thread_unpinned',
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
    const post = await forumCore.loadPostWithThread(FORUM, req.params.id);
    if (!post) return res.status(404).json({ error: 'Message introuvable' });
    if (Number(post.is_deleted)) return res.json({ ok: true, already_deleted: true });

    const ownsPost = forumCore.actorOwns(post, actor);
    const moderator = canModerateForum(req.auth);
    if (!ownsPost && !moderator) return res.status(403).json({ error: 'Permission insuffisante' });

    await forumCore.softDeletePost(FORUM, post, actor);
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
