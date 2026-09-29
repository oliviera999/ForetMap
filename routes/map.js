const express = require('express');
const { requirePermission, authenticate } = require('../middleware/requireTeacher');
const { withLocationSurface } = require('../lib/surfaceAccess');
const asyncHandler = require('../lib/asyncHandler');
const {
  serializeMarkerPhotoListRow,
  redirectIfPublicMarkerPhotoDataUrl,
} = require('../lib/uploadsPublicUrls');
const {
  registerEntityPhotoRoutes,
  reorderPhotosBodySchema,
  addPhotoBodySchema,
} = require('../lib/entityPhotoRoutes');
const {
  locationKind,
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  notifyLocationChange,
} = require('../lib/terrain/locationService');
const { withEditRevision } = require('../lib/editRevision');

/**
 * Routeur des repères de carte (`/api/map/markers…`) : HTTP seulement. Les règles communes
 * aux zones et aux repères vivent dans `lib/terrain/locationService.js` (étape B4 de
 * l'audit du 25/09/2026).
 */
const MARKER = locationKind('marker');

const router = express.Router();

// Routes photos (data / liste / reorder / ajout / suppression) : fabrique partagée
// avec routes/zones.js — comportement et contrats inchangés (audit : déduplication ~250 lignes).
registerEntityPhotoRoutes(router, {
  basePath: '/markers',
  permission: MARKER.permission,
  entityTable: 'map_markers',
  entityNotFound: 'Repère introuvable',
  photoTable: 'marker_photos',
  fkColumn: 'marker_id',
  reorderAllMessage: 'La liste doit contenir exactement toutes les photos du repère',
  uploadDirPrefix: 'markers',
  serializeRow: serializeMarkerPhotoListRow,
  redirectPublicDataUrl: redirectIfPublicMarkerPhotoDataUrl,
  emitKey: 'markerId',
  emitReasons: {
    reorder: 'reorder_marker_photos',
    add: 'add_marker_photo',
    delete: 'delete_marker_photo',
  },
});

// `authenticate` : session facultative, hydratée quand elle existe — c'est elle qui porte
// le périmètre cartes, et c'est elle qui, avec le host, décide de la surface.
// `withLocationSurface` : surface décidée par le serveur, laissez-passer exigé par les
// surfaces gardées, cartes de la surface (`docs/AUDIT_SECURITE_2026-09-22.md`, lots A/B/D).
router.get(
  '/markers',
  authenticate,
  withLocationSurface,
  asyncHandler(async (req, res) => {
    const result = await listLocations('marker', {
      mapIdParam: req.query.map_id,
      surfaceParam: req.query.surface,
      auth: req.auth,
      locationSurface: req.locationSurface,
    });
    res.status(result.status).json(result.body);
  }),
);

router.post(
  '/markers',
  requirePermission(MARKER.permission),
  asyncHandler(async (req, res) => {
    const result = await createLocation('marker', req.body);
    if (result.entity) await notifyLocationChange('marker', 'create', result.entity, { req });
    res.status(result.status).json(result.body);
  }),
);

router.put(
  '/markers/:id',
  requirePermission(MARKER.permission),
  asyncHandler(async (req, res) => {
    const result = await withEditRevision('map_markers', req.params.id, req.body, (body) =>
      updateLocation('marker', req.params.id, body),
    );
    if (result.entity) await notifyLocationChange('marker', 'update', result.entity, { req });
    res.status(result.status).json(result.body);
  }),
);

router.delete(
  '/markers/:id',
  requirePermission(MARKER.permission),
  asyncHandler(async (req, res) => {
    const result = await deleteLocation('marker', req.params.id);
    if (result.entity) await notifyLocationChange('marker', 'delete', result.entity, { req });
    res.status(result.status).json(result.body);
  }),
);

module.exports = router;
// Exportés pour le test no-DB du contrat de validation O7 (schémas partagés
// zones/repères — voir lib/entityPhotoRoutes.js).
module.exports.reorderMarkerPhotosBodySchema = reorderPhotosBodySchema;
module.exports.addMarkerPhotoBodySchema = addPhotoBodySchema;
