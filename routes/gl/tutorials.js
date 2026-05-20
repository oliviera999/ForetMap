'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');

const router = express.Router();

const MIN_TITLE = 3;
const MAX_TITLE = 200;
const MIN_BODY = 1;
const MAX_BODY = 50000;

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeSlug(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

router.get('/', requireGlAuth, async (req, res) => {
  const chapterId = req.query?.chapterId != null ? Number(req.query.chapterId) : null;
  const rows = Number.isFinite(chapterId)
    ? await queryAll(
      `SELECT id, slug, title, chapter_id, marker_id, order_index, is_published, updated_at
         FROM gl_tutorials
        WHERE chapter_id = ?
        ORDER BY order_index ASC, id ASC`,
      [chapterId]
    )
    : await queryAll(
      `SELECT id, slug, title, chapter_id, marker_id, order_index, is_published, updated_at
         FROM gl_tutorials
        ORDER BY order_index ASC, id ASC`
    );
  return res.json({ tutorials: rows });
});

router.get('/me/read-ids', requireGlAuth, async (req, res) => {
  const rows = await queryAll(
    `SELECT tutorial_id FROM gl_tutorial_reads
      WHERE reader_user_type = ? AND reader_user_id = ?`,
    [String(req.glAuth.userType || ''), String(req.glAuth.userId || '')]
  );
  return res.json({ ids: rows.map((r) => Number(r.tutorial_id)) });
});

router.get('/:idOrSlug', requireGlAuth, async (req, res) => {
  const idOrSlug = String(req.params.idOrSlug || '');
  const numeric = Number(idOrSlug);
  const row = Number.isFinite(numeric)
    ? await queryOne('SELECT * FROM gl_tutorials WHERE id = ? LIMIT 1', [numeric])
    : await queryOne('SELECT * FROM gl_tutorials WHERE slug = ? LIMIT 1', [idOrSlug]);
  if (!row) return res.status(404).json({ error: 'Tutoriel introuvable' });
  return res.json(row);
});

router.post('/:id/read', requireGlAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const tutorial = await queryOne('SELECT id FROM gl_tutorials WHERE id = ? LIMIT 1', [id]);
  if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });
  await execute(
    `INSERT INTO gl_tutorial_reads (tutorial_id, reader_user_type, reader_user_id, read_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE read_at = NOW()`,
    [id, String(req.glAuth.userType || ''), String(req.glAuth.userId || '')]
  );
  return res.json({ ok: true });
});

router.post('/', requireGlPermission('gl.content.manage'), async (req, res) => {
  const slug = normalizeSlug(req.body?.slug);
  const title = normalizeOptionalString(req.body?.title);
  const bodyMarkdown = normalizeOptionalString(req.body?.bodyMarkdown);
  const chapterId = req.body?.chapterId == null ? null : Number(req.body.chapterId);
  const markerId = req.body?.markerId == null ? null : Number(req.body.markerId);
  const orderIndex = Number(req.body?.orderIndex) || 0;
  const isPublished = req.body?.isPublished == null ? 1 : (req.body.isPublished ? 1 : 0);
  if (!slug) return res.status(400).json({ error: 'Slug invalide' });
  if (!title || title.length < MIN_TITLE || title.length > MAX_TITLE) {
    return res.status(400).json({ error: `Titre invalide (${MIN_TITLE}-${MAX_TITLE} caractères)` });
  }
  if (!bodyMarkdown || bodyMarkdown.length < MIN_BODY || bodyMarkdown.length > MAX_BODY) {
    return res.status(400).json({ error: 'Contenu markdown invalide' });
  }
  const existing = await queryOne('SELECT id FROM gl_tutorials WHERE slug = ? LIMIT 1', [slug]);
  if (existing) return res.status(409).json({ error: 'Slug déjà utilisé' });
  const result = await execute(
    `INSERT INTO gl_tutorials
      (slug, title, body_markdown, chapter_id, marker_id, order_index, is_published, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [slug, title, bodyMarkdown, chapterId, markerId, orderIndex, isPublished]
  );
  const created = await queryOne('SELECT * FROM gl_tutorials WHERE id = ? LIMIT 1', [result.insertId]);
  return res.status(201).json(created);
});

router.put('/:id', requireGlPermission('gl.content.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const existing = await queryOne('SELECT id FROM gl_tutorials WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Tutoriel introuvable' });
  const title = normalizeOptionalString(req.body?.title);
  const bodyMarkdown = req.body?.bodyMarkdown == null ? null : normalizeOptionalString(req.body.bodyMarkdown);
  const chapterId = req.body?.chapterId == null ? null : Number(req.body.chapterId);
  const markerId = req.body?.markerId == null ? null : Number(req.body.markerId);
  const orderIndex = req.body?.orderIndex == null ? null : Number(req.body.orderIndex);
  const isPublished = req.body?.isPublished == null ? null : (req.body.isPublished ? 1 : 0);
  await execute(
    `UPDATE gl_tutorials
        SET title = COALESCE(?, title),
            body_markdown = COALESCE(?, body_markdown),
            chapter_id = COALESCE(?, chapter_id),
            marker_id = COALESCE(?, marker_id),
            order_index = COALESCE(?, order_index),
            is_published = COALESCE(?, is_published),
            updated_at = NOW()
      WHERE id = ?`,
    [title, bodyMarkdown, chapterId, markerId, orderIndex, isPublished, id]
  );
  const updated = await queryOne('SELECT * FROM gl_tutorials WHERE id = ? LIMIT 1', [id]);
  return res.json(updated);
});

router.delete('/:id', requireGlPermission('gl.content.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  await execute('DELETE FROM gl_tutorials WHERE id = ?', [id]);
  return res.json({ ok: true });
});

module.exports = router;
