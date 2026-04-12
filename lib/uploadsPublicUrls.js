'use strict';

const fs = require('fs');
const { getAbsolutePath } = require('./uploads');

/** Segment identifiant zone/repère/tâche (VARCHAR 64 côté schéma). */
const ID_SEG = '[a-zA-Z0-9._-]{1,64}';

function isBaseSafeRelativePath(rel) {
  const s = rel != null ? String(rel).trim() : '';
  if (!s || s.includes('..') || s.includes('\\')) return false;
  return true;
}

/** Couverture / image tâche : `tasks/{id}.(jpg|png|webp)` — aligné sur l’existant `routes/tasks.js`. */
function isSafePublicTaskImageRelativePath(rel) {
  const s = rel != null ? String(rel).trim() : '';
  if (!isBaseSafeRelativePath(s)) return false;
  if (!s.startsWith('tasks/')) return false;
  const rest = s.slice('tasks/'.length);
  return /^[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(rest);
}

/** Photo zone carte : `zones/{zoneId}/{photoId}.ext` */
function isSafePublicZonePhotoRelativePath(rel) {
  const s = rel != null ? String(rel).trim() : '';
  if (!isBaseSafeRelativePath(s)) return false;
  return new RegExp(`^zones/${ID_SEG}/\\d+\\.(jpe?g|png|webp)$`, 'i').test(s);
}

/** Photo repère carte : `markers/{markerId}/{photoId}.ext` */
function isSafePublicMarkerPhotoRelativePath(rel) {
  const s = rel != null ? String(rel).trim() : '';
  if (!isBaseSafeRelativePath(s)) return false;
  return new RegExp(`^markers/${ID_SEG}/\\d+\\.(jpe?g|png|webp)$`, 'i').test(s);
}

/** Vignette JPEG dérivée : `zones/.../5.thumb.jpg` */
function isSafePublicZonePhotoThumbRelativePath(rel) {
  const s = rel != null ? String(rel).trim() : '';
  if (!isBaseSafeRelativePath(s)) return false;
  return new RegExp(`^zones/${ID_SEG}/\\d+\\.thumb\\.jpe?g$`, 'i').test(s);
}

function isSafePublicMarkerPhotoThumbRelativePath(rel) {
  const s = rel != null ? String(rel).trim() : '';
  if (!isBaseSafeRelativePath(s)) return false;
  return new RegExp(`^markers/${ID_SEG}/\\d+\\.thumb\\.jpe?g$`, 'i').test(s);
}

function publicUploadsUrlFromRelativePath(rel) {
  const s = rel != null ? String(rel).trim() : '';
  if (!s) return null;
  return `/uploads/${s}`;
}

/**
 * URL « plein » pour une photo zone : `/uploads/...` si chemin canonique, sinon route API historique.
 */
function zoneMapPhotoImageUrl(imagePath, zoneId, photoId) {
  const rel = imagePath != null ? String(imagePath).trim() : '';
  if (rel && isSafePublicZonePhotoRelativePath(rel)) return publicUploadsUrlFromRelativePath(rel);
  const tid = encodeURIComponent(String(zoneId));
  const pid = Number(photoId);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return `/api/zones/${tid}/photos/${pid}/data`;
}

function markerMapPhotoImageUrl(imagePath, markerId, photoId) {
  const rel = imagePath != null ? String(imagePath).trim() : '';
  if (rel && isSafePublicMarkerPhotoRelativePath(rel)) return publicUploadsUrlFromRelativePath(rel);
  const tid = encodeURIComponent(String(markerId));
  const pid = Number(photoId);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return `/api/map/markers/${tid}/photos/${pid}/data`;
}

/** `zones/z/5.jpg` → `zones/z/5.thumb.jpg` ; idem repères. */
function companionMapPhotoThumbRelativePath(mainRelativePath) {
  const s = mainRelativePath != null ? String(mainRelativePath).trim() : '';
  if (!s || /\.thumb\.jpe?g$/i.test(s)) return null;
  return s.replace(/\.(jpe?g|png|webp)$/i, '.thumb.jpg');
}

function resolveMapPhotoThumbUrl(imagePath, kind) {
  const rel = imagePath != null ? String(imagePath).trim() : '';
  if (!rel) return null;
  const thumbRel = companionMapPhotoThumbRelativePath(rel);
  if (!thumbRel) return null;
  const safe =
    kind === 'zone'
      ? isSafePublicZonePhotoThumbRelativePath(thumbRel)
      : kind === 'marker'
        ? isSafePublicMarkerPhotoThumbRelativePath(thumbRel)
        : false;
  if (!safe) return null;
  try {
    if (!fs.existsSync(getAbsolutePath(thumbRel))) return null;
  } catch (_) {
    return null;
  }
  return publicUploadsUrlFromRelativePath(thumbRel);
}

function serializeZonePhotoListRow(p, zoneId) {
  const image_url = zoneMapPhotoImageUrl(p.image_path, zoneId, p.id);
  const thumb_url = resolveMapPhotoThumbUrl(p.image_path, 'zone');
  return { ...p, image_url, thumb_url };
}

function serializeMarkerPhotoListRow(p, markerId) {
  const image_url = markerMapPhotoImageUrl(p.image_path, markerId, p.id);
  const thumb_url = resolveMapPhotoThumbUrl(p.image_path, 'marker');
  return { ...p, image_url, thumb_url };
}

/**
 * Redirection 302 vers `/uploads/...` si le fichier suit le format public, sinon `null` (continuer avec sendFile).
 */
function redirectIfPublicZonePhotoDataUrl(imagePath, zoneId, photoId) {
  const rel = imagePath != null ? String(imagePath).trim() : '';
  if (rel && isSafePublicZonePhotoRelativePath(rel)) return publicUploadsUrlFromRelativePath(rel);
  return null;
}

function redirectIfPublicMarkerPhotoDataUrl(imagePath, markerId, photoId) {
  const rel = imagePath != null ? String(imagePath).trim() : '';
  if (rel && isSafePublicMarkerPhotoRelativePath(rel)) return publicUploadsUrlFromRelativePath(rel);
  return null;
}

module.exports = {
  isSafePublicTaskImageRelativePath,
  isSafePublicZonePhotoRelativePath,
  isSafePublicMarkerPhotoRelativePath,
  isSafePublicZonePhotoThumbRelativePath,
  isSafePublicMarkerPhotoThumbRelativePath,
  companionMapPhotoThumbRelativePath,
  zoneMapPhotoImageUrl,
  markerMapPhotoImageUrl,
  resolveMapPhotoThumbUrl,
  serializeZonePhotoListRow,
  serializeMarkerPhotoListRow,
  redirectIfPublicZonePhotoDataUrl,
  redirectIfPublicMarkerPhotoDataUrl,
};
