const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const {
  resolveImportRows,
  applySpellsImport,
  upsertSpellRow,
  allocateNextSpellCode,
  MAX_IMPORT_ROWS,
  buildSpellsTemplateWorkbook,
  buildSpellsExportWorkbook,
  loadSpellsExportRows,
} = require('../../lib/glSpellsImport');
const { normalizeSpellCodeList, parseSpellCodesFromQuery } = require('../../lib/glChapterSpells');

const router = express.Router();

function normalizeCategorySlug(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s.length > 0 ? s : null;
}

function normalizeOptionalFilter(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function handleSpellCrudError(res, err) {
  const status = err.statusCode || 400;
  return res.status(status).json({
    error: err.message || 'Opération impossible',
    details: Array.isArray(err.details) ? err.details : undefined,
  });
}

const SPELL_LIST_COLUMNS = `
  spell_code, category_slug, nom, emoji, cout_gemmes, cout_coeurs, cout_total_eq,
  portee, cible, timing, effet_court, effet_detaille, limite_usage, cumul,
  statut, source, notes_pedagogiques, cree_le
`;

async function loadAdminSpellDetail(code) {
  const row = await queryOne(
    `SELECT id, ${SPELL_LIST_COLUMNS}
       FROM gl_spells
      WHERE spell_code = ?
      LIMIT 1`,
    [code]
  );
  return row || null;
}

function filterSpellAdminList(rows, { statut, q }) {
  let items = rows;
  if (statut) items = items.filter((row) => row.statut === statut);
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((row) => {
      const hay = `${row.nom} ${row.spell_code} ${row.effet_court || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  return items;
}

/** GET /api/gl/spell-categories — liste des catégories avec effectifs. */
router.get('/spell-categories', requireGlPermission('gl.read'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT c.slug, c.nom, c.order_index,
            COUNT(s.id) AS spell_count,
            SUM(CASE WHEN s.statut = 'officiel' THEN 1 ELSE 0 END) AS officiel_count,
            SUM(CASE WHEN s.statut = 'propose' THEN 1 ELSE 0 END) AS propose_count
       FROM gl_spell_categories c
  LEFT JOIN gl_spells s ON s.category_slug = c.slug
      GROUP BY c.slug, c.nom, c.order_index
      ORDER BY c.order_index ASC, c.slug ASC`
  );
  return res.json(rows);
});

/** GET /api/gl/spells?spellCodes=SL001,SL002 — sorts filtrés par codes chapitre. */
router.get('/spells', requireGlPermission('gl.read'), async (req, res) => {
  const spellCodes = parseSpellCodesFromQuery(req.query);
  if (spellCodes.length === 0) {
    return res.status(400).json({ error: 'spellCodes requis (liste de codes séparés par des virgules)' });
  }
  const normalized = normalizeSpellCodeList(spellCodes);
  const placeholders = normalized.map(() => '?').join(', ');
  const items = await queryAll(
    `SELECT id, ${SPELL_LIST_COLUMNS}
       FROM gl_spells
      WHERE spell_code IN (${placeholders})
      ORDER BY category_slug ASC, nom ASC`,
    normalized
  );
  return res.json({ items, total: items.length });
});

/** GET /api/gl/spells/:code — détail sort (popover). */
router.get('/spells/:code', requireGlPermission('gl.read'), async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  const spell = await loadAdminSpellDetail(code);
  if (!spell) return res.status(404).json({ error: 'Sort introuvable' });
  const category = await queryOne(
    'SELECT slug, nom FROM gl_spell_categories WHERE slug = ? LIMIT 1',
    [spell.category_slug]
  );
  return res.json({ spell, category: category || null });
});

const ADMIN_SPELL_LIST_LIMIT = 500;

/** GET /api/gl/admin/spells/next-code */
router.get('/admin/spells/next-code', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const spell_code = await allocateNextSpellCode(queryAll);
  return res.json({ spell_code });
});

/** GET /api/gl/admin/spells — liste admin par catégorie. */
router.get('/admin/spells', requireGlPermission('gl.content.manage'), async (req, res) => {
  const categorySlug = normalizeCategorySlug(req.query?.categorySlug);
  if (!categorySlug) return res.status(400).json({ error: 'categorySlug requis' });
  const category = await queryOne(
    'SELECT slug, nom FROM gl_spell_categories WHERE slug = ? LIMIT 1',
    [categorySlug]
  );
  if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });

  const statut = normalizeOptionalFilter(req.query?.statut);
  const q = normalizeOptionalFilter(req.query?.q);
  const statutRaw = String(req.query?.statutFilter || 'all').toLowerCase();
  const statutClause = statutRaw === 'all' ? '' : " AND statut = 'officiel' ";

  const rows = await queryAll(
    `SELECT spell_code, category_slug, nom, emoji, cout_gemmes, cout_coeurs, cout_total_eq, statut
       FROM gl_spells
      WHERE category_slug = ?${statutClause}
      ORDER BY nom ASC
      LIMIT ${ADMIN_SPELL_LIST_LIMIT}`,
    [categorySlug]
  );

  const items = filterSpellAdminList(rows, { statut, q });
  return res.json({ category, items, total: items.length });
});

