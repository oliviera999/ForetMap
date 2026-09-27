'use strict';

/**
 * Accès aux données des observations d'espèces (migration 306) — SQL seulement.
 *
 * Chaque fonction reçoit l'exécuteur `dbx` en premier argument : le module `database.js`
 * (requêtes isolées) ou la transaction de `withTransaction` (mêmes `queryAll` / `queryOne` /
 * `execute`), sur le modèle de `lib/tasks/taskQueries.js`. Aucune règle métier ici : elles
 * vivent dans `observationService.js`.
 *
 * Toutes les requêtes sont paramétrées ; les seules parties construites sont des listes de
 * `?` et des fragments constants.
 */

/** Colonnes publiques d'une observation, dates rendues en chaînes (aucun décalage de fuseau). */
const OBSERVATION_SELECT = `
  SELECT o.id, o.observer_user_id, o.map_id, o.zone_id, o.marker_id, o.plant_id,
         DATE_FORMAT(o.observed_at, '%Y-%m-%d') AS observed_at,
         o.detection_mode, o.body, o.status, o.decision_note, o.validated_by,
         DATE_FORMAT(o.decided_at, '%Y-%m-%dT%H:%i:%s') AS decided_at,
         o.journal_article_id, o.client_uuid,
         DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
         DATE_FORMAT(o.updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at,
         m.label AS map_label, z.name AS zone_name, mk.label AS marker_label,
         p.name AS plant_name, p.emoji AS plant_emoji,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.pseudo) AS observer_name,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', v.first_name, v.last_name)), ''), v.pseudo) AS validator_name
    FROM species_observations o
    JOIN maps m ON m.id = o.map_id
    LEFT JOIN zones z ON z.id = o.zone_id
    LEFT JOIN map_markers mk ON mk.id = o.marker_id
    LEFT JOIN plants p ON p.id = o.plant_id
    LEFT JOIN users u ON u.id = o.observer_user_id
    LEFT JOIN users v ON v.id = o.validated_by`;

function placeholders(list) {
  return list.map(() => '?').join(', ');
}

async function getObservationRow(dbx, id) {
  return dbx.queryOne(`${OBSERVATION_SELECT} WHERE o.id = ?`, [id]);
}

/** Ligne brute verrouillée pour la durée de la transaction (décision, rattachement). */
async function lockObservation(tx, id) {
  return tx.queryOne(
    `SELECT id, observer_user_id, map_id, plant_id, status, detection_mode,
            DATE_FORMAT(observed_at, '%Y-%m-%d') AS observed_at
       FROM species_observations WHERE id = ? FOR UPDATE`,
    [id],
  );
}

async function findByObserverClientUuid(dbx, observerId, clientUuid) {
  return dbx.queryOne(
    'SELECT id FROM species_observations WHERE observer_user_id = ? AND client_uuid = ? LIMIT 1',
    [observerId, clientUuid],
  );
}

async function insertObservation(dbx, row) {
  const result = await dbx.execute(
    `INSERT INTO species_observations
       (observer_user_id, map_id, zone_id, marker_id, plant_id, observed_at, detection_mode,
        body, status, journal_article_id, client_uuid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'soumise', ?, ?)`,
    [
      row.observerId,
      row.mapId,
      row.zoneId,
      row.markerId,
      row.plantId,
      row.observedAt,
      row.detectionMode,
      row.text,
      row.journalArticleId,
      row.clientUuid,
    ],
  );
  return result.insertId;
}

async function markDecision(tx, id, { status, plantId, note, teacherId }) {
  return tx.execute(
    `UPDATE species_observations
        SET status = ?, plant_id = ?, decision_note = ?, validated_by = ?, decided_at = NOW()
      WHERE id = ? AND status = 'soumise'`,
    [status, plantId, note, teacherId, id],
  );
}

async function deleteObservation(dbx, id) {
  return dbx.execute('DELETE FROM species_observations WHERE id = ?', [id]);
}

/**
 * Observations d'un observateur, les plus récentes d'abord. `limit` passé en chaîne : mysql2
 * encoderait un nombre JS en DOUBLE, refusé par MySQL pour LIMIT.
 */
async function listByObserver(dbx, observerId, limit) {
  return dbx.queryAll(
    `${OBSERVATION_SELECT} WHERE o.observer_user_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT ?`,
    [observerId, String(limit)],
  );
}

/**
 * File d'examen : filtre carte (`mapIds` null = toutes) et statut (null = tous).
 * Les observations soumises d'abord les plus anciennes (premier arrivé, premier examiné),
 * les autres les plus récentes d'abord.
 */
