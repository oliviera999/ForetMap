const express = require('express');
const { queryOne } = require('../database');
const { requirePermission, authenticate } = require('../middleware/requireTeacher');
const { canAccessMapId, MAP_OUT_OF_SCOPE } = require('../lib/mapAccess');
const {
  serializeZonePhotoListRow,
  redirectIfPublicZonePhotoDataUrl,
} = require('../lib/uploadsPublicUrls');
const asyncHandler = require('../lib/asyncHandler');
const {
  withLocationSurface,
  intersectSurfaceMapScope,
  filterRowsForSurface,
  projectRowsForSurface,
} = require('../lib/surfaceAccess');
const { projectLocationAudienceForViewer, canViewLocation } = require('../lib/locationAudience');
const {
  registerEntityPhotoRoutes,
  reorderPhotosBodySchema,
  addPhotoBodySchema,
} = require('../lib/entityPhotoRoutes');
const {
  ZONES_DETAIL_SQL,
  locationKind,
  listLocations,
  checkLocationReadable,
  createLocation,
  updateLocation,
  deleteLocation,
  notifyLocationChange,
  loadLocationRelations,
  serializeLocation,
} = require('../lib/terrain/locationService');
const { withEditRevision } = require('../lib/editRevision');

/**
 * Routeur des zones : HTTP seulement. Les règles communes aux zones et aux repères
 * (validation, espèces, catégories, visite, suppression) vivent dans
 * `lib/terrain/locationService.js` (étape B4 de l'audit du 25/09/2026) ; ce fichier ne
 * garde que ce qui est propre à la zone : son détail par identifiant.
 */
const ZONE = locationKind('zone');

const router = express.Router();

// `authenticate` : session facultative, hydratée quand elle existe — c'est elle qui porte
// le périmètre cartes, et c'est elle qui, avec le host, décide de la surface.
// `withLocationSurface` : surface décidée par le serveur, laissez-passer exigé par les
// surfaces gardées, cartes de la surface (`docs/AUDIT_SECURITE_2026-09-22.md`, lots A/B/D).
router.get(
  '/',
  authenticate,
  withLocationSurface,
  asyncHandler(async (req, res) => {
    const result = await listLocations('zone', {
      mapIdParam: req.query.map_id,
      surfaceParam: req.query.surface,
      auth: req.auth,
      locationSurface: req.locationSurface,
    });
    res.status(result.status).json(result.body);
  }),
);

router.get(
  '/:id',
  authenticate,
  withLocationSurface,
  asyncHandler(async (req, res) => {
    const zone = await queryOne(`${ZONES_DETAIL_SQL} WHERE z.id = ?`, [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const { publicSurface, viewerAuth, filters } = req.locationSurface;
    if (!canViewLocation(zone, viewerAuth, { publicSurface })) {
      return res.status(404).json({ error: 'Zone introuvable' });
    }
    // Accès direct par identifiant : la carte de la zone est relue en base, pas déduite
    // d'un paramètre de requête.
    if (!(await canAccessMapId(req.auth || null, zone.map_id))) {
      return res.status(403).json(MAP_OUT_OF_SCOPE);
    }
    // …et la carte doit appartenir à la surface servie : sans cela, `/api/zones/:id`
    // rouvrait une à une les zones que la liste vient de fermer.
    const detailScope = intersectSurfaceMapScope(req.locationSurface, null, zone.map_id);
    if (detailScope.notFound) return res.status(404).json({ error: 'Zone introuvable' });
    const relations = await loadLocationRelations(ZONE, [zone.id]);
    const payload = projectLocationAudienceForViewer(
      serializeLocation(
        ZONE,
        { ...zone, has_visit_body: !!Number(zone.has_visit_body) },
        relations,
      ),
      viewerAuth,
      { publicSurface },
    );
    // Masquage par surface : une zone masquée sur la surface servie reste introuvable par
    // son identifiant, sans quoi le filtre de la liste se contournerait un accès à la fois
    // (`docs/AUDIT_SECURITE_2026-09-22.md` S2).
    if (!payload || !filterRowsForSurface([payload], filters).length) {
      return res.status(404).json({ error: 'Zone introuvable' });
    }
    res.json(projectRowsForSurface([payload], req.locationSurface)[0]);
  }),
);

router.put(
  '/:id',
  requirePermission(ZONE.permission),
  asyncHandler(async (req, res) => {
    const result = await withEditRevision('zones', req.params.id, req.body, (body) =>
      updateLocation('zone', req.params.id, body),
    );
    if (result.entity) await notifyLocationChange('zone', 'update', result.entity, { req });
    res.status(result.status).json(result.body);
  }),
);

// Routes photos (liste / reorder / data / ajout / suppression) : fabrique partagée
// avec routes/map.js — comportement et contrats inchangés (audit : déduplication ~250 lignes).
registerEntityPhotoRoutes(router, {
  basePath: '',
  permission: ZONE.permission,
  entityTable: 'zones',
  entityNotFound: 'Zone introuvable',
  photoTable: 'zone_photos',
  fkColumn: 'zone_id',
  reorderAllMessage: 'La liste doit contenir exactement toutes les photos de la zone',
  uploadDirPrefix: 'zones',
  serializeRow: serializeZonePhotoListRow,
  redirectPublicDataUrl: redirectIfPublicZonePhotoDataUrl,
  emitKey: 'zoneId',
  emitReasons: {
    reorder: 'reorder_zone_photos',
    add: 'add_zone_photo',
    delete: 'delete_zone_photo',
  },
  // Une photo se lit aux conditions de sa zone (surface, laissez-passer, périmètre, audience).
  optionalAuth: authenticate,
  surfaceGuard: withLocationSurface,
  canRead: (req, zoneId) =>
    checkLocationReadable('zone', zoneId, {
      auth: req.auth || null,
      locationSurface: req.locationSurface,
    }),
});

router.post(
  '/',
  requirePermission(ZONE.permission),
  asyncHandler(async (req, res) => {
    const result = await createLocation('zone', req.body);
    if (result.entity) await notifyLocationChange('zone', 'create', result.entity, { req });
    res.status(result.status).json(result.body);
  }),
);

router.delete(
  '/:id',
  requirePermission(ZONE.permission),
  asyncHandler(async (req, res) => {
    const result = await deleteLocation('zone', req.params.id);
    if (result.entity) await notifyLocationChange('zone', 'delete', result.entity, { req });
    res.status(result.status).json(result.body);
  }),
);

module.exports = router;
// Exportés pour le test no-DB du contrat de validation O7 (schémas partagés
// zones/repères — voir lib/entityPhotoRoutes.js).
module.exports.reorderZonePhotosBodySchema = reorderPhotosBodySchema;
module.exports.addZonePhotoBodySchema = addPhotoBodySchema;
