'use strict';

/**
 * « Tenir à deux » v2 — catalogues (`data/gl/tenir/*.json`) : état et synchronisation depuis
 * l'écran Contenus → Chapitres (carte « Catalogues Tenir à deux »). Monté sous `/api/gl/admin`
 * (server.js), permission `gl.content.manage` (MJ / admin).
 *
 * - `GET  /tenir/catalogues` : comptes par table, empreintes en base comparées au dépôt,
 *   dernier rapport ;
 * - `POST /tenir/catalogues/sync { dryRun?, fichier? }` : rejoue la synchronisation (import
 *   tolérant, empreintes ignorées) sur un fichier ou sur tous.
 */

const express = require('express');
const db = require('../../database');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../../lib/auditLog');
const { IMPORT_ORDER } = require('../../lib/glTenirImport');
const { describeTenirCatalogues, syncTenirCatalogues } = require('../../lib/glTenirSync');

const router = express.Router();

router.get(
  '/tenir/catalogues',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (_req, res) => {
    return res.json(await describeTenirCatalogues(db));
  }),
);

router.post(
  '/tenir/catalogues/sync',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const dryRun = req.body?.dryRun === true;
    const fichier = req.body?.fichier != null ? String(req.body.fichier).trim() : null;
    if (fichier && !IMPORT_ORDER.includes(fichier)) {
      return res.status(400).json({ error: `Fichier inconnu : ${fichier}` });
    }
    const result = await syncTenirCatalogues(db, { force: true, dryRun, fichier });
    if (!dryRun) {
      await logAudit(
        'gl_tenir_catalogues_sync',
        'gl_tenir_catalogues',
        fichier || 'tous',
        'Synchronisation des catalogues « Tenir à deux »',
        {
          req,
          payload: {
            files: result.files.map((f) => ({
              fichier: f.fichier,
              status: f.status,
              upserted: f.upserted || 0,
              ecartees: f.ecartees || 0,
            })),
          },
        },
      );
    }
    return res.json(result);
  }),
);

module.exports = router;
