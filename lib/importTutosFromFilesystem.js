'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isAllowedSourceFilePath } = require('./inlineLegacyTutorialHtml');
const { slugify } = require('./tutorialRouteHelpers');

const DEFAULT_TUTOS_DIR = path.resolve(__dirname, '..', 'tutos');
const TITLE_SUFFIX_RE = /\s*[–—-]\s*forêtmap.*$/i;

function normalizeTutorialHtmlFingerprint(html) {
  return String(html || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function tutorialHtmlFingerprint(html) {
  return crypto.createHash('sha256').update(normalizeTutorialHtmlFingerprint(html)).digest('hex');
}

function extractTitleFromTutorialHtml(html) {
  const raw = String(html || '');
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  if (!m) return '';
  const decoded = String(m[1])
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return decoded.replace(TITLE_SUFFIX_RE, '').trim();
}

function titleFromFilename(filename) {
  const base = stemFromTutorialFilename(filename).replace(/-/g, ' ').trim();
  if (!base) return 'Tutoriel';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function listTutorialHtmlFilesOnDisk(tutosDir = DEFAULT_TUTOS_DIR) {
  if (!fs.existsSync(tutosDir)) return [];
  return fs
    .readdirSync(tutosDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'fr'));
}

function stemFromTutorialFilename(filename) {
  return String(filename || '')
    .replace(/\.html?$/i, '')
    .replace(/^fiche-/i, '')
    .replace(/-punk(-n3)?$/i, '')
    .toLowerCase();
}

function slugMatchesFilenameStem(slug, stem) {
  const s = String(slug || '').toLowerCase();
  const t = String(stem || '').toLowerCase();
  if (!s || !t) return false;
  if (s === t || s.includes(t) || t.includes(s)) return true;
  const compactSlug = s.replace(/-/g, '');
  const compactStem = t.replace(/-/g, '');
  return compactSlug.includes(compactStem) || compactStem.includes(compactSlug);
}

function normalizeTitleKey(title) {
  return slugify(
    String(title || '')
      .replace(/^(l'|le |la |les )/i, '')
      .trim(),
  );
}

async function loadExistingTutorialIndex(db) {
  const { queryAll } = db;
  let rows = [];
  try {
    rows = await queryAll(
      'SELECT id, slug, title, source_file_path, html_content FROM tutorials ORDER BY id ASC',
    );
  } catch {
    return { bySourcePath: new Map(), byFingerprint: new Map(), bySlug: new Map(), rows: [] };
  }
  const bySourcePath = new Map();
  const byFingerprint = new Map();
  const bySlug = new Map();
  const byTitleKey = new Map();
  for (const row of rows) {
    const id = Number(row.id);
    const sourcePath = String(row.source_file_path || '').trim();
    if (sourcePath) bySourcePath.set(sourcePath, id);
    const slug = String(row.slug || '').trim();
    if (slug) bySlug.set(slug, id);
    const titleKey = normalizeTitleKey(row.title);
    if (titleKey) byTitleKey.set(titleKey, id);
    const html = String(row.html_content || '');
    if (html.trim()) {
      byFingerprint.set(tutorialHtmlFingerprint(html), id);
    }
  }
  return { bySourcePath, byFingerprint, bySlug, byTitleKey, rows };
}

function resolveExistingTutorialId(index, { sourcePath, fingerprint, slug, filename, title }) {
  if (index.bySourcePath.has(sourcePath)) {
    return { id: index.bySourcePath.get(sourcePath), reason: 'source_file_path' };
  }
  if (index.byFingerprint.has(fingerprint)) {
    return { id: index.byFingerprint.get(fingerprint), reason: 'content' };
  }
  if (index.bySlug.has(slug)) {
    return { id: index.bySlug.get(slug), reason: 'slug' };
  }
  const titleKey = normalizeTitleKey(title);
  if (titleKey && index.byTitleKey.has(titleKey)) {
    return { id: index.byTitleKey.get(titleKey), reason: 'title' };
  }
  const stem = stemFromTutorialFilename(filename);
  if (stem && Array.isArray(index.rows)) {
    for (const row of index.rows) {
      if (slugMatchesFilenameStem(row.slug, stem)) {
        return { id: Number(row.id), reason: 'filename_stem' };
      }
    }
  }
  return null;
}

function toPublicSourcePath(filename) {
  return `/tutos/${filename}`;
}

async function uniqueTutorialSlug(db, baseSlug) {
  const { queryOne } = db;
  let candidate = baseSlug || 'tuto';
  let i = 2;
  while (true) {
    const row = await queryOne('SELECT id FROM tutorials WHERE slug = ? LIMIT 1', [candidate]);
    if (!row) return candidate;
    candidate = `${baseSlug}-${i}`;
    i += 1;
  }
}

async function scanTutosForImport(db, options = {}) {
  const tutosDir = options.tutosDir || DEFAULT_TUTOS_DIR;
  const index = await loadExistingTutorialIndex(db);
  const filenames = listTutorialHtmlFilesOnDisk(tutosDir);
  const items = [];
  let alreadyImported = 0;
  let pending = 0;
  let errors = 0;

  for (const filename of filenames) {
    const sourcePath = toPublicSourcePath(filename);
    if (!isAllowedSourceFilePath(sourcePath)) {
      errors += 1;
      items.push({
        filename,
        source_file_path: sourcePath,
        status: 'error',
        error: 'Chemin de fichier non autorisé',
      });
      continue;
    }
    const abs = path.join(tutosDir, filename);
    let html;
    try {
      html = fs.readFileSync(abs, 'utf8');
    } catch (err) {
      errors += 1;
      items.push({
        filename,
        source_file_path: sourcePath,
        status: 'error',
        error: err.message || 'Lecture impossible',
      });
      continue;
    }
    const titleFromHtml = extractTitleFromTutorialHtml(html);
    const title = titleFromHtml || titleFromFilename(filename);
    const slug = slugify(title);
    const fingerprint = tutorialHtmlFingerprint(html);
    const existing = resolveExistingTutorialId(index, {
      sourcePath,
      fingerprint,
      slug,
      filename,
      title,
    });
    if (existing) {
      alreadyImported += 1;
      items.push({
        filename,
        source_file_path: sourcePath,
        title,
        slug,
        status: 'already_imported',
        existing_tutorial_id: existing.id,
        match_reason: existing.reason,
      });
      continue;
    }
    pending += 1;
    items.push({
      filename,
      source_file_path: sourcePath,
      title,
      slug,
      status: 'pending',
    });
  }

  return {
    totals: {
      on_disk: filenames.length,
      already_imported: alreadyImported,
      pending,
      errors,
    },
    items,
  };
}

async function importMissingTutosFromFilesystem(db, options = {}) {
  const dryRun = !!options.dryRun;
  const tutosDir = options.tutosDir || DEFAULT_TUTOS_DIR;
  const scan = await scanTutosForImport(db, { tutosDir });
  const { queryOne, execute } = db;
  const pendingItems = scan.items.filter((item) => item.status === 'pending');
  const report = {
    dryRun,
    totals: {
      ...scan.totals,
      imported: 0,
      import_errors: 0,
    },
    items: [...scan.items],
  };

  if (dryRun || pendingItems.length === 0) {
    return report;
  }

  const maxRow = await queryOne('SELECT MAX(sort_order) AS max_sort FROM tutorials');
  let nextSort = Number(maxRow?.max_sort);
  if (!Number.isFinite(nextSort) || nextSort < 0) nextSort = 0;

  for (const item of pendingItems) {
    const abs = path.join(tutosDir, item.filename);
    let html;
    try {
      html = fs.readFileSync(abs, 'utf8');
    } catch (err) {
      report.totals.import_errors += 1;
      const idx = report.items.findIndex((x) => x.filename === item.filename);
      if (idx >= 0) {
        report.items[idx] = {
          ...report.items[idx],
          status: 'error',
          error: err.message || 'Lecture impossible',
        };
      }
      continue;
    }
    const title = extractTitleFromTutorialHtml(html) || titleFromFilename(item.filename);
    const slug = await uniqueTutorialSlug(db, slugify(title));
    nextSort += 1;
    const now = new Date().toISOString();
    try {
      const result = await execute(
        `INSERT INTO tutorials
          (title, slug, type, summary, cover_image_url, html_content, source_url, source_file_path, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, 'html', ?, NULL, ?, NULL, NULL, 1, ?, ?, ?)`,
        [title, slug, `Importé depuis ${item.source_file_path}`, html, nextSort, now, now],
      );
      report.totals.imported += 1;
      const idx = report.items.findIndex((x) => x.filename === item.filename);
      if (idx >= 0) {
        report.items[idx] = {
          ...report.items[idx],
          status: 'imported',
          title,
          slug,
          tutorial_id: result.insertId,
        };
      }
    } catch (err) {
      report.totals.import_errors += 1;
      const idx = report.items.findIndex((x) => x.filename === item.filename);
      if (idx >= 0) {
        report.items[idx] = {
          ...report.items[idx],
          status: 'error',
          error: err.message || 'Insertion impossible',
        };
      }
    }
  }

  return report;
}

module.exports = {
  DEFAULT_TUTOS_DIR,
  extractTitleFromTutorialHtml,
  titleFromFilename,
  stemFromTutorialFilename,
  slugMatchesFilenameStem,
  tutorialHtmlFingerprint,
  listTutorialHtmlFilesOnDisk,
  scanTutosForImport,
  importMissingTutosFromFilesystem,
};
