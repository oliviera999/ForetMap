'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { queryOne, execute } = require('../../database');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const { emitContextCommentsChanged } = require('../../lib/realtime');
const {
  persistUserContentImages,
  attachPublicImageUrls,
  validateImagesPayload,
} = require('../../lib/userContentImages');
const { normalizeOptionalString, parsePageQuery } = require('../../lib/shared/httpHelpers');
const { z, validate } = require('../../lib/validate');
const asyncHandler = require('../../lib/asyncHandler');
const {
  AUTO_BODY_WITH_PHOTOS: CORE_AUTO_BODY_WITH_PHOTOS,
  getAllowedReactionSet,
  normalizeEmoji,
  loadContextCommentReactions,
  listContextComments,
  toggleContextCommentReaction,
  softDeleteContextComment,
} = require('../../lib/shared/contextCommentsCore');
const { isReportsEnabled } = require('../../lib/settings');

const router = express.Router();

const ALLOWED_CONTEXT_TYPES = new Set(['gl_chapter', 'gl_scene', 'gl_game', 'gl_mascot_pack']);

const AUTO_BODY_WITH_PHOTOS = CORE_AUTO_BODY_WITH_PHOTOS;
const MIN_BODY = 2;
const MAX_BODY = 4000;
const MIN_REPORT_REASON_LEN = 3;
const MAX_REPORT_REASON_LEN = 500;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
function normalizeContextType(value) {
  const t = String(value || '')
    .trim()
    .toLowerCase();
  return ALLOWED_CONTEXT_TYPES.has(t) ? t : '';
}

