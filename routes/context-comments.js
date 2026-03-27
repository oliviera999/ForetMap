const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { emitContextCommentsChanged } = require('../lib/realtime');

const router = express.Router();

const ALLOWED_CONTEXT_TYPES = new Set(['task', 'project', 'zone']);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MIN_COMMENT_LEN = 2;
const MAX_COMMENT_LEN = 4000;
const MIN_REPORT_REASON_LEN = 3;
const MAX_REPORT_REASON_LEN = 500;
const COMMENT_COOLDOWN_MS = 3_000;

const cooldownState = new Map();

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeContextType(value) {
  const type = String(value || '').trim().toLowerCase();
  return ALLOWED_CONTEXT_TYPES.has(type) ? type : '';
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

function canModerateComments(auth) {
  const roleSlug = String(auth?.roleSlug || '').trim().toLowerCase();
  if (roleSlug === 'admin' || roleSlug === 'prof') return true;
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return perms.includes('teacher.access');
}

function checkCooldown(actor, action, cooldownMs) {
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
  return false;
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const contextType = normalizeContextType(req.query?.contextType);
    const contextId = normalizeOptionalString(req.query?.contextId);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (task|project|zone)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!(await contextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    const { page, pageSize, offset } = parsePage(req);
    const totalRow = await queryOne(
      'SELECT COUNT(*) AS c FROM context_comments WHERE context_type = ? AND context_id = ?',
      [contextType, contextId]
    );
    const total = Number(totalRow?.c || 0);
    const rows = await queryAll(
      `SELECT c.id, c.context_type, c.context_id, c.body, c.author_user_type, c.author_user_id, c.is_deleted, c.created_at, c.updated_at,
              COALESCE(
                NULLIF(u.display_name, ''),
                NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''),
                NULLIF(u.pseudo, ''),
                NULLIF(u.email, ''),
                c.author_user_id
              ) AS author_display_name
         FROM context_comments c
    LEFT JOIN users u ON u.id = c.author_user_id AND u.user_type = c.author_user_type
        WHERE c.context_type = ?
          AND c.context_id = ?
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ? OFFSET ?`,
      [contextType, contextId, pageSize, offset]
    );
    const items = rows.map((row) => ({
      ...row,
      body: Number(row.is_deleted) ? '' : row.body,
    }));
    return res.json({ items, page, page_size: pageSize, total });
  } catch (e) {
    logRouteError(e, req);
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const contextType = normalizeContextType(req.body?.contextType);
    const contextId = normalizeOptionalString(req.body?.contextId);
    const body = normalizeOptionalString(req.body?.body);
    if (!contextType) return res.status(400).json({ error: 'contextType invalide (task|project|zone)' });
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (!body || body.length < MIN_COMMENT_LEN || body.length > MAX_COMMENT_LEN) {
      return res.status(400).json({ error: `Message invalide (${MIN_COMMENT_LEN}-${MAX_COMMENT_LEN} caractères)` });
    }
    if (!(await contextExists(contextType, contextId))) {
      return res.status(404).json({ error: 'Contexte introuvable' });
    }
    if (!checkCooldown(actor, 'context_comment', COMMENT_COOLDOWN_MS)) {
      return res.status(429).json({ error: 'Action trop rapide, réessaie dans quelques secondes' });
    }
    const commentId = uuidv4();
    await execute(
      `INSERT INTO context_comments
        (id, context_type, context_id, body, author_user_type, author_user_id, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [commentId, contextType, contextId, body, actor.userType, actor.userId]
    );
    const created = await queryOne(
      `SELECT c.id, c.context_type, c.context_id, c.body, c.author_user_type, c.author_user_id, c.is_deleted, c.created_at, c.updated_at,
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
    await logAudit('context_comment_create', 'context_comment', commentId, `Commentaire ${contextType}:${contextId}`, {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { context_type: contextType, context_id: contextId },
    });
    emitContextCommentsChanged({ reason: 'comment_created', contextType, contextId, commentId });
    return res.status(201).json(created);
  } catch (e) {
    logRouteError(e, req);
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const actor = getActor(req.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });
    const comment = await queryOne(
      `SELECT id, context_type, context_id, author_user_type, author_user_id, is_deleted
         FROM context_comments
        WHERE id = ?
        LIMIT 1`,
      [req.params.id]
    );
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable' });
    if (Number(comment.is_deleted)) return res.json({ ok: true, already_deleted: true });

    const ownsComment = comment.author_user_type === actor.userType && comment.author_user_id === actor.userId;
    const moderator = canModerateComments(req.auth);
    if (!ownsComment && !moderator) return res.status(403).json({ error: 'Permission insuffisante' });

    await execute(
      'UPDATE context_comments SET is_deleted = 1, body = ?, updated_at = NOW() WHERE id = ?',
      ['[commentaire supprimé]', comment.id]
    );
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
  } catch (e) {
    logRouteError(e, req);
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:id/report', async (req, res) => {
  try {
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
  } catch (e) {
    logRouteError(e, req);
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
