const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const {
  resolveImportRows,
  applySpeciesImport,
  MAX_IMPORT_ROWS,
} = require('../../lib/glSpeciesImport');

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
  const items = await queryAll(
    `SELECT id, species_code, biome_slug, type, nom_commun, nom_scientifique, groupe, famille,
            statut_iucn, endemique, role_ecologique, adaptations_cles, taille_adulte, poids_adulte,
            regime_alimentaire, longevite, reproduction, observation_terrain, description_courte,
            anecdote, present_dans_qcm, wikipedia_title, wikipedia_url, photo_url, photo_credit,
            photo_licence, photo_licence_url, statut
       FROM gl_species
      WHERE biome_slug = ? AND statut = 'actif'
      ORDER BY type ASC, groupe ASC, nom_commun ASC`,
    [biomeSlug]
  );
  return res.json({ biome, items });
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

module.exports = router;
