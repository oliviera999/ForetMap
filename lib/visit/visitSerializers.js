'use strict';

/**
 * O10 — couche service « visite » : sérialiseurs purs (médias de visite, photos de carte,
 * sanitizers de cible) extraits de `routes/visit.js`. Comportement identique. Aucune dépendance DB.
 */

const { zoneMapPhotoImageUrl, markerMapPhotoImageUrl, resolveMapPhotoThumbUrl } = require('../uploadsPublicUrls');

const TARGET_TYPES = new Set(['zone', 'marker']);

function sanitizeTargetType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (!TARGET_TYPES.has(type)) return null;
  return type;
}

function sanitizeTargetId(value) {
  const id = String(value || '').trim();
  return id || null;
}

/** URL affichée côté client : fichier local ou lien externe. */
function visitMediaPublicImageUrl(row) {
  if (!row) return '';
  if (row.image_path) return `/api/visit/media/${row.id}/data`;
  return String(row.image_url || '').trim();
}

/** Réponse API / contenu public : pas d’exposition de `image_path`. */
function serializeVisitMedia(row) {
  if (!row) return row;
  const { image_path: _p, ...rest } = row;
  return { ...rest, image_url: visitMediaPublicImageUrl(row) };
}

/**
 * Première ligne conservée par cible : `rows` triées par identifiant cible puis **`sort_order` ASC** (ordre galerie carte ;
 * aligné sur `GET /api/zones/:id/photos` et `GET /api/map/markers/:id/photos`).
 */
function pickNewestMapPhotoByTarget(rows, targetIdField = 'target_id') {
  const m = new Map();
  for (const r of rows) {
    const key = String(r[targetIdField] ?? '');
    if (!key || m.has(key)) continue;
    m.set(key, r);
  }
  return m;
}

/** Vignette issue de `zone_photos` / `marker_photos` (même `id` zone/repère qu’après sync carte → visite). */
function serializeMapLeadPhoto(kind, targetId, row) {
  if (!row || row.id == null) return null;
  const pid = Number(row.id);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  const pathCol = row.image_path != null ? String(row.image_path).trim() : '';
  const image_url =
    kind === 'zone'
      ? zoneMapPhotoImageUrl(pathCol || null, targetId, pid)
      : markerMapPhotoImageUrl(pathCol || null, targetId, pid);
  const thumb_url = pathCol ? resolveMapPhotoThumbUrl(pathCol, kind) : null;
  return { id: pid, image_url, thumb_url, caption: String(row.caption || '').trim() };
}

/** Autres photos galerie carte (après la première, même tri que `map_lead_photo`). */
function serializeMapExtraPhotos(kind, targetId, allRows, targetIdField = 'target_id') {
  const tid = String(targetId);
  const forTarget = (allRows || []).filter((r) => String(r[targetIdField] ?? '') === tid);
  if (forTarget.length <= 1) return [];
  return forTarget
    .slice(1)
    .map((row) => serializeMapLeadPhoto(kind, targetId, row))
    .filter(Boolean);
}

module.exports = {
  TARGET_TYPES,
  sanitizeTargetType,
  sanitizeTargetId,
  visitMediaPublicImageUrl,
  serializeVisitMedia,
  pickNewestMapPhotoByTarget,
  serializeMapLeadPhoto,
  serializeMapExtraPhotos,
};
