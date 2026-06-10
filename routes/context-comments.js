const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { emitContextCommentsChanged } = require('../lib/realtime');
const { getSettingValue } = require('../lib/settings');
const {
  persistUserContentImages,
  attachPublicImageUrls,
  validateImagesPayload,
} = require('../lib/userContentImages');
const {
  normalizeOptionalString,
  parsePageQuery,
} = require('../lib/shared/httpHelpers');
const {
  AUTO_BODY_WITH_PHOTOS: CORE_AUTO_BODY_WITH_PHOTOS,
  getAllowedReactionSet,
  normalizeEmoji,
  loadContextCommentReactions,
  listContextComments,
  toggleContextCommentReaction,
  softDeleteContextComment,
} = require('../lib/shared/contextCommentsCore');

const router = express.Router();

const AUTO_BODY_WITH_PHOTOS = CORE_AUTO_BODY_WITH_PHOTOS;

const ALLOWED_CONTEXT_TYPES = new Set([
  'task',
  'project',
  'zone',
  'marker',
  'plant',
  'tutorial',
]);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MIN_COMMENT_LEN = 2;
const MAX_COMMENT_LEN = 4000;
const MIN_REPORT_REASON_LEN = 3;
const MAX_REPORT_REASON_LEN = 500;
const COMMENT_COOLDOWN_MS = 3_000;
const cooldownState = new Map();

function normalizeContextType(value) {
  const type = String(value || '').trim().toLowerCase();
  return ALLOWED_CONTEXT_TYPES.has(type) ? type : '';
}

function getActor(auth) {
  const userType = String(auth?.userType || '').trim().toLowerCase();
  const userId = String(auth?.canonicalUserId || auth?.userId || '').trim();
  if (!userType || !userId) return null;
  return { userType, userId };
}

function canModerateComments(auth) {
  const roleSlug = String(auth?.roleSlug || '').trim().toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return perms.includes('teacher.access');
}

function isVisitorRole(auth) {
  return String(auth?.roleSlug || '').trim().toLowerCase() === 'visiteur';
}

/** n3boss : toujours ; n3beur : selon le profil principal (roles.context_comment_participate) */
async function userContextCommentParticipationAllowed(auth) {
  if (!auth) return false;
  if (String(auth.userType || '').toLowerCase() !== 'student') return true;
  const row = await queryOne(
    `SELECT COALESCE(r.context_comment_participate, 1) AS context_comment_participate
       FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'student' AND ur.is_primary = 1
  LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ? AND u.user_type = 'student' LIMIT 1`,
    [auth.userId]
  );
  if (!row) return true;
  return Number(row.context_comment_participate) !== 0;
}

