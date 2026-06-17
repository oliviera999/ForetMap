'use strict';

const express = require('express');
const { queryAll, queryOne } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');

const router = express.Router();

function normalizeOptionalFilter(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

const glossaryCodeParamsSchema = z.unknown().superRefine((p, ctx) => {
  const code = String((p == null ? '' : p.code) || '').trim();
  if (!code) ctx.addIssue({ code: 'custom', message: 'Code invalide', path: [] });
});

/** GET /api/glossary/terms?q=&niveau=&categorie= */
router.get(
  '/terms',
  asyncHandler(async (req, res) => {
    const q = normalizeOptionalFilter(req.query?.q);
    const niveau = normalizeOptionalFilter(req.query?.niveau);
    const categorie = normalizeOptionalFilter(req.query?.categorie);

    const params = [];
    let sql = `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte
                 FROM glossary_terms
                WHERE statut = 'actif'`;

    if (categorie) {
      sql += ' AND categorie = ?';
      params.push(categorie);
    }
    if (niveau) {
      sql += ' AND niveau = ?';
      params.push(niveau);
    }
    if (q) {
      sql += ' AND (terme LIKE ? OR variantes LIKE ?)';
      const needle = `%${q}%`;
      params.push(needle, needle);
    }
    sql += ' ORDER BY categorie ASC, terme ASC';

    const items = await queryAll(sql, params);
    return res.json({ items });
  }),
);

/** GET /api/glossary/terms/:code */
router.get(
  '/terms/:code',
  validate({ params: glossaryCodeParamsSchema }),
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Code invalide' });

    const term = await queryOne(
      `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte,
              definition_complete, exemple, etymologie, illustration_idee, statut
         FROM glossary_terms
        WHERE glossary_code = ? AND statut = 'actif'
        LIMIT 1`,
      [code],
    );
    if (!term) return res.status(404).json({ error: 'Terme introuvable' });

    const relatedTerms = await queryAll(
      `SELECT t.glossary_code, t.terme, t.categorie, t.definition_courte
         FROM glossary_term_relations r
         JOIN glossary_terms t ON t.glossary_code = r.to_code
        WHERE r.from_code = ? AND t.statut = 'actif'
        ORDER BY t.terme ASC`,
      [code],
    );

    const linkedPlants = await queryAll(
      `SELECT p.id, p.name, p.emoji, p.scientific_name
         FROM glossary_term_species gts
         JOIN plants p ON p.id = gts.plant_id
        WHERE gts.glossary_code = ?
        ORDER BY p.name ASC`,
      [code],
    );

    const tutorialsCountRow = await queryOne(
      `SELECT COUNT(*) AS total FROM glossary_term_tutorials WHERE glossary_code = ?`,
      [code],
    );

    return res.json({
      ...term,
      relatedTerms,
      linkedPlants,
      tutorialsCount: Number(tutorialsCountRow?.total || 0),
    });
  }),
);

/** GET /api/glossary/categories */
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const rows = await queryAll(
      `SELECT DISTINCT categorie
         FROM glossary_terms
        WHERE statut = 'actif'
        ORDER BY categorie ASC`,
    );
    return res.json({ categories: rows.map((row) => row.categorie).filter(Boolean) });
  }),
);

module.exports = router;
