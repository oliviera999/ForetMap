const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const {
  resolveImportRows,
  applyGlossaryImport,
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
} = require('../../lib/glGlossaryMatch');

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

async function loadActiveGlossaryForBiome(biomeSlug) {
  if (!biomeSlug) {
    return queryAll(
      `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte,
              definition_complete, exemple, etymologie, all_biomes, statut
         FROM gl_glossary_terms
        WHERE statut = 'actif'
        ORDER BY categorie ASC, terme ASC`
    );
  }
  return queryAll(
    `SELECT DISTINCT t.glossary_code, t.terme, t.variantes, t.categorie, t.niveau,
            t.definition_courte, t.definition_complete, t.exemple, t.etymologie,
            t.all_biomes, t.statut
       FROM gl_glossary_terms t
  LEFT JOIN gl_glossary_term_biomes b ON b.glossary_code = t.glossary_code
      WHERE t.statut = 'actif'
        AND (t.all_biomes = 1 OR b.biome_slug = ?)
      ORDER BY t.categorie ASC, t.terme ASC`,
    [biomeSlug]
  );
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

/** GET /api/gl/glossary — liste filtrée par biome / catégorie / recherche. */
router.get('/glossary', requireGlPermission('gl.read'), async (req, res) => {
  const biomeSlug = normalizeBiomeSlug(req.query?.biomeSlug);
  const categorie = normalizeOptionalFilter(req.query?.categorie);
  const niveau = normalizeOptionalFilter(req.query?.niveau);
  const q = normalizeOptionalFilter(req.query?.q);

  let biome = null;
  if (biomeSlug) {
    biome = await queryOne('SELECT slug, nom FROM gl_biomes WHERE slug = ? LIMIT 1', [biomeSlug]);
    if (!biome) return res.status(404).json({ error: 'Biome introuvable' });
  }

  const allRows = await loadActiveGlossaryForBiome(biomeSlug);
  const items = filterGlossaryList(allRows, { categorie, niveau, q }).map((row) => ({
    glossary_code: row.glossary_code,
    terme: row.terme,
    variantes: row.variantes,
    categorie: row.categorie,
    categorie_label: GLOSSARY_CATEGORY_LABELS[row.categorie] || row.categorie,
    niveau: row.niveau,
    definition_courte: row.definition_courte,
    all_biomes: !!row.all_biomes,
  }));

  return res.json({ biome, items });
});

/** GET /api/gl/glossary/:code — fiche détaillée + termes liés + espèces liées. */
router.get('/glossary/:code', requireGlPermission('gl.read'), async (req, res) => {
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

  const biomeSlug = normalizeBiomeSlug(req.query?.biomeSlug);

  const relatedTerms = await queryAll(
    `SELECT t.glossary_code, t.terme, t.categorie, t.definition_courte
       FROM gl_glossary_term_relations r
 INNER JOIN gl_glossary_terms t ON t.glossary_code = r.to_code
      WHERE r.from_code = ? AND t.statut = 'actif'
      ORDER BY t.terme ASC`,
    [code]
  );

  let relatedSpecies = [];
  if (biomeSlug) {
    const speciesRows = await queryAll(
      `SELECT species_code, nom_commun, type, mots_cles
         FROM gl_species
        WHERE biome_slug = ? AND statut = 'actif'`,
      [biomeSlug]
    );
    relatedSpecies = matchSpeciesForGlossaryTerm(term, speciesRows);
  }

  return res.json({
    term: {
      ...term,
      categorie_label: GLOSSARY_CATEGORY_LABELS[term.categorie] || term.categorie,
      all_biomes: !!term.all_biomes,
    },
    relatedTerms,
    relatedSpecies,
  });
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
  const buffer = buildGlossaryTemplateWorkbook();
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
  const buffer = buildGlossaryExportWorkbook(rows);
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
    parsed = resolveImportRows(req.body || {});
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
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
};
