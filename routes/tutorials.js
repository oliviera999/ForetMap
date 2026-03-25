const express = require('express');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitTasksChanged } = require('../lib/realtime');

const router = express.Router();
const ROOT_DIR = path.resolve(__dirname, '..');

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeSortOrder(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function slugify(input) {
  return normalizeString(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'tuto';
}

async function uniqueSlug(baseSlug, excludeId = null) {
  let candidate = baseSlug || 'tuto';
  let i = 2;
  while (true) {
    const row = await queryOne('SELECT id FROM tutorials WHERE slug = ? LIMIT 1', [candidate]);
    if (!row || (excludeId != null && Number(row.id) === Number(excludeId))) return candidate;
    candidate = `${baseSlug}-${i}`;
    i += 1;
  }
}

function isAllowedSourceFilePath(value) {
  const v = normalizeString(value);
  if (!v) return false;
  if (!v.startsWith('/tutos/')) return false;
  if (v.includes('..')) return false;
  return true;
}

function resolveLocalTutorialFile(publicPath) {
  const normalized = normalizeString(publicPath);
  if (!isAllowedSourceFilePath(normalized)) return null;
  const rel = normalized.replace(/^\/+/, '');
  const absolute = path.resolve(ROOT_DIR, rel);
  const allowedRoot = path.resolve(ROOT_DIR, 'tutos');
  if (!absolute.startsWith(allowedRoot)) return null;
  return absolute;
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(html) {
  const raw = String(html || '');
  const noScript = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withBreaks = noScript
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|section|article|br)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const noTags = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(noTags);
  return decoded
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function htmlToPdfBuffer(title, html) {
  const text = htmlToPlainText(html);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      info: { Title: title || 'Tutoriel ForetMap' },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(title || 'Tutoriel ForetMap', { align: 'left' });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor('#5b6456').text('Export PDF généré automatiquement par ForetMap');
    doc.moveDown(1.2);
    doc.fillColor('#111111').fontSize(11).text(text || 'Contenu vide.', {
      lineGap: 3,
      paragraphGap: 8,
      align: 'left',
    });
    doc.end();
  });
}

async function loadTutorialHtml(tutorial) {
  if (tutorial.html_content && String(tutorial.html_content).trim()) {
    const content = String(tutorial.html_content);
    const hasHtmlTag = /<html[\s>]/i.test(content);
    if (hasHtmlTag) return content;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${tutorial.title}</title></head><body>${content}</body></html>`;
  }
  if (tutorial.source_file_path) {
    const abs = resolveLocalTutorialFile(tutorial.source_file_path);
    if (!abs || !fs.existsSync(abs)) return null;
    return fs.readFileSync(abs, 'utf8');
  }
  return null;
}

function toPublicTutorialRow(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    type: row.type,
    summary: row.summary || '',
    source_url: row.source_url || null,
    source_file_path: row.source_file_path || null,
    is_active: Number(row.is_active) === 1,
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    linked_tasks_count: Number(row.linked_tasks_count) || 0,
  };
}

router.get('/', async (req, res) => {
  try {
    const includeInactive = String(req.query.include_inactive || '') === '1';
    const where = includeInactive ? '' : 'WHERE t.is_active = 1';
    const rows = await queryAll(
      `SELECT t.*, COUNT(tt.task_id) AS linked_tasks_count
         FROM tutorials t
         LEFT JOIN task_tutorials tt ON tt.tutorial_id = t.id
         ${where}
         GROUP BY t.id
         ORDER BY t.sort_order ASC, t.title ASC`
    );
    res.json(rows.map(toPublicTutorialRow));
  } catch (err) {
    logRouteError(err, req, 'Liste tutoriels en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const includeContent = String(req.query.include_content || '') === '1';
    const row = await queryOne(
      `SELECT t.*, COUNT(tt.task_id) AS linked_tasks_count
         FROM tutorials t
         LEFT JOIN task_tutorials tt ON tt.tutorial_id = t.id
        WHERE t.id = ?
        GROUP BY t.id`,
      [req.params.id]
    );
    if (!row || Number(row.is_active) !== 1) return res.status(404).json({ error: 'Tutoriel introuvable' });
    const out = toPublicTutorialRow(row);
    if (includeContent) out.html_content = row.html_content || null;
    res.json(out);
  } catch (err) {
    logRouteError(err, req, 'Détail tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requirePermission('tutorials.manage', { needsElevation: true }), async (req, res) => {
  try {
    const title = normalizeString(req.body.title);
    const type = normalizeString(req.body.type || 'html').toLowerCase();
    const summary = normalizeString(req.body.summary);
    const htmlContent = req.body.html_content != null ? String(req.body.html_content) : null;
    const sourceUrl = normalizeString(req.body.source_url) || null;
    const sourceFilePath = normalizeString(req.body.source_file_path) || null;
    const sortOrder = sanitizeSortOrder(req.body.sort_order);

    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (!['html', 'link', 'pdf'].includes(type)) return res.status(400).json({ error: 'Type invalide' });

    if (type === 'link' && !isValidHttpUrl(sourceUrl)) {
      return res.status(400).json({ error: 'URL du tutoriel invalide' });
    }
    if (type === 'html') {
      const hasHtml = !!(htmlContent && htmlContent.trim());
      const hasFile = !!sourceFilePath;
      if (!hasHtml && !hasFile) {
        return res.status(400).json({ error: 'Un contenu HTML ou un fichier source est requis' });
      }
    }
    if (sourceFilePath && !isAllowedSourceFilePath(sourceFilePath)) {
      return res.status(400).json({ error: 'Chemin de fichier source non autorisé' });
    }

    const baseSlug = slugify(req.body.slug || title);
    const slug = await uniqueSlug(baseSlug);
    const now = new Date().toISOString();
    const result = await execute(
      `INSERT INTO tutorials
        (title, slug, type, summary, html_content, source_url, source_file_path, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [title, slug, type, summary || null, htmlContent, sourceUrl, sourceFilePath, sortOrder, now, now]
    );
    const created = await queryOne('SELECT * FROM tutorials WHERE id = ?', [result.insertId]);
    emitTasksChanged({ reason: 'tutorial_create', tutorialId: result.insertId });
    res.status(201).json(toPublicTutorialRow({ ...created, linked_tasks_count: 0 }));
  } catch (err) {
    logRouteError(err, req, 'Création tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', requirePermission('tutorials.manage', { needsElevation: true }), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM tutorials WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Tutoriel introuvable' });

    const nextTitle = req.body.title != null ? normalizeString(req.body.title) : existing.title;
    const nextType = req.body.type != null ? normalizeString(req.body.type).toLowerCase() : existing.type;
    const nextSummary = req.body.summary != null ? normalizeString(req.body.summary) : (existing.summary || '');
    const nextHtml = req.body.html_content !== undefined ? (req.body.html_content != null ? String(req.body.html_content) : null) : existing.html_content;
    const nextSourceUrl = req.body.source_url !== undefined ? (normalizeString(req.body.source_url) || null) : existing.source_url;
    const nextSourceFilePath = req.body.source_file_path !== undefined ? (normalizeString(req.body.source_file_path) || null) : existing.source_file_path;
    const nextSortOrder = req.body.sort_order !== undefined ? sanitizeSortOrder(req.body.sort_order) : existing.sort_order;
    const nextIsActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;

    if (!nextTitle) return res.status(400).json({ error: 'Titre requis' });
    if (!['html', 'link', 'pdf'].includes(nextType)) return res.status(400).json({ error: 'Type invalide' });
    if (nextType === 'link' && !isValidHttpUrl(nextSourceUrl)) {
      return res.status(400).json({ error: 'URL du tutoriel invalide' });
    }
    if (nextType === 'html' && !(nextHtml && String(nextHtml).trim()) && !nextSourceFilePath) {
      return res.status(400).json({ error: 'Un contenu HTML ou un fichier source est requis' });
    }
    if (nextSourceFilePath && !isAllowedSourceFilePath(nextSourceFilePath)) {
      return res.status(400).json({ error: 'Chemin de fichier source non autorisé' });
    }

    let nextSlug = existing.slug;
    if (req.body.slug !== undefined || req.body.title !== undefined) {
      nextSlug = await uniqueSlug(slugify(req.body.slug || nextTitle), existing.id);
    }
    const now = new Date().toISOString();
    await execute(
      `UPDATE tutorials
          SET title = ?, slug = ?, type = ?, summary = ?, html_content = ?, source_url = ?, source_file_path = ?,
              is_active = ?, sort_order = ?, updated_at = ?
        WHERE id = ?`,
      [
        nextTitle,
        nextSlug,
        nextType,
        nextSummary || null,
        nextHtml,
        nextSourceUrl,
        nextSourceFilePath,
        nextIsActive,
        nextSortOrder,
        now,
        req.params.id,
      ]
    );
    const updated = await queryOne('SELECT * FROM tutorials WHERE id = ?', [req.params.id]);
    const linked = await queryOne('SELECT COUNT(*) AS c FROM task_tutorials WHERE tutorial_id = ?', [req.params.id]);
    emitTasksChanged({ reason: 'tutorial_update', tutorialId: Number(req.params.id) });
    res.json(toPublicTutorialRow({ ...updated, linked_tasks_count: linked?.c || 0 }));
  } catch (err) {
    logRouteError(err, req, 'Mise à jour tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', requirePermission('tutorials.manage', { needsElevation: true }), async (req, res) => {
  try {
    const existing = await queryOne('SELECT id FROM tutorials WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Tutoriel introuvable' });
    await execute('UPDATE tutorials SET is_active = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), req.params.id]);
    emitTasksChanged({ reason: 'tutorial_delete', tutorialId: Number(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    logRouteError(err, req, 'Suppression tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/download/html', async (req, res) => {
  try {
    const tutorial = await queryOne('SELECT * FROM tutorials WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });
    const html = await loadTutorialHtml(tutorial);
    if (!html) return res.status(400).json({ error: 'Ce tutoriel ne possède pas de contenu HTML téléchargeable' });
    const filename = `${tutorial.slug || 'tutoriel'}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (err) {
    logRouteError(err, req, 'Téléchargement HTML tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/view', async (req, res) => {
  try {
    const tutorial = await queryOne('SELECT * FROM tutorials WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!tutorial) return res.status(404).send('Tutoriel introuvable');
    const html = await loadTutorialHtml(tutorial);
    if (!html) return res.status(400).send('Aucun contenu HTML');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    logRouteError(err, req, 'Prévisualisation tutoriel en échec');
    res.status(500).send('Erreur serveur');
  }
});

router.get('/:id/download/pdf', async (req, res) => {
  try {
    const tutorial = await queryOne('SELECT * FROM tutorials WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!tutorial) return res.status(404).json({ error: 'Tutoriel introuvable' });
    const html = await loadTutorialHtml(tutorial);
    if (!html) return res.status(400).json({ error: 'Génération PDF disponible uniquement pour les tutoriels HTML' });
    const pdfBuffer = await htmlToPdfBuffer(tutorial.title, html);
    const filename = `${tutorial.slug || 'tutoriel'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    logRouteError(err, req, 'Téléchargement PDF tutoriel en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
