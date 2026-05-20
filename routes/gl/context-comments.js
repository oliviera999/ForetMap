'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlAuth } = require('../../middleware/requireGlAuth');

const router = express.Router();

const ALLOWED_CONTEXT_TYPES = new Set([
  'gl_chapter',
  'gl_scene',
  'gl_game',
  'gl_mascot_pack',
]);

const MIN_BODY = 2;
const MAX_BODY = 4000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeContextType(value) {
  const t = String(value || '').trim().toLowerCase();
  return ALLOWED_CONTEXT_TYPES.has(t) ? t : '';
}

async function contextExists(contextType, contextId) {
  if (contextType === 'gl_chapter') {
    const row = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [contextId]);
    return !!row;
  }
  if (contextType === 'gl_scene') {
    const row = await queryOne('SELECT id FROM gl_chapter_markers WHERE id = ? LIMIT 1', [contextId]);
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

function canModerate(auth) {
  return String(auth?.userType || '').toLowerCase() === 'gl_admin';
}

router.use(requireGlAuth);

router.get('/', async (req, res) => {
  const contextType = normalizeContextType(req.query?.contextType);
  const contextId = normalizeOptionalString(req.query?.contextId);
  if (!contextType) return res.status(400).json({ error: 'contextType invalide' });
  if (!contextId) return res.status(400).json({ error: 'contextId requis' });
  if (!(await contextExists(contextType, contextId))) {
    return res.status(404).json({ error: 'Contexte introuvable' });
  }

  const page = Math.max(1, Number(req.query?.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query?.page_size) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const totalRow = await queryOne(
    'SELECT COUNT(*) AS c FROM context_comments WHERE context_type = ? AND context_id = ?',
    [contextType, contextId]
  );
  const total = Number(totalRow?.c || 0);
  const rows = await queryAll(
    `SELECT id, context_type, context_id, body, author_user_type, author_user_id, is_deleted, created_at, updated_at
       FROM context_comments
      WHERE context_type = ? AND context_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ${pageSize} OFFSET ${offset}`,
    [contextType, contextId]
  );
  const items = rows.map((row) => ({
    ...row,
    body: Number(row.is_deleted) ? '' : row.body,
  }));
  return res.json({ items, page, page_size: pageSize, total });
});

router.post('/', async (req, res) => {
  const contextType = normalizeContextType(req.body?.contextType);
  const contextId = normalizeOptionalString(req.body?.contextId);
  const body = normalizeOptionalString(req.body?.body);
  if (!contextType) return res.status(400).json({ error: 'contextType invalide' });
  if (!contextId) return res.status(400).json({ error: 'contextId requis' });
  if (!body || body.length < MIN_BODY || body.length > MAX_BODY) {
    return res.status(400).json({ error: `Message invalide (${MIN_BODY}-${MAX_BODY} caractères)` });
  }
  if (!(await contextExists(contextType, contextId))) {
    return res.status(404).json({ error: 'Contexte introuvable' });
  }
  const id = uuidv4();
  const authorUserType = String(req.glAuth.userType || 'gl_player');
  const authorUserId = String(req.glAuth.userId || '');
  await execute(
    `INSERT INTO context_comments (id, context_type, context_id, body, image_paths_json, author_user_type, author_user_id, is_deleted)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 0)`,
    [id, contextType, contextId, body, authorUserType, authorUserId]
  );
  const created = await queryOne('SELECT * FROM context_comments WHERE id = ? LIMIT 1', [id]);
  return res.status(201).json(created);
});

router.delete('/:id', async (req, res) => {
  const comment = await queryOne(
    'SELECT id, author_user_type, author_user_id, is_deleted FROM context_comments WHERE id = ? LIMIT 1',
    [req.params.id]
  );
  if (!comment) return res.status(404).json({ error: 'Commentaire introuvable' });
  if (Number(comment.is_deleted)) return res.json({ ok: true, already_deleted: true });
  const owns = comment.author_user_type === req.glAuth.userType
    && String(comment.author_user_id) === String(req.glAuth.userId);
  if (!owns && !canModerate(req.glAuth)) {
    return res.status(403).json({ error: 'Permission insuffisante' });
  }
  await execute(
    'UPDATE context_comments SET is_deleted = 1, body = ?, image_paths_json = NULL, updated_at = NOW() WHERE id = ?',
    ['[commentaire supprimé]', comment.id]
  );
  return res.json({ ok: true });
});

module.exports = router;
