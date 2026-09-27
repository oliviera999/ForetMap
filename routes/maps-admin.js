const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { requirePermission } = require('../middleware/requireTeacher');
const { logAudit } = require('../lib/auditLog');
const {
  createMap,
  updateMap,
  updateMapImage,
  updateMapGeoref,
} = require('../lib/terrain/mapService');

/**
 * Administration des cartes : création, modification, image de fond, calage GPS.
 *
 * Mêmes URL qu'avant l'extraction (`/api/settings/admin/maps…`) : ce routeur est monté par
 * `routes/settings.js` sous `/admin/maps`. La logique vit dans `lib/terrain/mapService.js`
 * (étape B4 de l'audit du 25/09/2026, § 3.1) ; il ne reste ici que HTTP et le journal.
 */
const router = express.Router();

function adminMapHandler(run) {
  return asyncHandler(async (req, res) => {
    const result = await run(req);
    if (result.audit) {
      const { action, targetId, label, payload } = result.audit;
      await logAudit(action, 'map', targetId, label, { req, payload });
    }
    res.status(result.status).json(result.body);
  });
}

router.post(
  '/',
  requirePermission('admin.settings.write'),
  adminMapHandler((req) => createMap(req.body || {})),
);

router.put(
  '/:id',
  requirePermission('admin.settings.write'),
  adminMapHandler((req) => updateMap(req.params.id, req.body || {})),
);

router.post(
  '/:id/image',
  requirePermission('admin.settings.write'),
  adminMapHandler((req) => updateMapImage(req.params.id, req.body || {})),
);

router.put(
  '/:id/georef',
  requirePermission('admin.settings.write'),
  adminMapHandler((req) => updateMapGeoref(req.params.id, req.body || {})),
);

module.exports = router;
