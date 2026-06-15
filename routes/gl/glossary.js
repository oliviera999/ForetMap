const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const {
  resolveImportRows,
  applyGlossaryImport,
  upsertGlossaryTerm,
  allocateNextGlossaryCode,
  MAX_IMPORT_ROWS,
  buildGlossaryTemplateWorkbook,
  buildGlossaryExportWorkbook,
  loadGlossaryExportRows,
} = require('../../lib/glGlossaryImport');
const {
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
  matchSpeciesForGlossaryTerm,
  GLOSSARY_CATEGORY_LABELS,
  GLOSSARY_CATEGORIES,
} = require('../../lib/glGlossaryMatch');
const {
  parseBiomeSlugsFromQuery,
  loadBiomeMetaBySlugs,
  normalizeBiomeSlugList,
} = require('../../lib/glChapterBiomes');
const {
  buildReaderKey,
  listLearningAcks,
  groupLearningAcksByType,
  markItemsLearned,
} = require('../../lib/shared/learningAckCore');
const { z, validate } = require('../../lib/validate');

const db = { queryAll, queryOne, execute };

// O7 — param `:code` des routes glossaire (`GET /glossary/:code`,
// `GET|PUT|PATCH /admin/glossary/terms/:code`) : reproduit exactement l'ancienne validation
// manuelle `String(req.params.code || '').trim()` suivie de `if (!code) return 400 'Code invalide'`.
// Refine au niveau racine (path vide) pour préserver le message verbatim (sans préfixe de chemin).
// Le param n'est PAS transformé : le handler continue de lire/trimmer `req.params.code` lui-même.
const glossaryCodeParamsSchema = z.unknown().superRefine((p, ctx) => {
  const code = String((p == null ? '' : p.code) || '').trim();
  if (!code) ctx.addIssue({ code: 'custom', message: 'Code invalide', path: [] });
});

async function loadGlossaryLearnedCodes(glAuth) {
  const reader = buildReaderKey(glAuth);
  if (!reader) return [];
  const rows = await listLearningAcks(db, reader, 'glossary');
  return groupLearningAcksByType(rows).glossary_codes;
}

const router = express.Router();