/** GET /api/gl/admin/spells/all — liste complète (sélection chapitre). */
router.get('/admin/spells/all', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT s.spell_code, s.nom, s.emoji, s.category_slug, c.nom AS category_nom, s.statut
       FROM gl_spells s
  INNER JOIN gl_spell_categories c ON c.slug = s.category_slug
      ORDER BY c.order_index ASC, s.nom ASC`
  );
  return res.json({ items: rows });
});

/** POST /api/gl/admin/spells */
router.post('/admin/spells', requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const explicitCode = String(req.body?.spell_code || req.body?.id || '').trim();
    const result = await upsertSpellRow(
      { queryAll, execute },
      req.body || {},
      { requireNew: Boolean(explicitCode) }
    );
    const spell = await loadAdminSpellDetail(result.payload.spell_code);
    return res.status(201).json({ ok: true, created: result.created, spell });
  } catch (err) {
    return handleSpellCrudError(res, err);
  }
});

/** GET /api/gl/admin/spells/stats */
router.get('/admin/spells/stats', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const byCategory = await queryAll(
    `SELECT s.category_slug, c.nom AS category_nom, s.statut, COUNT(*) AS effectif
       FROM gl_spells s
  INNER JOIN gl_spell_categories c ON c.slug = s.category_slug
      GROUP BY s.category_slug, c.nom, s.statut
      ORDER BY c.order_index ASC, s.statut ASC`
  );
  const total = await queryOne('SELECT COUNT(*) AS total FROM gl_spells');
  return res.json({
    total: Number(total?.total || 0),
    byCategory,
  });
});

/** GET /api/gl/admin/spells/import/template */
router.get('/admin/spells/import/template', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const buffer = await buildSpellsTemplateWorkbook();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-modele-sortileges.xlsx"');
  return res.send(buffer);
});

/** GET /api/gl/admin/spells/export */
router.get('/admin/spells/export', requireGlPermission('gl.content.manage'), async (req, res) => {
  const statutRaw = String(req.query?.statut || 'all').toLowerCase();
  const statut = statutRaw === 'all' ? 'all' : statutRaw;
  const categorySlug = normalizeCategorySlug(req.query?.categorySlug);
  const data = await loadSpellsExportRows({ queryAll }, { statut, categorySlug });
  const buffer = await buildSpellsExportWorkbook(data);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-export-sortileges.xlsx"');
  return res.send(buffer);
});

/** POST /api/gl/admin/spells/import */
router.post('/admin/spells/import', requireGlPermission('gl.content.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  const syncCategories = req.body?.syncCategories !== false;
  let parsed;
  try {
    parsed = await resolveImportRows(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Fichier import invalide' });
  }
  const { spellRows, categoryRows } = parsed;
  if (!Array.isArray(spellRows) || spellRows.length === 0) {
    return res.status(400).json({ error: 'Feuille sortileges vide ou absente' });
  }
  if (spellRows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Trop de lignes (max ${MAX_IMPORT_ROWS})` });
  }
  try {
    const report = await applySpellsImport(
      { queryAll, execute },
      spellRows,
      { dryRun, syncCategories, categoryRows }
    );
    return res.json({ report });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Import impossible' });
  }
});

/** GET /api/gl/admin/spells/:code */
router.get('/admin/spells/:code', requireGlPermission('gl.content.manage'), async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  const spell = await loadAdminSpellDetail(code);
  if (!spell) return res.status(404).json({ error: 'Sort introuvable' });
  return res.json({ spell });
});

/** PUT /api/gl/admin/spells/:code */
router.put('/admin/spells/:code', requireGlPermission('gl.content.manage'), async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  try {
    const result = await upsertSpellRow(
      { queryAll, execute },
      req.body || {},
      { spell_code: code, requireExisting: true }
    );
    const spell = await loadAdminSpellDetail(result.payload.spell_code);
    return res.json({ ok: true, created: false, spell });
  } catch (err) {
    return handleSpellCrudError(res, err);
  }
});

/** DELETE /api/gl/admin/spells/:code */
router.delete('/admin/spells/:code', requireGlPermission('gl.content.manage'), async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  const existing = await queryOne(
    'SELECT spell_code FROM gl_spells WHERE spell_code = ? LIMIT 1',
    [code]
  );
  if (!existing) return res.status(404).json({ error: 'Sort introuvable' });
  const linked = await queryOne(
    'SELECT chapter_id FROM gl_chapter_spells WHERE spell_code = ? LIMIT 1',
    [code]
  );
  if (linked) {
    return res.status(409).json({
      error: 'Ce sort est lié à au moins un chapitre ; retirez-le des chapitres avant suppression.',
    });
  }
  await execute('DELETE FROM gl_spells WHERE spell_code = ?', [code]);
  return res.json({ ok: true, deleted: code });
});

module.exports = router;