// O7 — query de GET / : coercition permissive (jamais de 400 issu du schéma) reproduisant
// exactement l'ancienne lecture manuelle : `contextType` via normalizeContextType (type
// inconnu → ''), `contextId` via normalizeOptionalString (vide → null), pagination via
// parsePageQuery (`page` ≥ 1, `page_size` borné [1, MAX_PAGE_SIZE], `offset` dérivé).
// Les 400 « contextType invalide » / « contextId requis » restent décidés par le handler
// (contrat historique inchangé) — le schéma, lui, ne rejette jamais.
const glContextCommentsListQuerySchema = z
  .object({
    contextType: z.unknown().optional(),
    contextId: z.unknown().optional(),
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .transform((q) => ({
    contextType: normalizeContextType(q.contextType),
    contextId: normalizeOptionalString(q.contextId),
    ...parsePageQuery(q, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    }),
  }));

async function contextExists(contextType, contextId) {
  if (contextType === 'gl_chapter') {
    const row = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'gl_scene') {
    const row = await queryOne('SELECT id FROM gl_chapter_markers WHERE id = ? LIMIT 1', [
      contextId,
    ]);
    return !!row;
  }
  if (contextType === 'gl_game') {
    const row = await queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'gl_mascot_pack') {
    const row = await queryOne('SELECT id FROM gl_mascot_packs WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  return false;
}

function getActor(glAuth) {
  const userType = String(glAuth?.userType || '')
    .trim()
    .toLowerCase();
  const userId = String(glAuth?.userId || '').trim();
  if (!userType || !userId) return null;
  return { userType, userId };
}

function canModerate(auth) {
  return String(auth?.userType || '').toLowerCase() === 'gl_admin';
}

router.use(requireGlAuth);

router.get(
  '/',
  validate({ query: glContextCommentsListQuerySchema }),
  asyncHandler(async (req, res) => {
    const actor = getActor(req.glAuth);
    const { contextType, contextId, page, pageSize, offset } = req.validatedQuery;
    if (!contextType) return res.status(400).json({ error: 'contextType invalide' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!(await contextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const { items, total } = await listContextComments(contextType, contextId, {
      includeAuthorDisplayName: false,
      pageSize,
      offset,
    });
    const reactionsByComment = await loadContextCommentReactions(
      items.map((item) => item.id),
      actor,
    );
    const enrichedItems = items.map((item) => ({
      ...item,
      reactions: reactionsByComment.get(item.id) || [],
    }));
    return res.json({ items: enrichedItems, page, page_size: pageSize, total });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeOptionalString(req.body?.contextId);
    const imagesCheck = validateImagesPayload(req.body?.images);
    if (imagesCheck.error) return res.status(400).json({ error: imagesCheck.error });
    const imageList = imagesCheck.images || [];
    let body = normalizeOptionalString(req.body?.body);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (imageList.length === 0 && (!body || body.length < MIN_BODY || body.length > MAX_BODY)) {
      return res.status(400).json({
        error: `Message invalide (${MIN_BODY}-${MAX_BODY} caractères), ou ajoute au moins une image`,
      });
    }
    if (imageList.length > 0 && (!body || !String(body).trim())) body = AUTO_BODY_WITH_PHOTOS;
    if (!body || body.length < MIN_BODY || body.length > MAX_BODY) {
      return res
        .status(400)
        .json({ error: `Message invalide (${MIN_BODY}-${MAX_BODY} caractères)` });
    }
    if (!(await contextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const id = crypto.randomUUID();
    const actor = getActor(req.glAuth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    let pathsJson = null;
    if (imageList.length > 0) {
      const persisted = persistUserContentImages('context-comments', id, imageList);
      if (persisted.error) return res.status(400).json({ error: persisted.error });
      pathsJson = persisted.pathsJson;
    }
    await execute(
      `INSERT INTO context_comments (id, context_type, context_id, body, image_paths_json, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, contextType, contextId, body, pathsJson, actor.userType, actor.userId],
    );
    // Audit GL §4.6 — réponse construite depuis l'id (UUID généré ici) + paramètres insérés,
    // au lieu de relire la ligne complète. Seuls created_at/updated_at, générés en BDD
    // (DEFAULT CURRENT_TIMESTAMP), imposent encore un SELECT ciblé par id. Mêmes clés, même
    // ordre que l'ancien SELECT * ; les colonnes étant des VARCHAR/TEXT, les valeurs insérées
    // reviennent identiques.
    const stamps = await queryOne(
      'SELECT created_at, updated_at FROM context_comments WHERE id = ? LIMIT 1',
      [id],
    );
    const created = {
      id,
      context_type: contextType,
      context_id: contextId,
      body,
      image_paths_json: pathsJson,
      author_user_type: actor.userType,
      author_user_id: actor.userId,
      is_deleted: 0,
      created_at: stamps?.created_at ?? null,
      updated_at: stamps?.updated_at ?? null,
    };
    attachPublicImageUrls(created, 'context-comments');
    emitContextCommentsChanged({
      reason: 'comment_created',
      contextType,
      contextId,
      commentId: id,
    });
    return res.status(201).json(created);
  }),
);

router.post(
  '/:id/reactions',
  asyncHandler(async (req, res) => {
    const actor = getActor(req.glAuth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const allowedReactions = await getAllowedReactionSet();
    const emoji = normalizeEmoji(req.body?.emoji, allowedReactions);
    if (!emoji) return res.status(400).json({ error: 'Emoji non supporté' });

    const toggle = await toggleContextCommentReaction(req.params.id, actor, emoji);
    if (toggle.error === 'not_found')
      return res.status(404).json({ error: 'Commentaire introuvable' });
    if (toggle.error === 'deleted') return res.status(409).json({ error: 'Commentaire supprimé' });
    const { comment, reacted } = toggle;
    emitContextCommentsChanged({
      reason: 'comment_reaction_changed',
      contextType: comment.context_type,
      contextId: comment.context_id,
      commentId: comment.id,
      emoji,
    });
    return res.json({ ok: true, reacted, emoji });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await queryOne(
      'SELECT id, author_user_type, author_user_id, is_deleted FROM context_comments WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!existing) return res.status(404).json({ error: 'Commentaire introuvable' });
    if (Number(existing.is_deleted)) return res.json({ ok: true, already_deleted: true });
    const owns =
      existing.author_user_type === req.glAuth.userType &&
      String(existing.author_user_id) === String(req.glAuth.userId);
    if (!owns && !canModerate(req.glAuth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const deleted = await softDeleteContextComment(req.params.id);
    const comment = deleted.comment;
    emitContextCommentsChanged({
      reason: 'comment_deleted',
      contextType: comment.context_type,
      contextId: comment.context_id,
      commentId: comment.id,
    });
    return res.json({ ok: true });
  }),
);

router.post(
  '/:id/report',
  asyncHandler(async (req, res) => {
    if (!(await isReportsEnabled())) {
      return res.status(403).json({
        error: 'Les signalements sont désactivés.',
        code: 'REPORTS_DISABLED',
      });
    }
    const actor = getActor(req.glAuth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const reason = normalizeOptionalString(req.body?.reason);
    if (!reason || reason.length < MIN_REPORT_REASON_LEN || reason.length > MAX_REPORT_REASON_LEN) {
      return res.status(400).json({
        error: `Motif invalide (${MIN_REPORT_REASON_LEN}-${MAX_REPORT_REASON_LEN} caractères)`,
      });
    }
    const comment = await queryOne(
      'SELECT id, context_type, context_id FROM context_comments WHERE id = ? LIMIT 1',
      [req.params.id],
    );
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable' });
    const duplicate = await queryOne(
      `SELECT id FROM context_comment_reports
      WHERE comment_id = ? AND reporter_user_type = ? AND reporter_user_id = ? AND status = 'open' LIMIT 1`,
      [comment.id, actor.userType, actor.userId],
    );
    if (duplicate)
      return res.status(409).json({ error: 'Signalement déjà envoyé pour ce commentaire' });
    const created = await execute(
      `INSERT INTO context_comment_reports (comment_id, reporter_user_type, reporter_user_id, reason, status)
     VALUES (?, ?, ?, ?, 'open')`,
      [comment.id, actor.userType, actor.userId, reason],
    );
    emitContextCommentsChanged({
      reason: 'comment_reported',
      contextType: comment.context_type,
      contextId: comment.context_id,
      commentId: comment.id,
    });
    return res.status(201).json({ ok: true, report_id: created.insertId });
  }),
);

module.exports = router;
module.exports.glContextCommentsListQuerySchema = glContextCommentsListQuerySchema; // exporté pour test no-DB du contrat O7
