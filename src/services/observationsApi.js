import { api } from './api';

/**
 * Client API des observations d'espèces (migration 307, `routes/species-observations.js`).
 *
 * Une observation est **soumise** par son auteur, puis **validée** ou **refusée** par un
 * enseignant (`observations.validate`). La validation confirme la présence de l'espèce sur la
 * carte (« confirmée sur le site »). Toutes les fonctions lèvent les erreurs de `api()`
 * (`err.status`, `err.message` en français).
 */

const BASE = '/api/species-observations';

/**
 * Soumet une observation. Avec `client_uuid`, un renvoi (file hors ligne, réponse perdue) ne
 * crée pas de doublon : le serveur rejoue la première réponse (`replayed: true`).
 * @param {{ client_uuid?: string, map_id: string, zone_id?: string|null, marker_id?: string|null,
 *   plant_id?: number|null, observed_at?: string, detection_mode?: string|null, text?: string }} body
 * @returns {Promise<{ observation: object, replayed: boolean }>}
 */
export function createSpeciesObservation(body) {
  return api(BASE, 'POST', body);
}

/** @returns {Promise<{ items: object[] }>} mes observations, les plus récentes d'abord */
export function listMySpeciesObservations() {
  return api(`${BASE}/me`);
}

export function deleteSpeciesObservation(id) {
  return api(`${BASE}/${encodeURIComponent(id)}`, 'DELETE');
}

/** Photo (data URL JPEG/PNG/WebP, compressée côté client) — réseau requis. */
export function uploadSpeciesObservationPhoto(id, imageData) {
  return api(`${BASE}/${encodeURIComponent(id)}/photos`, 'POST', { imageData });
}

export function deleteSpeciesObservationPhoto(id, photoId) {
  return api(`${BASE}/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`, 'DELETE');
}

/**
 * File d'examen de l'enseignant.
 * @param {{ mapId?: string|null, status?: 'soumise'|'validee'|'refusee'|'all', limit?: number }} [filters]
 * @returns {Promise<{ items: object[], counts: { soumise: number, validee: number, refusee: number } }>}
 */
export function listSpeciesObservationsForReview({ mapId = null, status = 'soumise', limit } = {}) {
  const qs = new URLSearchParams();
  if (mapId) qs.set('map_id', String(mapId));
  if (status) qs.set('status', String(status));
  if (limit) qs.set('limit', String(limit));
  const query = qs.toString();
  return api(`${BASE}/review${query ? `?${query}` : ''}`);
}

/**
 * Décision de l'enseignant.
 * @param {number} id
 * @param {{ decision: 'validee'|'refusee', plantId?: number|null, note?: string }} input
 */
export function decideSpeciesObservation(id, { decision, plantId = null, note = '' }) {
  const body = { decision };
  if (plantId) body.plant_id = Number(plantId);
  if (note && String(note).trim()) body.note = String(note).trim();
  return api(`${BASE}/${encodeURIComponent(id)}/decision`, 'POST', body);
}

/** Relations du réseau trophique où figure l'espèce observée (candidates à une preuve). */
export function listObservationInteractionCandidates(id) {
  return api(`${BASE}/${encodeURIComponent(id)}/interactions`);
}

export function attachObservationEvidence(id, interactionId) {
  return api(`${BASE}/${encodeURIComponent(id)}/interaction-evidence`, 'POST', {
    interaction_id: Number(interactionId),
  });
}

export function detachObservationEvidence(id, interactionId) {
  return api(
    `${BASE}/${encodeURIComponent(id)}/interaction-evidence/${encodeURIComponent(interactionId)}`,
    'DELETE',
  );
}