async function requireContextCommentParticipation(req, res) {
  const ok = await userContextCommentParticipationAllowed(req.auth);
  if (ok) return true;
  res.status(403).json({
    error: 'Commentaires en lecture seule : la publication n’est pas activée pour ton profil.',
    code: 'CONTEXT_COMMENT_READ_ONLY',
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

async function contextExists(contextType, contextId) {
  if (contextType === 'task') {
    const row = await queryOne('SELECT id FROM tasks WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'project') {
    const row = await queryOne('SELECT id FROM task_projects WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'zone') {
    const row = await queryOne('SELECT id FROM zones WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'marker') {
    const row = await queryOne('SELECT id FROM map_markers WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'plant') {
    const row = await queryOne('SELECT id FROM plants WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'tutorial') {
    const row = await queryOne('SELECT id FROM tutorials WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  return false;
}

router.use(requireAuth);
router.use(async (req, res, next) => {
  try {
    const on = await getSettingValue('ui.modules.context_comments_enabled', true);
    if (!on) return res.status(503).json({ error: 'Commentaires de contexte désactivés' });
    return next();
  } catch (e) {
    logRouteError(e, req);
    // Ne pas passer par next(e) : le handler global masque le détail derrière « Erreur serveur ».
    if (res.headersSent) return;
    return res.status(503).json({
      error:
        'Commentaires temporairement indisponibles (impossible de lire les réglages ou la base). Réessaie dans un instant.',
      code: 'CONTEXT_COMMENTS_UNAVAILABLE',
    });
  }
});
router.use((req, res, next) => {
  if (isVisitorRole(req.auth)) {
    return res.status(403).json({ error: 'Accès refusé aux commentaires de contexte pour le profil visiteur' });
  }
  return next();
});

router.get('/', asyncHandler(async (req, res) => {
  const actor = getActor(req.auth);
  const contextType = normalizeContextType(req.query?.contextType);
  const contextId = normalizeOptionalString(req.query?.contextId);
  if (!contextType) return res.status(400).json({ error: 'contextType invalide (task|project|zone|marker|plant|tutorial)' });
  if (!contextId) return res.status(400).json({ error: 'contextId requis' });
  if (!(await contextExists(contextType, contextId))) {
    return res.status(404).json({ error: 'Contexte introuvable' });
  }
  const { page, pageSize, offset } = parsePageQuery(req.query, {
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });
  const sqlLimit = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
  const sqlOffset = Math.max(0, Number(offset) || 0);
  const { items, total } = await listContextComments(contextType, contextId, {
    includeAuthorDisplayName: true,
    pageSize: sqlLimit,
    offset: sqlOffset,
  });
  const reactionsByComment = await loadContextCommentReactions(items.map((item) => item.id), actor);
  const enrichedItems = items.map((item) => ({
    ...item,
    reactions: reactionsByComment.get(item.id) || [],
  }));
  return res.json({ items: enrichedItems, page, page_size: pageSize, total });
}));

router.post('/:id/reactions', asyncHandler(async (req, res) => {
  if (!(await requireContextCommentParticipation(req, res))) return;
  const actor = getActor(req.auth);
  if (!actor) return res.status(401).json({ error: 'Session invalide' });
  const allowedReactions = await getAllowedReactionSet();
  const emoji = normalizeEmoji(req.body?.emoji, allowedReactions);
  if (!emoji) return res.status(400).json({ error: 'Emoji non supporté' });

  const toggle = await toggleContextCommentReaction(req.params.id, actor, emoji);
  if (toggle.error === 'not_found') return res.status(404).json({ error: 'Commentaire introuvable' });
  if (toggle.error === 'deleted') return res.status(409).json({ error: 'Commentaire supprimé' });
  const { comment, reacted } = toggle;

  await logAudit('context_comment_reaction_toggle', 'context_comment', comment.id, 'Réaction emoji commentaire contextuel', {
    req,
    actorUserType: actor.userType,
    actorUserId: actor.userId,
    payload: { context_type: comment.context_type, context_id: comment.context_id, emoji, reacted },
  });
  emitContextCommentsChanged({
    reason: 'comment_reaction_changed',
    contextType: comment.context_type,
    contextId: comment.context_id,
    commentId: comment.id,
    emoji,
  });
  return res.json({ ok: true, reacted, emoji });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!(await requireContextCommentParticipation(req, res))) return;
  const actor = getActor(req.auth);
  if (!actor) return res.status(401).json({ error: 'Session invalide' });
  const contextType = normalizeContextType(req.body?.contextType);
  const contextId = normalizeOptionalString(req.body?.contextId);
  const imagesCheck = validateImagesPayload(req.body?.images);
  if (imagesCheck.error) return res.status(400).json({ error: imagesCheck.error });
  const imageList = imagesCheck.images || [];
  let body = normalizeOptionalString(req.body?.body);
  if (!contextType) return res.status(400).json({ error: 'contextType invalide (task|project|zone|marker|plant|tutorial)' });
  if (!contextId) return res.status(400).json({ error: 'contextId requis' });
  if (imageList.length === 0 && (!body || body.length < MIN_COMMENT_LEN || body.length > MAX_COMMENT_LEN)) {
    return res.status(400).json({ error: `Message invalide (${MIN_COMMENT_LEN}-${MAX_COMMENT_LEN} caractères), ou ajoute au moins une image` });
  }
  if (imageList.length > 0 && (!body || !String(body).trim())) {
    body = AUTO_BODY_WITH_PHOTOS;
  }
  if (body.length < MIN_COMMENT_LEN || body.length > MAX_COMMENT_LEN) {
    return res.status(400).json({ error: `Message invalide (${MIN_COMMENT_LEN}-${MAX_COMMENT_LEN} caractères)` });
  }
  if (!(await contextExists(contextType, contextId))) {
    return res.status(404).json({ error: 'Contexte introuvable' });
  }
  if (!checkCooldown(actor, 'context_comment', COMMENT_COOLDOWN_MS)) {
    return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
  }
  const commentId = uuidv4();
  let pathsJson = null;
  if (imageList.length > 0) {
    const persisted = persistUserContentImages('context-comments', commentId, imageList);
    if (persisted.error) {
      return res.status(400).json({ error: persisted.error });
    }
    pathsJson = persisted.pathsJson;
  }
  await execute(
    `INSERT INTO context_comments
      (id, context_type, context_id, body, image_paths_json, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [commentId, contextType, contextId, body, pathsJson, actor.userType, actor.userId]
  );
  const created = await queryOne(
    `SELECT c.id, c.context_type, c.context_id, c.body, c.image_paths_json, c.author_user_type, c.author_user_id, c.is_deleted, c.created_at, c.updated_at,
            COALESCE(
              NULLIF(u.display_name, ''),
              NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''),
              NULLIF(u.pseudo, ''),
              NULLIF(u.email, ''),
              c.author_user_id
            ) AS author_display_name
       FROM context_comments c
  LEFT JOIN users u ON u.id = c.author_user_id AND u.user_type = c.author_user_type
      WHERE c.id = ?
      LIMIT 1`,
    [commentId]
  );
  attachPublicImageUrls(created, 'context-comments');
  await logAudit('context_comment_create', 'context_comment', commentId, `Commentaire ${contextType}:${contextId}`, {
    req,
    actorUserType: actor.userType,
    actorUserId: actor.userId,
    payload: { context_type: contextType, context_id: contextId, images_count: imageList.length },
  });
  emitContextCommentsChanged({ reason: 'comment_created', contextType, contextId, commentId });
  return res.status(201).json(created);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!(await requireContextCommentParticipation(req, res))) return;
  const actor = getActor(req.auth);
  if (!actor) return res.status(401).json({ error: 'Session invalide' });
  const existing = await queryOne(
    `SELECT id, context_type, context_id, author_user_type, author_user_id, is_deleted
       FROM context_comments WHERE id = ? LIMIT 1`,
    [req.params.id],
  );
  if (!existing) return res.status(404).json({ error: 'Commentaire introuvable' });
  if (Number(existing.is_deleted)) return res.json({ ok: true, already_deleted: true });

  const ownsComment = existing.author_user_type === actor.userType && existing.author_user_id === actor.userId;
  const moderator = canModerateComments(req.auth);
  if (!ownsComment && !moderator) return res.status(403).json({ error: 'Permission insuffisante' });

  const deleted = await softDeleteContextComment(req.params.id);
  const comment = deleted.comment;
  await logAudit('context_comment_delete', 'context_comment', comment.id, 'Suppression commentaire contextuel', {
    req,
    actorUserType: actor.userType,
    actorUserId: actor.userId,
    payload: {
      context_type: comment.context_type,
      context_id: comment.context_id,
      moderator_action: moderator && !ownsComment,
    },
  });
  emitContextCommentsChanged({
    reason: 'comment_deleted',
    contextType: comment.context_type,
    contextId: comment.context_id,
    commentId: comment.id,
  });
  return res.json({ ok: true });
}));

router.post('/:id/report', asyncHandler(async (req, res) => {
  if (!(await requireContextCommentParticipation(req, res))) return;
  const actor = getActor(req.auth);
  if (!actor) return res.status(401).json({ error: 'Session invalide' });
  const reason = normalizeOptionalString(req.body?.reason);
  if (!reason || reason.length < MIN_REPORT_REASON_LEN || reason.length > MAX_REPORT_REASON_LEN) {
    return res.status(400).json({ error: `Motif invalide (${MIN_REPORT_REASON_LEN}-${MAX_REPORT_REASON_LEN} caractères)` });
  }
  const comment = await queryOne(
    `SELECT id, context_type, context_id
       FROM context_comments
      WHERE id = ?
      LIMIT 1`,
    [req.params.id]
  );
  if (!comment) return res.status(404).json({ error: 'Commentaire introuvable' });

  const duplicate = await queryOne(
    `SELECT id
       FROM context_comment_reports
      WHERE comment_id = ?
        AND reporter_user_type = ?
        AND reporter_user_id = ?
        AND status = 'open'
      LIMIT 1`,
    [comment.id, actor.userType, actor.userId]
  );
  if (duplicate) return res.status(409).json({ error: 'Signalement déjà envoyé pour ce commentaire' });

  const created = await execute(
    `INSERT INTO context_comment_reports
      (comment_id, reporter_user_type, reporter_user_id, reason, status)
     VALUES (?, ?, ?, ?, 'open')`,
    [comment.id, actor.userType, actor.userId, reason]
  );
  await logAudit('context_comment_report', 'context_comment', comment.id, 'Signalement commentaire contextuel', {
    req,
    actorUserType: actor.userType,
    actorUserId: actor.userId,
    payload: {
      report_id: created.insertId,
      context_type: comment.context_type,
      context_id: comment.context_id,
    },
  });
  emitContextCommentsChanged({
    reason: 'comment_reported',
    contextType: comment.context_type,
    contextId: comment.context_id,
    commentId: comment.id,
  });
  return res.status(201).json({ ok: true, report_id: created.insertId });
}));

module.exports = router;