function normalizeBiomeSlug(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeOptionalFilter(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

async function loadActiveGlossaryForBiomes(biomeSlugs) {
  const slugs = normalizeBiomeSlugList(biomeSlugs);
  if (slugs.length === 0) {
    return queryAll(
      `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte,
              definition_complete, exemple, etymologie, all_biomes, statut
         FROM gl_glossary_terms
        WHERE statut = 'actif'
        ORDER BY categorie ASC, terme ASC`
    );
  }
  if (slugs.length === 1) {
    return queryAll(
      `SELECT DISTINCT t.glossary_code, t.terme, t.variantes, t.categorie, t.niveau,
              t.definition_courte, t.definition_complete, t.exemple, t.etymologie,
              t.all_biomes, t.statut
         FROM gl_glossary_terms t
    LEFT JOIN gl_glossary_term_biomes b ON b.glossary_code = t.glossary_code
        WHERE t.statut = 'actif'
          AND (t.all_biomes = 1 OR b.biome_slug = ?)
        ORDER BY t.categorie ASC, t.terme ASC`,
      [slugs[0]]
    );
  }
  const placeholders = slugs.map(() => '?').join(', ');
  return queryAll(
    `SELECT DISTINCT t.glossary_code, t.terme, t.variantes, t.categorie, t.niveau,
            t.definition_courte, t.definition_complete, t.exemple, t.etymologie,
            t.all_biomes, t.statut
       FROM gl_glossary_terms t
  LEFT JOIN gl_glossary_term_biomes b ON b.glossary_code = t.glossary_code
      WHERE t.statut = 'actif'
        AND (t.all_biomes = 1 OR b.biome_slug IN (${placeholders}))
      ORDER BY t.categorie ASC, t.terme ASC`,
    slugs
  );
}

/** @deprecated Utiliser loadActiveGlossaryForBiomes */
async function loadActiveGlossaryForBiome(biomeSlug) {
  return loadActiveGlossaryForBiomes(biomeSlug ? [biomeSlug] : []);
}

function filterGlossaryList(rows, { categorie, niveau, q }) {
  let items = rows;
  if (categorie) {
    items = items.filter((row) => row.categorie === categorie);
  }
  if (niveau) {
    items = items.filter((row) => row.niveau === niveau);
  }
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((row) => {
      const hay = `${row.terme} ${row.variantes || ''} ${row.definition_courte || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  return items;
}

/** GET /api/gl/glossary — liste filtrée par biome(s) / catégorie / recherche. */
router.get('/glossary', requireGlPermission('gl.read'), async (req, res) => {
  const biomeSlugs = parseBiomeSlugsFromQuery(req.query);
  const categorie = normalizeOptionalFilter(req.query?.categorie);
  const niveau = normalizeOptionalFilter(req.query?.niveau);
  const q = normalizeOptionalFilter(req.query?.q);

  let biomes = [];
  if (biomeSlugs.length > 0) {
    biomes = await loadBiomeMetaBySlugs({ queryAll }, biomeSlugs);
    if (biomes.length !== biomeSlugs.length) {
      return res.status(404).json({ error: 'Biome introuvable' });
    }
  }

  const allRows = await loadActiveGlossaryForBiomes(biomeSlugs);
  const learnedCodes = await loadGlossaryLearnedCodes(req.glAuth);
  const items = markItemsLearned(
    filterGlossaryList(allRows, { categorie, niveau, q }).map((row) => ({
      glossary_code: row.glossary_code,
      terme: row.terme,
      variantes: row.variantes,
      categorie: row.categorie,
      categorie_label: GLOSSARY_CATEGORY_LABELS[row.categorie] || row.categorie,
      niveau: row.niveau,
      definition_courte: row.definition_courte,
      all_biomes: !!row.all_biomes,
    })),
    learnedCodes,
    'glossary_code'
  );

  return res.json({
    biome: biomes.length === 1 ? biomes[0] : null,
    biomes,
    items,
  });
});

/** GET /api/gl/glossary/:code — fiche détaillée + termes liés + espèces liées. */
router.get('/glossary/:code', requireGlPermission('gl.read'), validate({ params: glossaryCodeParamsSchema }), async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Code invalide' });

  const term = await queryOne(
    `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte,
            definition_complete, exemple, etymologie, present_dans_qcm, illustration_idee,
            all_biomes, statut
       FROM gl_glossary_terms
      WHERE glossary_code = ? AND statut = 'actif'
      LIMIT 1`,
    [code]
  );
  if (!term) return res.status(404).json({ error: 'Terme introuvable' });

  const biomeSlugs = parseBiomeSlugsFromQuery(req.query);

  const relatedTerms = await queryAll(
    `SELECT t.glossary_code, t.terme, t.categorie, t.definition_courte
       FROM gl_glossary_term_relations r
 INNER JOIN gl_glossary_terms t ON t.glossary_code = r.to_code
      WHERE r.from_code = ? AND t.statut = 'actif'
      ORDER BY t.terme ASC`,
    [code]
  );

  let relatedSpecies = [];
  if (biomeSlugs.length > 0) {
    const placeholders = biomeSlugs.map(() => '?').join(', ');
    const speciesRows = await queryAll(
      `SELECT species_code, nom_commun, type, mots_cles
         FROM gl_species
        WHERE biome_slug IN (${placeholders}) AND statut = 'actif'`,
      biomeSlugs
    );
    relatedSpecies = matchSpeciesForGlossaryTerm(term, speciesRows);
  }

  const learnedCodes = await loadGlossaryLearnedCodes(req.glAuth);
  const learned = learnedCodes.includes(code);

  return res.json({
    term: {
      ...term,
      categorie_label: GLOSSARY_CATEGORY_LABELS[term.categorie] || term.categorie,
      all_biomes: !!term.all_biomes,
      learned,
    },
    relatedTerms,
    relatedSpecies,
  });
});

const ADMIN_GLOSSARY_LIST_LIMIT = 500;

async function loadAdminGlossaryTermDetail(code) {
  const term = await queryOne(
    `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte,
            definition_complete, exemple, etymologie, present_dans_qcm, illustration_idee,
            all_biomes, statut
       FROM gl_glossary_terms
      WHERE glossary_code = ?
      LIMIT 1`,
    [code]
  );
  if (!term) return null;
  const biomeSlugs = await queryAll(
    `SELECT biome_slug FROM gl_glossary_term_biomes WHERE glossary_code = ? ORDER BY biome_slug ASC`,
    [code]
  );
  const relatedCodes = await queryAll(
    `SELECT to_code FROM gl_glossary_term_relations WHERE from_code = ? ORDER BY to_code ASC`,
    [code]
  );
  return {
    ...term,
    categorie_label: GLOSSARY_CATEGORY_LABELS[term.categorie] || term.categorie,
    all_biomes: !!term.all_biomes,
    biome_slugs: biomeSlugs.map((r) => String(r.biome_slug)),
    related_codes: relatedCodes.map((r) => String(r.to_code)),
  };
}

function handleGlossaryCrudError(res, err) {
  const status = err.statusCode || 400;
  return res.status(status).json({
    error: err.message || 'Opération impossible',
    details: Array.isArray(err.details) ? err.details : undefined,
  });
}

/** GET /api/gl/admin/glossary/meta — catégories, niveaux, biomes. */
router.get('/admin/glossary/meta', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const biomes = await queryAll(
    'SELECT slug, nom, order_index FROM gl_biomes ORDER BY order_index ASC, slug ASC'
  );
  return res.json({
    categories: GLOSSARY_CATEGORIES.map((id) => ({
      id,
      label: GLOSSARY_CATEGORY_LABELS[id] || id,
    })),
    niveaux: [
      { id: 'base', label: 'Base' },
      { id: 'approfondissement', label: 'Approfondissement' },
      { id: 'avance', label: 'Avancé' },
    ],
    biomes,
  });
});

/** GET /api/gl/admin/glossary/terms/next-code — prochain code GL#### suggéré. */
router.get('/admin/glossary/terms/next-code', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const code = await allocateNextGlossaryCode(queryAll);
  return res.json({ glossary_code: code });
});

/** GET /api/gl/admin/glossary/terms — liste admin. */
router.get('/admin/glossary/terms', requireGlPermission('gl.content.manage'), async (req, res) => {
  const categorie = normalizeOptionalFilter(req.query?.categorie);
  const q = normalizeOptionalFilter(req.query?.q);
  const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
  const statut = statutRaw === 'all' ? null : 'actif';

  const rows = statut
    ? await queryAll(
      `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte, all_biomes, statut
         FROM gl_glossary_terms
        WHERE statut = ?
        ORDER BY categorie ASC, terme ASC
        LIMIT ${ADMIN_GLOSSARY_LIST_LIMIT}`,
      [statut]
    )
    : await queryAll(
      `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte, all_biomes, statut
         FROM gl_glossary_terms
        ORDER BY categorie ASC, terme ASC
        LIMIT ${ADMIN_GLOSSARY_LIST_LIMIT}`
    );

  const items = filterGlossaryList(rows, { categorie, niveau: null, q }).map((row) => ({
    glossary_code: row.glossary_code,
    terme: row.terme,
    variantes: row.variantes,
    categorie: row.categorie,
    categorie_label: GLOSSARY_CATEGORY_LABELS[row.categorie] || row.categorie,
    niveau: row.niveau,
    definition_courte: row.definition_courte,
    all_biomes: !!row.all_biomes,
    statut: row.statut,
  }));

  return res.json({ items, total: items.length });
});

/** GET /api/gl/admin/glossary/terms/:code — fiche admin complète. */
router.get('/admin/glossary/terms/:code', requireGlPermission('gl.content.manage'), validate({ params: glossaryCodeParamsSchema }), async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  const term = await loadAdminGlossaryTermDetail(code);
  if (!term) return res.status(404).json({ error: 'Terme introuvable' });
  return res.json({ term });
});

/** POST /api/gl/admin/glossary/terms — création. */
router.post('/admin/glossary/terms', requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const explicitCode = String(req.body?.glossary_code || '').trim();
    const result = await upsertGlossaryTerm(
      { queryAll, execute },
      req.body || {},
      { requireNew: Boolean(explicitCode) }
    );
    const term = await loadAdminGlossaryTermDetail(result.payload.glossary_code);
    return res.status(201).json({ ok: true, created: result.created, term });
  } catch (err) {
    return handleGlossaryCrudError(res, err);
  }
});

/** PUT /api/gl/admin/glossary/terms/:code — mise à jour. */
router.put('/admin/glossary/terms/:code', requireGlPermission('gl.content.manage'), validate({ params: glossaryCodeParamsSchema }), async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  try {
    const result = await upsertGlossaryTerm(
      { queryAll, execute },
      req.body || {},
      { glossary_code: code, requireExisting: true }
    );
    const term = await loadAdminGlossaryTermDetail(result.payload.glossary_code);
    return res.json({ ok: true, created: false, term });
  } catch (err) {
    return handleGlossaryCrudError(res, err);
  }
});

/** PATCH /api/gl/admin/glossary/terms/:code — archivage (statut). */
router.patch('/admin/glossary/terms/:code', requireGlPermission('gl.content.manage'), validate({ params: glossaryCodeParamsSchema }), async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  const existing = await queryOne(
    'SELECT glossary_code FROM gl_glossary_terms WHERE glossary_code = ? LIMIT 1',
    [code]
  );
  if (!existing) return res.status(404).json({ error: 'Terme introuvable' });
  const statut = normalizeOptionalFilter(req.body?.statut) || 'inactif';
  await execute(
    'UPDATE gl_glossary_terms SET statut = ?, updated_at = NOW() WHERE glossary_code = ?',
    [statut, code]
  );
  const term = await loadAdminGlossaryTermDetail(code);
  return res.json({ ok: true, term });
});

/** GET /api/gl/admin/glossary/stats — agrégats admin. */
router.get('/admin/glossary/stats', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const byCategory = await queryAll(
    `SELECT categorie, COUNT(*) AS effectif
       FROM gl_glossary_terms
      WHERE statut = 'actif'
      GROUP BY categorie
      ORDER BY effectif DESC`
  );
  const byNiveau = await queryAll(
    `SELECT niveau, COUNT(*) AS effectif
       FROM gl_glossary_terms
      WHERE statut = 'actif'
      GROUP BY niveau
      ORDER BY FIELD(niveau, 'base', 'approfondissement', 'avance')`
  );
  const total = await queryOne(
    `SELECT COUNT(*) AS total FROM gl_glossary_terms WHERE statut = 'actif'`
  );
  return res.json({
    total: Number(total?.total || 0),
    byCategory,
    byNiveau,
  });
});

/** GET /api/gl/admin/glossary/import/template — modèle XLSX vierge. */
router.get('/admin/glossary/import/template', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const buffer = await buildGlossaryTemplateWorkbook();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-modele-glossaire.xlsx"');
  return res.send(buffer);
});

/** GET /api/gl/admin/glossary/export — export XLSX ré-importable. */
router.get('/admin/glossary/export', requireGlPermission('gl.content.manage'), async (req, res) => {
  const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
  const statut = statutRaw === 'all' ? 'all' : 'actif';
  const rows = await loadGlossaryExportRows({ queryAll }, { statut });
  const buffer = await buildGlossaryExportWorkbook(rows);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-export-glossaire.xlsx"');
  return res.send(buffer);
});

/** POST /api/gl/admin/glossary/import — import XLSX glossaire. */
router.post('/admin/glossary/import', requireGlPermission('gl.content.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  let parsed;
  try {
    parsed = await resolveImportRows(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Fichier import invalide' });
  }
  const { glossaryRows } = parsed;
  if (!Array.isArray(glossaryRows) || glossaryRows.length === 0) {
    return res.status(400).json({ error: 'Feuille glossaire vide ou absente' });
  }
  if (glossaryRows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Trop de lignes (max ${MAX_IMPORT_ROWS})` });
  }
  try {
    const report = await applyGlossaryImport(
      { queryAll, execute },
      glossaryRows,
      { dryRun }
    );
    return res.json({ report });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Import impossible' });
  }
});

module.exports = {
  router,
  loadActiveGlossaryForBiome,
  loadActiveGlossaryForBiomes,
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
};
module.exports.glossaryCodeParamsSchema = glossaryCodeParamsSchema; // exporté pour test no-DB du contrat O7
