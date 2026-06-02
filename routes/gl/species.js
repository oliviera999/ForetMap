const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const {
  resolveImportRows,
  applySpeciesImport,
  upsertSpeciesRow,
  allocateNextSpeciesCode,
  MAX_IMPORT_ROWS,
  buildSpeciesTemplateWorkbook,
  buildSpeciesExportWorkbook,
  loadSpeciesExportRows,
} = require('../../lib/glSpeciesImport');
const {
  loadActiveGlossaryForBiome,
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
} = require('./glossary');
const {
  buildReaderKey,
  listLearningAcks,
  groupLearningAcksByType,
  markItemsLearned,
} = require('../../lib/shared/learningAckCore');

const db = { queryAll, queryOne, execute };

async function loadSpeciesLearnedCodes(glAuth) {
  const reader = buildReaderKey(glAuth);
  if (!reader) return [];
  const rows = await listLearningAcks(db, reader, 'species');
  return groupLearningAcksByType(rows).species_codes;
}

const router = express.Router();

function normalizeBiomeSlug(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/** GET /api/gl/biomes — liste des biomes avec effectifs espèces. */
router.get('/biomes', requireGlPermission('gl.read'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT b.slug, b.nom, b.order_index,
            COUNT(s.id) AS species_count,
            SUM(CASE WHEN s.type = 'faune' THEN 1 ELSE 0 END) AS faune_count,
            SUM(CASE WHEN s.type = 'flore' THEN 1 ELSE 0 END) AS flore_count
       FROM gl_biomes b
  LEFT JOIN gl_species s ON s.biome_slug = b.slug AND s.statut = 'actif'
      GROUP BY b.slug, b.nom, b.order_index
      ORDER BY b.order_index ASC, b.slug ASC`
  );
  return res.json(rows);
});

/** GET /api/gl/species?biomeSlug= — espèces d'un biome. */
router.get('/species', requireGlPermission('gl.read'), async (req, res) => {
  const biomeSlug = normalizeBiomeSlug(req.query?.biomeSlug);
  if (!biomeSlug) return res.status(400).json({ error: 'biomeSlug requis' });
  const biome = await queryOne('SELECT slug, nom FROM gl_biomes WHERE slug = ? LIMIT 1', [biomeSlug]);
  if (!biome) return res.status(404).json({ error: 'Biome introuvable' });
  const itemsRaw = await queryAll(
    `SELECT id, species_code, biome_slug, type, nom_commun, nom_scientifique, groupe, famille,
            statut_iucn, endemique, role_ecologique, adaptations_cles, taille_adulte, poids_adulte,
            regime_alimentaire, longevite, reproduction, observation_terrain, description_courte,
            anecdote, present_dans_qcm, mots_cles, wikipedia_title, wikipedia_url, photo_url, photo_credit,
            photo_licence, photo_licence_url, statut
       FROM gl_species
      WHERE biome_slug = ? AND statut = 'actif'
      ORDER BY type ASC, groupe ASC, nom_commun ASC`,
    [biomeSlug]
  );
  const glossaryRows = await loadActiveGlossaryForBiome(biomeSlug);
  const glossaryByKey = buildGlossaryLookupMap(glossaryRows);
  const learnedCodes = await loadSpeciesLearnedCodes(req.glAuth);
  const items = markItemsLearned(
    itemsRaw.map((row) => ({
      ...row,
      glossaryTerms: matchGlossaryTermsForSpecies(row.mots_cles, glossaryByKey),
    })),
    learnedCodes,
    'species_code'
  );
  return res.json({ biome, items });
});

const ADMIN_SPECIES_LIST_LIMIT = 500;

function normalizeOptionalFilter(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function handleSpeciesCrudError(res, err) {
  const status = err.statusCode || 400;
  return res.status(status).json({
    error: err.message || 'Opération impossible',
    details: Array.isArray(err.details) ? err.details : undefined,
  });
}

async function loadAdminSpeciesDetail(code) {
  const row = await queryOne(
    `SELECT id, species_code, biome_slug, type, nom_commun, nom_scientifique, groupe, famille,
            statut_iucn, endemique, role_ecologique, adaptations_cles, taille_adulte, poids_adulte,
            regime_alimentaire, longevite, reproduction, observation_terrain, description_courte,
            anecdote, present_dans_qcm, mots_cles, wikipedia_title, wikipedia_url, photo_url, photo_credit,
            photo_licence, photo_licence_url, statut
       FROM gl_species
      WHERE species_code = ?
      LIMIT 1`,
    [code]
  );
  return row || null;
}

function filterSpeciesAdminList(rows, { type, q }) {
  let items = rows;
  if (type) items = items.filter((row) => row.type === type);
  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((row) => {
      const hay = `${row.nom_commun} ${row.nom_scientifique || ''} ${row.species_code}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  return items;
}

/** GET /api/gl/admin/species/next-code — prochain code SP#### suggéré. */
router.get('/admin/species/next-code', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const species_code = await allocateNextSpeciesCode(queryAll);
  return res.json({ species_code });
});

/** GET /api/gl/admin/species — liste admin par biome. */
router.get('/admin/species', requireGlPermission('gl.content.manage'), async (req, res) => {
  const biomeSlug = normalizeBiomeSlug(req.query?.biomeSlug);
  if (!biomeSlug) return res.status(400).json({ error: 'biomeSlug requis' });
  const biome = await queryOne('SELECT slug, nom FROM gl_biomes WHERE slug = ? LIMIT 1', [biomeSlug]);
  if (!biome) return res.status(404).json({ error: 'Biome introuvable' });

  const type = normalizeOptionalFilter(req.query?.type);
  const q = normalizeOptionalFilter(req.query?.q);
  const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
  const statutClause = statutRaw === 'all' ? '' : " AND statut = 'actif' ";

  const rows = await queryAll(
    `SELECT species_code, biome_slug, type, nom_commun, nom_scientifique, groupe, statut
       FROM gl_species
      WHERE biome_slug = ?${statutClause}
      ORDER BY type ASC, nom_commun ASC
      LIMIT ${ADMIN_SPECIES_LIST_LIMIT}`,
    [biomeSlug]
  );

  const items = filterSpeciesAdminList(rows, { type, q });
  return res.json({ biome, items, total: items.length });
});

/** POST /api/gl/admin/species — création. */
router.post('/admin/species', requireGlPermission('gl.content.manage'), async (req, res) => {
  try {
    const explicitCode = String(req.body?.species_code || '').trim();
    const result = await upsertSpeciesRow(
      { queryAll, execute },
      req.body || {},
      { requireNew: Boolean(explicitCode) }
    );
    const species = await loadAdminSpeciesDetail(result.payload.species_code);
    return res.status(201).json({ ok: true, created: result.created, species });
  } catch (err) {
    return handleSpeciesCrudError(res, err);
  }
});

/** GET /api/gl/admin/species/stats — agrégats catalogue (admin). */
router.get('/admin/species/stats', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const byBiome = await queryAll(
    `SELECT s.biome_slug, b.nom AS biome_nom, s.type, COUNT(*) AS effectif
       FROM gl_species s
  INNER JOIN gl_biomes b ON b.slug = s.biome_slug
      WHERE s.statut = 'actif'
      GROUP BY s.biome_slug, b.nom, s.type
      ORDER BY b.order_index ASC, s.type ASC`
  );
  const total = await queryOne(
    `SELECT COUNT(*) AS total FROM gl_species WHERE statut = 'actif'`
  );
  return res.json({
    total: Number(total?.total || 0),
    byBiome,
  });
});