async function listForReview(dbx, { mapIds, status, limit }) {
  const where = [];
  const params = [];
  if (Array.isArray(mapIds)) {
    if (mapIds.length === 0) return [];
    where.push(`o.map_id IN (${placeholders(mapIds)})`);
    params.push(...mapIds);
  }
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  const order =
    status === 'soumise' ? 'o.created_at ASC, o.id ASC' : 'o.created_at DESC, o.id DESC';
  params.push(String(limit));
  return dbx.queryAll(
    `${OBSERVATION_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${order} LIMIT ?`,
    params,
  );
}

async function countByStatus(dbx, { mapIds }) {
  const params = [];
  let where = '';
  if (Array.isArray(mapIds)) {
    if (mapIds.length === 0) return [];
    where = `WHERE map_id IN (${placeholders(mapIds)})`;
    params.push(...mapIds);
  }
  return dbx.queryAll(
    `SELECT status, COUNT(*) AS n FROM species_observations ${where} GROUP BY status`,
    params,
  );
}

async function listPhotosForObservations(dbx, observationIds) {
  if (!observationIds.length) return [];
  return dbx.queryAll(
    `SELECT id, observation_id, file_path, mime_type, byte_size
       FROM species_observation_photos
      WHERE observation_id IN (${placeholders(observationIds)})
      ORDER BY id ASC`,
    observationIds,
  );
}

async function listEvidenceForObservations(dbx, observationIds) {
  if (!observationIds.length) return [];
  return dbx.queryAll(
    `SELECT observation_id, interaction_id FROM interaction_evidence
      WHERE observation_id IN (${placeholders(observationIds)})
      ORDER BY interaction_id ASC`,
    observationIds,
  );
}

async function countPhotos(dbx, observationId) {
  const row = await dbx.queryOne(
    'SELECT COUNT(*) AS n FROM species_observation_photos WHERE observation_id = ?',
    [observationId],
  );
  return Number(row?.n) || 0;
}

async function insertPhoto(dbx, { observationId, filePath, mimeType, byteSize }) {
  const result = await dbx.execute(
    `INSERT INTO species_observation_photos (observation_id, file_path, mime_type, byte_size)
     VALUES (?, ?, ?, ?)`,
    [observationId, filePath, mimeType, byteSize],
  );
  return result.insertId;
}

async function getPhoto(dbx, photoId) {
  return dbx.queryOne(
    `SELECT ph.id, ph.observation_id, ph.file_path, ph.mime_type, ph.byte_size
       FROM species_observation_photos ph WHERE ph.id = ?`,
    [photoId],
  );
}

async function deletePhotoRow(dbx, photoId) {
  return dbx.execute('DELETE FROM species_observation_photos WHERE id = ?', [photoId]);
}

async function listPhotoPathsForObservation(dbx, observationId) {
  const rows = await dbx.queryAll(
    'SELECT file_path FROM species_observation_photos WHERE observation_id = ?',
    [observationId],
  );
  return rows.map((r) => String(r.file_path || '')).filter(Boolean);
}

async function listPhotoPathsForObserver(dbx, observerId) {
  const rows = await dbx.queryAll(
    `SELECT ph.file_path FROM species_observation_photos ph
       JOIN species_observations o ON o.id = ph.observation_id
      WHERE o.observer_user_id = ?`,
    [observerId],
  );
  return rows.map((r) => String(r.file_path || '')).filter(Boolean);
}

async function mapExists(dbx, mapId) {
  return !!(await dbx.queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]));
}

async function getZone(dbx, zoneId) {
  return dbx.queryOne(
    'SELECT id, map_id, name, visible_role_slugs, visible_group_ids FROM zones WHERE id = ?',
    [zoneId],
  );
}

async function getMarker(dbx, markerId) {
  return dbx.queryOne(
    'SELECT id, map_id, label, visible_role_slugs, visible_group_ids FROM map_markers WHERE id = ?',
    [markerId],
  );
}

async function plantExists(dbx, plantId) {
  return !!(await dbx.queryOne('SELECT id FROM plants WHERE id = ? LIMIT 1', [plantId]));
}

async function userExists(dbx, userId) {
  return !!(await dbx.queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]));
}

async function journalArticleOwnedBy(dbx, articleId, userId) {
  return !!(await dbx.queryOne(
    'SELECT id FROM user_journal_articles WHERE id = ? AND user_id = ? LIMIT 1',
    [articleId, userId],
  ));
}

// --- Registre de présence (`map_species`) -----------------------------------------------

async function lockMapSpecies(tx, mapId, plantId) {
  return tx.queryOne(
    `SELECT validation_status, DATE_FORMAT(first_record_at, '%Y-%m-%d') AS first_record_at,
            first_record_by
       FROM map_species WHERE map_id = ? AND plant_id = ? FOR UPDATE`,
    [mapId, plantId],
  );
}

