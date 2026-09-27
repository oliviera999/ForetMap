/**
 * Observations d'espèces signalées sans réseau (migration 307 ; piste D de l'audit du
 * 25/09/2026, § 1.4.6 et § 2.4), sur le modèle de `journalDraftQueue.js` et de
 * `plantObservationQueue.js` : file dans le stockage local, **propre à chaque compte**, rejouée
 * au retour du réseau. Chaque observation porte sa clé `client_uuid` : renvoyée, elle n'est
 * enregistrée qu'une fois par le serveur.
 *
 * Un refus définitif du serveur (espèce supprimée, lieu retiré…) ne jette jamais le texte :
 * l'observation reste, marquée en échec avec le message du serveur, jusqu'à ce que l'élève la
 * supprime (`onRefusal: 'keep'`).
 *
 * Ce qui attend le réseau : la **photo** (plusieurs centaines de Ko dans un stockage local
 * limité et partagé, lisible par l'élève suivant sur une tablette commune). L'élève en est
 * prévenu au moment d'enregistrer.
 */

import { createOfflineQueue, newClientUuid } from './offlineActionQueue.js';

export const SPECIES_OBSERVATION_QUEUE_STORAGE_KEY = 'foretmap_species_observation_queue';
/** Borne de sécurité : une file qui grossit sans fin signale un autre problème. */
export const SPECIES_OBSERVATION_QUEUE_MAX = 50;
/** Même plafond que le serveur (`OBSERVATION_TEXT_MAX`). */
export const SPECIES_OBSERVATION_TEXT_MAX = 2000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {{ user_id: string, client_uuid: string, map_id: string, zone_id: string|null,
 *   marker_id: string|null, plant_id: number|null, observed_at: string,
 *   detection_mode: string|null, text: string, plant_label: string, place_label: string,
 *   refused: boolean, error: string, queued_at: number }} QueuedSpeciesObservation
 */

function optionalString(value, max = 64) {
  const s = value == null ? '' : String(value).trim();
  return s ? s.slice(0, max) : null;
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mapId = optionalString(raw.map_id, 32);
  if (!mapId) return null;
  const text = typeof raw.text === 'string' ? raw.text : '';
  if (text.length > SPECIES_OBSERVATION_TEXT_MAX) return null;
  const plantId = Number(raw.plant_id);
  const plant = Number.isInteger(plantId) && plantId > 0 ? plantId : null;
  if (!plant && !text.trim()) return null;
  const observedAt = String(raw.observed_at || '');
  if (!DATE_RE.test(observedAt)) return null;
  return {
    user_id: raw.user_id,
    client_uuid: raw.client_uuid,
    map_id: mapId,
    zone_id: optionalString(raw.zone_id),
    marker_id: optionalString(raw.marker_id),
    plant_id: plant,
    observed_at: observedAt,
    detection_mode: optionalString(raw.detection_mode, 16),
    text,
    plant_label: String(raw.plant_label || '').slice(0, 120),
    place_label: String(raw.place_label || '').slice(0, 120),
    refused: !!raw.refused,
    error: raw.error ? String(raw.error).slice(0, 500) : '',
    queued_at: Number.isFinite(Number(raw.queued_at)) ? Number(raw.queued_at) : 0,
  };
}

const queue = createOfflineQueue({
  storageKey: SPECIES_OBSERVATION_QUEUE_STORAGE_KEY,
  max: SPECIES_OBSERVATION_QUEUE_MAX,
  normalize,
});

/** Clé d'idempotence d'une observation (une par ouverture du formulaire). */
export const newSpeciesObservationClientUuid = () => newClientUuid('sobs');

/**
 * Met une observation en file.
 * @returns {boolean} vrai si elle est gardée sur l'appareil — sinon, ne rien promettre à l'élève
 */
export const enqueueSpeciesObservation = (item) => queue.enqueue(item);

/** Observations en attente d'un compte, dans l'ordre d'arrivée. */
export const listQueuedSpeciesObservations = (userId) => queue.listFor(userId);

export const removeQueuedSpeciesObservation = (clientUuid) => queue.remove(clientUuid);

/** Corps de `POST /api/species-observations` pour une entrée de la file. */
export function speciesObservationRequestBody(item) {
  const body = {
    client_uuid: item.client_uuid,
    map_id: item.map_id,
    observed_at: item.observed_at,
  };
  if (item.zone_id) body.zone_id = item.zone_id;
  if (item.marker_id) body.marker_id = item.marker_id;
  if (item.plant_id) body.plant_id = item.plant_id;
  if (item.detection_mode) body.detection_mode = item.detection_mode;
  if (item.text && item.text.trim()) body.text = item.text.trim();
  return body;
}

/**
 * Envoie les observations en attente du compte connecté (une à la fois, dans l'ordre).
 * @param {(item: QueuedSpeciesObservation) => Promise<unknown>} send
 * @param {string|null|undefined} userId
 */
export function flushSpeciesObservationQueue(send, userId) {
  return queue.flush(send, userId, { onRefusal: 'keep' });
}
