const express = require('express');
const { queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { getGlModulesSettings } = require('../../lib/glSettings');
const {
  buildPublicIntroPayload,
  getIntroConfigFromDb,
} = require('../../lib/glIntro');
const { logRouteError } = require('../../lib/routeLog');

const router = express.Router();

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');

/** GET /api/gl/content/intro — config publique (textes + URLs média résolues). */
router.get('/intro', async (req, res) => {
  try {
    const modules = await getGlModulesSettings();
    if (modules.introEnabled !== true) {
      return res.json({ enabled: false });
    }
    const config = await getIntroConfigFromDb();
    if (config.enabled === false) {
      return res.json({ enabled: false });
    }
    return res.json(buildPublicIntroPayload(config));
  } catch (err) {
    logRouteError(err, req, 'GET /api/gl/content/intro');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:slug', requireGlPermission('gl.read'), async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Slug invalide' });
  const row = await queryOne(
    `SELECT slug, title, body_markdown, updated_at
       FROM gl_content_pages
      WHERE slug = ?
      LIMIT 1`,
    [slug]
  );
  if (!row) return res.status(404).json({ error: 'Contenu introuvable' });
  return res.json({
    slug: row.slug,
    title: row.title,
    bodyMarkdown: row.body_markdown || '',
    updatedAt: row.updated_at || null,
  });
});

router.put('/:slug', requireGlPermission('gl.content.manage'), async (req, res) => {
  const slug = normalizeSlug(req.params.slug);
  if (!slug) return res.status(400).json({ error: 'Slug invalide' });
  const title = normalizeOptionalString(req.body?.title);
  const bodyMarkdown = String(req.body?.bodyMarkdown || '');
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  await execute(
    `INSERT INTO gl_content_pages (slug, title, body_markdown, updated_by, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       body_markdown = VALUES(body_markdown),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [slug, title, bodyMarkdown, req.glAuth.userId]
  );
  const row = await queryOne(
    'SELECT slug, title, body_markdown, updated_at FROM gl_content_pages WHERE slug = ? LIMIT 1',
    [slug]
  );
  return res.json({
    slug: row.slug,
    title: row.title,
    bodyMarkdown: row.body_markdown || '',
    updatedAt: row.updated_at || null,
  });
});

module.exports = router;
