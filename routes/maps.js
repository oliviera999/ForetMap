const express = require('express');
const { queryAll, queryOne } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { authenticate } = require('../middleware/requireTeacher');
const {
  MAP_OUT_OF_SCOPE,
  getAllowedMapIdsForAuth,
  filterMapsByAllowedIds,
  resolveScopedMapFilter,
} = require('../lib/mapAccess');
const { withLocationSurface, intersectSurfaceMapScope } = require('../lib/surfaceAccess');
const { mapExists } = require('../lib/mapQueries');
const {
  parsePresenceSources,
  listSpeciesForMap,
  restrictPresencePlaces,
  summarizePresence,
  serializePresenceEntry,
} = require('../lib/biodiv/presenceService');
const { loadVisiblePlaceIds } = require('../lib/biodiv/presenceVisibility');
const { loadAllMaps, invalidateMapsListCache } = require('../lib/terrain/mapService');

const router = express.Router();

/**
 * Catalogue des cartes — borné par la **surface** puis par le périmètre du compte.
 *
 * `authenticate` : session facultative (la Visite publique a besoin du catalogue), mais
 * hydratée quand elle existe — c'est elle qui porte le périmètre, et c'est elle qui, avec
 * le host, décide de la surface.
 *
 * Lots B et E de `docs/AUDIT_SECURITE_2026-09-22.md` : la route rendait anonymement les sept
 * cartes de l'établissement, **géoréférencement compris** (constats S1 et S6).
 *
 * Le géoréférencement n'est **pas** retiré surface par surface, et c'est délibéré : les
 * quatre surfaces s'en servent pour afficher la position du lecteur — la Visite comprise,
 * qui est faite pour se repérer sur un terrain d'apprentissage (`src/components/visit-views.jsx`,
 * « Se localiser »). Le retirer casserait la fonction sans rien protéger de plus : ce qui
 * fuyait en S6, ce sont les ancres de `lyautey`, et c'est le périmètre de surface ci-dessous
 * qui les ferme, en sortant la carte du catalogue de la surface publique.
 */
router.get(
  '/',
  authenticate,
  // `withLocationSurface` : une surface gardée exige son laissez-passer **ici aussi**. Sans
  // cela, le catalogue d'un plan fermé par un code sortait encore son identifiant, son
  // libellé et son géoréférencement à qui ne l'avait pas saisi.
  withLocationSurface,
  asyncHandler(async (req, res) => {
    const maps = await loadAllMaps();
    const { allowedMapIds: surfaceMapIds } = req.locationSurface;
    const accountMapIds = await getAllowedMapIdsForAuth(req.auth || null);
    const scoped = filterMapsByAllowedIds(
      filterMapsByAllowedIds(maps, surfaceMapIds),
      accountMapIds,
    );
    res.json(scoped);
  }),
);

/**
 * GET /api/maps/:mapId/species — espèces présentes sur la carte, avec leur provenance.
 *
 * Définition unique de « présente sur ce site » (`lib/biodiv/presenceService.js`, décision
 * Q10) : registre de la carte, zones ou repères. Le filtre « Présente sur cette carte » du
 * catalogue et la fiche espèce s'appuient sur cette réponse au lieu de refaire la réunion
 * côté client.
 *
 * Mêmes gardes que `GET /api/zones` : surface décidée par le serveur (laissez-passer des
 * surfaces gardées), carte de la surface, périmètre de groupe du compte. La présence et ses
 * canaux ne dépendent pas du lecteur ; les **lieux** cités, eux, sont filtrés comme sur la
 * carte (audience, surfaces), pour qu'un lieu réservé ne soit jamais nommé.
 *
 * `?sources=registre,zone,repere` (facultatif) restreint explicitement les canaux.
 */
router.get(
  '/:mapId/species',
  authenticate,
  withLocationSurface,
  asyncHandler(async (req, res) => {
    const mapId = String(req.params.mapId || '').trim();
    const parsed = parsePresenceSources(req.query?.sources);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const scope = await resolveScopedMapFilter(req.auth || null, mapId);
    if (scope.forbidden) return res.status(403).json(MAP_OUT_OF_SCOPE);
    // Hors surface ou inexistante : même réponse, pour ne pas apprendre au curieux quelles
    // cartes existent sans être publiées (comme `intersectSurfaceMapScope`).
    const surfaceScope = intersectSurfaceMapScope(req.locationSurface, scope.mapIds, mapId);
    if (surfaceScope.notFound || !(await mapExists(mapId))) {
      return res.status(404).json({ error: 'Carte introuvable' });
    }
    const db = { queryAll, queryOne };
    const [species, visible] = await Promise.all([
      listSpeciesForMap(db, mapId, { sources: parsed.sources }),
      loadVisiblePlaceIds(db, mapId, req.locationSurface),
    ]);
    const shown = restrictPresencePlaces(species, visible);
    res.json({
      map_id: mapId,
      sources: parsed.sources,
      summary: summarizePresence(shown),
      species: shown.map(serializePresenceEntry),
    });
  }),
);

module.exports = router;
module.exports.invalidateMapsListCache = invalidateMapsListCache;