/**
 * Confirme la présence d'une espèce sur une carte (invariants du § 3.2.4) :
 * `confirme_site` est le statut le plus fort — l'écrire n'est jamais une rétrogradation ;
 * la première mention n'est posée que si elle manque (`COALESCE`), une saisie éditoriale
 * n'est jamais écrasée ; le mode de détection n'est renseigné qu'à la création de la ligne.
 *
 * @returns {Promise<{ affectedRows: number }>} 1 = ligne créée, 2 = ligne modifiée,
 *   0 = rien à changer (MySQL / MariaDB, `INSERT … ON DUPLICATE KEY UPDATE`)
 */
async function upsertConfirmedMapSpecies(
  tx,
  { mapId, plantId, observedAt, recordedBy, detectionMode },
) {
  return tx.execute(
    `INSERT INTO map_species
       (map_id, plant_id, validation_status, first_record_at, first_record_by, detection_mode)
     VALUES (?, ?, 'confirme_site', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       validation_status = 'confirme_site',
       first_record_at = COALESCE(first_record_at, ?),
       first_record_by = COALESCE(first_record_by, ?)`,
    [mapId, plantId, observedAt, recordedBy, detectionMode, observedAt, recordedBy],
  );
}

// --- Preuves d'interaction ----------------------------------------------------------------

async function lockInteraction(tx, interactionId) {
  return tx.queryOne(
    `SELECT id, from_plant_id, to_plant_id, interaction_type, evidence_level
       FROM species_interactions WHERE id = ? FOR UPDATE`,
    [interactionId],
  );
}

async function insertEvidence(tx, { interactionId, observationId, createdBy }) {
  return tx.execute(
    `INSERT IGNORE INTO interaction_evidence (interaction_id, observation_id, created_by)
     VALUES (?, ?, ?)`,
    [interactionId, observationId, createdBy],
  );
}

async function deleteEvidence(tx, { interactionId, observationId }) {
  return tx.execute(
    'DELETE FROM interaction_evidence WHERE interaction_id = ? AND observation_id = ?',
    [interactionId, observationId],
  );
}

/** `observe_site` sur une interaction (jamais de rétrogradation : l'écriture ne fait que monter). */
async function markInteractionObserved(tx, interactionId) {
  return tx.execute(
    `UPDATE species_interactions SET evidence_level = 'observe_site'
      WHERE id = ? AND evidence_level <> 'observe_site'`,
    [interactionId],
  );
}

/** À la validation : toutes les interactions dont l'observation est la preuve passent à `observe_site`. */
async function markInteractionsObservedForObservation(tx, observationId) {
  return tx.execute(
    `UPDATE species_interactions si
       JOIN interaction_evidence ie ON ie.interaction_id = si.id
        SET si.evidence_level = 'observe_site'
      WHERE ie.observation_id = ? AND si.evidence_level <> 'observe_site'`,
    [observationId],
  );
}

/** Interactions du réseau où figure l'espèce (candidates à une preuve), avec les noms. */
async function listInteractionsForPlant(dbx, plantId, observationId) {
  return dbx.queryAll(
    `SELECT si.id, si.interaction_type, si.evidence_level,
            si.from_plant_id, pf.name AS from_name, pf.emoji AS from_emoji,
            si.to_plant_id, pt.name AS to_name, pt.emoji AS to_emoji,
            EXISTS(SELECT 1 FROM interaction_evidence ie
                    WHERE ie.interaction_id = si.id AND ie.observation_id = ?) AS attached
       FROM species_interactions si
       JOIN plants pf ON pf.id = si.from_plant_id
       LEFT JOIN plants pt ON pt.id = si.to_plant_id
      WHERE si.from_plant_id = ? OR si.to_plant_id = ?
      ORDER BY pf.name ASC, pt.name ASC, si.id ASC
      LIMIT 200`,
    [observationId, plantId, plantId],
  );
}

module.exports = {
  getObservationRow,
  lockObservation,
  findByObserverClientUuid,
  insertObservation,
  markDecision,
  deleteObservation,
  listByObserver,
  listForReview,
  countByStatus,
  listPhotosForObservations,
  listEvidenceForObservations,
  countPhotos,
  insertPhoto,
  getPhoto,
  deletePhotoRow,
  listPhotoPathsForObservation,
  listPhotoPathsForObserver,
  mapExists,
  getZone,
  getMarker,
  plantExists,
  userExists,
  journalArticleOwnedBy,
  lockMapSpecies,
  upsertConfirmedMapSpecies,
  lockInteraction,
  insertEvidence,
  deleteEvidence,
  markInteractionObserved,
  markInteractionsObservedForObservation,
  listInteractionsForPlant,
};