/** GET /api/gl/admin/species/import/template — modèle XLSX biocénose (especes + biomes_stats). */
router.get('/admin/species/import/template', requireGlPermission('gl.content.manage'), async (_req, res) => {
  const buffer = buildSpeciesTemplateWorkbook();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-modele-biocenose.xlsx"');
  return res.send(buffer);
});

/** GET /api/gl/admin/species/export — export XLSX ré-importable. */
router.get('/admin/species/export', requireGlPermission('gl.content.manage'), async (req, res) => {
  const statutRaw = String(req.query?.statut || 'actif').toLowerCase();
  const statut = statutRaw === 'all' ? 'all' : 'actif';
  const biomeSlug = normalizeBiomeSlug(req.query?.biomeSlug);
  const data = await loadSpeciesExportRows({ queryAll }, { statut, biomeSlug });
  const buffer = buildSpeciesExportWorkbook(data);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-gl-export-biocenose.xlsx"');
  return res.send(buffer);
});

/** POST /api/gl/admin/species/import — import XLSX espèces/biomes. */
router.post('/admin/species/import', requireGlPermission('gl.content.manage'), async (req, res) => {
  const dryRun = !!req.body?.dryRun;
  const syncBiomes = req.body?.syncBiomes !== false;
  let parsed;
  try {
    parsed = resolveImportRows(req.body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Fichier import invalide' });
  }
  const { speciesRows, biomeRows } = parsed;
  if (!Array.isArray(speciesRows) || speciesRows.length === 0) {
    return res.status(400).json({ error: 'Feuille especes vide ou absente' });
  }
  if (speciesRows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Trop de lignes (max ${MAX_IMPORT_ROWS})` });
  }
  try {
    const report = await applySpeciesImport(
      { queryAll, execute },
      speciesRows,
      { dryRun, syncBiomes, biomeRows }
    );
    return res.json({ report });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Import impossible' });
  }
});

/** GET /api/gl/admin/species/:code — fiche admin. */
router.get('/admin/species/:code', requireGlPermission('gl.content.manage'), async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  const species = await loadAdminSpeciesDetail(code);
  if (!species) return res.status(404).json({ error: 'Espèce introuvable' });
  return res.json({ species });
});

/** PUT /api/gl/admin/species/:code — mise à jour. */
router.put('/admin/species/:code', requireGlPermission('gl.content.manage'), async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  try {
    const result = await upsertSpeciesRow(
      { queryAll, execute },
      req.body || {},
      { species_code: code, requireExisting: true }
    );
    const species = await loadAdminSpeciesDetail(result.payload.species_code);
    return res.json({ ok: true, created: false, species });
  } catch (err) {
    return handleSpeciesCrudError(res, err);
  }
});

/** PATCH /api/gl/admin/species/:code — archivage. */
router.patch('/admin/species/:code', requireGlPermission('gl.content.manage'), async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Code invalide' });
  const existing = await queryOne(
    'SELECT species_code FROM gl_species WHERE species_code = ? LIMIT 1',
    [code]
  );
  if (!existing) return res.status(404).json({ error: 'Espèce introuvable' });
  const statut = normalizeOptionalFilter(req.body?.statut) || 'inactif';
  await execute(
    'UPDATE gl_species SET statut = ?, updated_at = NOW() WHERE species_code = ?',
    [statut, code]
  );
  const species = await loadAdminSpeciesDetail(code);
  return res.json({ ok: true, species });
});

module.exports = router;
