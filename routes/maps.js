const express = require('express');
const { queryAll } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { getNamedMemoryTtlCache } = require('../lib/memoryTtlCache');
const { normalizeMapImageUrl } = require('../lib/mapImageUrl');
const { withMapGeoref } = require('../lib/mapGeoref');
const { authenticate } = require('../middleware/requireTeacher');
const { getAllowedMapIdsForAuth, filterMapsByAllowedIds } = require('../lib/mapAccess');
const { withLocationSurface } = require('../lib/surfaceAccess');

const router = express.Router();
// Le cache porte le catalogue COMPLET, jamais une réponse déjà filtrée : le périmètre
// dépend du compte et s'applique après coup, en mémoire. Servir une entrée filtrée sous
// une clé partagée fuiterait le périmètre d'un élève à toute la classe suivante.
const mapsListCache = getNamedMemoryTtlCache('maps:list:v3', { ttlMs: 20000, maxEntries: 5 });

async function loadAllMaps() {
  const cached = mapsListCache.get('all');
  if (cached) return cached;
  let rows = [];
  try {
    rows = await queryAll(
      'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active, geo_anchors_json, gps_enabled, heading_up_enabled, scale_compass_enabled FROM maps ORDER BY sort_order ASC, label ASC',
    );
  } catch (e) {
    if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
    rows = await queryAll(
      'SELECT id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active, NULL AS geo_anchors_json, 0 AS gps_enabled, 0 AS heading_up_enabled, 1 AS scale_compass_enabled FROM maps ORDER BY sort_order ASC, label ASC',
    );
  }
  const payload = rows.map((row) =>
    withMapGeoref({
      ...row,
      map_image_url: normalizeMapImageUrl(row.id, row.map_image_url),
      is_active: !!row.is_active,
    }),
  );
  mapsListCache.set('all', payload);
  return payload;
}

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

function invalidateMapsListCache() {
  mapsListCache.delete('all');
}

module.exports = router;
module.exports.invalidateMapsListCache = invalidateMapsListCache;
