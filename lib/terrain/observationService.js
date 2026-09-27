'use strict';

/**
 * Service d'observation et de validation (terrain × biodiversité) — audit du 25/09/2026,
 * § 3.2.4, piste C. Aucune dépendance à Express : les routes (`routes/species-observations.js`)
 * valident la forme des requêtes et les droits, ce module tient les règles métier.
 *
 * Cycle de vie : une observation est **soumise** par son auteur (élève ou enseignant), puis
 * **validée** ou **refusée** par un enseignant. La décision est définitive : une observation
 * décidée ne change plus de statut (redire la même décision est sans effet).
 *
 * Invariants tenus ici :
 *  1. À la validation, dans **une** transaction : l'observation passe à `validee`, puis
 *     `map_species` reçoit `validation_status = 'confirme_site'` par
 *     `INSERT … ON DUPLICATE KEY UPDATE`, avec `first_record_at = COALESCE(first_record_at,
 *     observed_at)` et `first_record_by = COALESCE(first_record_by, observateur)`.
 *  2. Jamais de rétrogradation : `confirme_site` est le statut le plus fort du registre et le
 *     service n'en écrit aucun autre ; un refus, une suppression ou un rattachement ne touchent
 *     jamais au registre. Même règle pour `species_interactions.evidence_level`.
 *  3. `observe_site` ⇔ au moins une preuve validée : une interaction passe à `observe_site`
 *     quand une observation **validée** en devient la preuve, ou quand la preuve rattachée est
 *     validée. Une observation validée ne peut donc être ni supprimée ni détachée d'une preuve.
 *  4. Chaque décision et chaque rattachement laissent une entrée d'audit (`lib/auditLog.js`),
 *     écrite après le commit — le journal ne décrit que ce qui a eu lieu.
 *  5. Photo = fichier + ligne, supprimés ensemble ; métadonnées EXIF retirées à l'écriture
 *     (`lib/uploads.js` → `lib/imageMetadata.js`).
 *  6. Idempotence hors ligne : une même clé `client_uuid` (par observateur) ne crée qu'une
 *     observation ; un renvoi rejoue la réponse.
 *
 * « J'ai découvert » (`user_plant_observation_events`) reste un acquis d'apprentissage et
 * n'est pas concerné ; le carnet reste le récit (article facultativement associé).
 *
 * Inspiration : le « Research Grade » d'iNaturalist (https://www.inaturalist.org/pages/help#quality)
 * et la validation des données des protocoles Vigie-Nature (https://www.vigienature.fr) — seul
 * le principe « soumise, puis vérifiée par quelqu'un d'autre que l'observateur » est repris.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const database = require('../../database');
const repo = require('./observationRepository');
const { writeBufferToDisk, deleteFile, getAbsolutePath, assertUploadSize } = require('../uploads');
const { logAudit } = require('../auditLog');

const OBSERVATION_STATUS = Object.freeze({
  SUBMITTED: 'soumise',
  VALIDATED: 'validee',
  REFUSED: 'refusee',
});
const OBSERVATION_STATUSES = Object.freeze(Object.values(OBSERVATION_STATUS));
const DECISIONS = Object.freeze([OBSERVATION_STATUS.VALIDATED, OBSERVATION_STATUS.REFUSED]);
/** Vocabulaire de `map_species.detection_mode`, une valeur par observation. */
const DETECTION_MODES = Object.freeze(['vue', 'chant', 'trace', 'indice', 'nocturne']);

const OBSERVATION_TEXT_MAX = 2000;
const DECISION_NOTE_MAX = 1000;
const MAX_PHOTOS_PER_OBSERVATION = 3;
const OBSERVER_LIST_MAX = 200;
const REVIEW_LIST_MAX = 200;
const CLIENT_UUID_RE = /^[A-Za-z0-9-]{8,64}$/;
/** Famille privée (`lib/uploadsPrivatePaths.js` : `observations/`), servie par la route API. */
const PHOTO_DIR = 'observations/species';
/** Tolérance sur la date d'observation (fuseau de l'appareil en avance d'un jour). */
const FUTURE_TOLERANCE_DAYS = 1;
const EARLIEST_OBSERVATION_DATE = '2000-01-01';

/** Erreur métier : l'appelant HTTP la traduit en `res.status(status).json({ error })`. */
class ObservationError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.name = 'ObservationError';
    this.status = status;
    if (code) this.code = code;
  }
}

function fail(status, message, code) {
  throw new ObservationError(status, message, code);
}

function positiveInt(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function optionalId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function optionalText(value, max, label) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) fail(400, `${label} : ${max} caractères au plus`);
  return s;
}

function localDateString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Date d'observation `YYYY-MM-DD` valide, ni avant 2000 ni dans le futur (tolérance d'un jour). */
function normalizeObservedAt(value, now) {
  if (value == null || value === '') return localDateString(now);
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(400, 'Date d’observation invalide (AAAA-MM-JJ)');
  const parsed = new Date(`${s}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || localDateString(parsed) !== s) {
    fail(400, 'Date d’observation invalide (AAAA-MM-JJ)');
  }
  const limit = new Date(now.getTime() + FUTURE_TOLERANCE_DAYS * 24 * 3600 * 1000);
  if (s > localDateString(limit)) fail(400, 'La date d’observation ne peut pas être dans le futur');
  if (s < EARLIEST_OBSERVATION_DATE) fail(400, 'Date d’observation trop ancienne');
  return s;
}

function isDuplicateEntry(err) {
  return err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY');
}

function photoUrl(photoId) {
  return `/api/species-observations/photos/${photoId}/file`;
}

/** Ligne SQL + photos + preuves → forme publique (API). */
function serializeObservation(row, photos = [], interactionIds = []) {
  if (!row) return null;
  return {
    id: Number(row.id),
    observer_user_id: row.observer_user_id,
    observer_name: row.observer_name || null,
    map_id: row.map_id,
    map_label: row.map_label || null,
    zone_id: row.zone_id || null,
    zone_name: row.zone_name || null,
    marker_id: row.marker_id || null,
    marker_label: row.marker_label || null,
    plant_id: row.plant_id == null ? null : Number(row.plant_id),
    plant_name: row.plant_name || null,
    plant_emoji: row.plant_emoji || null,
    observed_at: row.observed_at,
    detection_mode: row.detection_mode || null,
    text: row.body || '',
    status: row.status,
    decision_note: row.decision_note || null,
    validated_by: row.validated_by || null,
    validator_name: row.validator_name || null,
    decided_at: row.decided_at || null,
    journal_article_id: row.journal_article_id == null ? null : Number(row.journal_article_id),
    client_uuid: row.client_uuid || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    photos: photos.map((ph) => ({ id: Number(ph.id), url: photoUrl(ph.id) })),
    interaction_ids: interactionIds.map(Number),
  };
}

/** Rattache photos et preuves à une liste de lignes (deux requêtes, quelle que soit la taille). */
async function hydrateRows(dbx, rows) {
  const list = rows || [];
  const ids = list.map((r) => Number(r.id));
  const [photos, evidence] = await Promise.all([
    repo.listPhotosForObservations(dbx, ids),
    repo.listEvidenceForObservations(dbx, ids),
  ]);
  const photosById = new Map();
  for (const ph of photos) {
    const key = Number(ph.observation_id);
    if (!photosById.has(key)) photosById.set(key, []);
    photosById.get(key).push(ph);
  }
  const evidenceById = new Map();
  for (const ev of evidence) {
    const key = Number(ev.observation_id);
    if (!evidenceById.has(key)) evidenceById.set(key, []);
    evidenceById.get(key).push(ev.interaction_id);
  }
  return list.map((row) =>
    serializeObservation(
      row,
      photosById.get(Number(row.id)) || [],
      evidenceById.get(Number(row.id)) || [],
    ),
  );
}

/** Observation complète (photos, preuves), ou `null`. */
async function getObservation(id, dbx = database) {
  const obsId = positiveInt(id);
  if (!obsId) return null;
  const row = await repo.getObservationRow(dbx, obsId);
  if (!row) return null;
  const [one] = await hydrateRows(dbx, [row]);
  return one;
}

/**
 * Enregistre une observation soumise par son auteur.
 *
 * Les droits (carte dans le périmètre, lieu visible, profil autorisé) sont vérifiés par
 * l'appelant ; ici, la cohérence des données : lieu sur la bonne carte, zone OU repère,
 * espèce ou texte, date plausible, article de carnet appartenant à l'observateur.
 *
 * @returns {Promise<{ observation: object, replayed: boolean }>}
 */
async function recordObservation(
  {
    observerId,
    mapId,
    zoneId = null,
    markerId = null,
    plantId = null,
    observedAt = null,
    detectionMode = null,
    text = null,
    journalArticleId = null,
    clientUuid = null,
  },
  { now = new Date(), dbx = database } = {},
) {
  const observer = optionalId(observerId);
  if (!observer) fail(400, 'Observateur requis');
  const uuid = optionalId(clientUuid);
  if (uuid && !CLIENT_UUID_RE.test(uuid)) fail(400, 'client_uuid invalide');

  // Rejeu d'une observation déjà reçue (file hors ligne, réponse perdue) : aucune écriture.
  if (uuid) {
    const existing = await repo.findByObserverClientUuid(dbx, observer, uuid);
    if (existing) return { observation: await getObservation(existing.id, dbx), replayed: true };
  }

  const map = optionalId(mapId);
  if (!map) fail(400, 'Carte requise');
  if (!(await repo.mapExists(dbx, map))) fail(400, 'Carte introuvable');
  if (!(await repo.userExists(dbx, observer))) fail(401, 'Compte supprimé', 'ACCOUNT_DELETED');

  const zone = optionalId(zoneId);
  const marker = optionalId(markerId);
  if (zone && marker) fail(400, 'Choisis une zone ou un repère, pas les deux');
  if (zone) {
    const row = await repo.getZone(dbx, zone);
    if (!row || String(row.map_id) !== map) fail(400, 'Zone introuvable sur cette carte');
  }
  if (marker) {
    const row = await repo.getMarker(dbx, marker);
    if (!row || String(row.map_id) !== map) fail(400, 'Repère introuvable sur cette carte');
  }

  const plant = positiveInt(plantId);
  if (Number.isNaN(plant)) fail(400, 'Espèce invalide');
  if (plant && !(await repo.plantExists(dbx, plant))) fail(400, 'Espèce introuvable');

  const body = optionalText(text, OBSERVATION_TEXT_MAX, 'Observation');
  if (!plant && !body) fail(400, 'Indique l’espèce observée ou décris ce que tu as vu');

  const mode = optionalId(detectionMode);
  if (mode && !DETECTION_MODES.includes(mode)) fail(400, 'Mode de détection inconnu');

  const article = positiveInt(journalArticleId);
  if (Number.isNaN(article)) fail(400, 'Article de carnet invalide');
  if (article && !(await repo.journalArticleOwnedBy(dbx, article, observer))) {
    fail(400, 'Article de carnet introuvable');
  }

  let insertId;
  try {
    insertId = await repo.insertObservation(dbx, {
      observerId: observer,
      mapId: map,
      zoneId: zone,
      markerId: marker,
      plantId: plant,
      observedAt: normalizeObservedAt(observedAt, now),
      detectionMode: mode,
      text: body,
      journalArticleId: article,
      clientUuid: uuid,
    });
  } catch (err) {
    // Deux envois simultanés de la même clé : l'index unique tranche, le perdant rejoue.
    if (uuid && isDuplicateEntry(err)) {
      const existing = await repo.findByObserverClientUuid(dbx, observer, uuid);
      if (existing) return { observation: await getObservation(existing.id, dbx), replayed: true };
    }
    throw err;
  }
  return { observation: await getObservation(insertId, dbx), replayed: false };
}

/**
 * Décision d'un enseignant sur une observation soumise — **en transaction**.
 *
 * @param {number|string} id
 * @param {{ teacherId: string, decision: 'validee'|'refusee', plantId?: number|null,
 *   note?: string|null }} input `plantId` fixe ou corrige l'espèce à la validation
 * @param {{ audit?: { req?: object } }} [options] contexte opaque transmis au journal d'audit
 * @returns {Promise<{ observation: object, alreadyDecided: boolean,
 *   mapSpecies: null | { map_id: string, plant_id: number, previous_status: string|null,
 *     status: 'confirme_site', created: boolean },
 *   interactionsUpgraded: number }>}
 */
async function validateObservation(
  id,
  { teacherId, decision, plantId = null, note = null },
  options = {},
) {
  const obsId = positiveInt(id);
  if (!obsId) fail(400, 'Identifiant invalide');
  const teacher = optionalId(teacherId);
  if (!teacher) fail(400, 'Enseignant requis');
  if (!DECISIONS.includes(decision)) fail(400, 'Décision attendue : validee ou refusee');
  const correctedPlant = positiveInt(plantId);
  if (Number.isNaN(correctedPlant)) fail(400, 'Espèce invalide');
  const decisionNote = optionalText(note, DECISION_NOTE_MAX, 'Note');

  const outcome = await database.withTransaction(async (tx) => {
    const obs = await repo.lockObservation(tx, obsId);
    if (!obs) fail(404, 'Observation introuvable');
    if (obs.status !== OBSERVATION_STATUS.SUBMITTED) {
      // Décision définitive. Redire la même chose (double clic, deux enseignants) est sans
      // effet ; la contredire est refusé — sinon l'invariant « observe_site ⇔ preuve validée »
      // ne saurait plus quel niveau de preuve rétablir.
      if (obs.status === decision) {
        return { alreadyDecided: true, mapSpecies: null, interactionsUpgraded: 0, obs };
      }
      fail(409, 'Cette observation a déjà été traitée', 'ALREADY_DECIDED');
    }

    if (decision === OBSERVATION_STATUS.REFUSED) {
      await repo.markDecision(tx, obsId, {
        status: OBSERVATION_STATUS.REFUSED,
        plantId: obs.plant_id,
        note: decisionNote,
        teacherId: teacher,
      });
      return { alreadyDecided: false, mapSpecies: null, interactionsUpgraded: 0, obs };
    }

    const finalPlant = correctedPlant || (obs.plant_id == null ? null : Number(obs.plant_id));
    if (!finalPlant) fail(400, 'Choisis l’espèce observée avant de valider');
    if (correctedPlant && !(await repo.plantExists(tx, correctedPlant))) {
      fail(400, 'Espèce introuvable');
    }
    await repo.markDecision(tx, obsId, {
      status: OBSERVATION_STATUS.VALIDATED,
      plantId: finalPlant,
      note: decisionNote,
      teacherId: teacher,
    });
    const before = await repo.lockMapSpecies(tx, obs.map_id, finalPlant);
    await repo.upsertConfirmedMapSpecies(tx, {
      mapId: obs.map_id,
      plantId: finalPlant,
      observedAt: obs.observed_at,
      recordedBy: obs.observer_user_id,
      detectionMode: obs.detection_mode || null,
    });
    const upgraded = await repo.markInteractionsObservedForObservation(tx, obsId);
    return {
      alreadyDecided: false,
      obs,
      mapSpecies: {
        map_id: obs.map_id,
        plant_id: finalPlant,
        previous_status: before ? before.validation_status : null,
        status: 'confirme_site',
        created: !before,
      },
      interactionsUpgraded: Number(upgraded?.affectedRows) || 0,
    };
  });

  const observation = await getObservation(obsId);
  if (!outcome.alreadyDecided) {
    const validated = decision === OBSERVATION_STATUS.VALIDATED;
    await logAudit(
      validated ? 'validate_species_observation' : 'refuse_species_observation',
      'species_observation',
      obsId,
      validated
        ? `Observation ${obsId} validée : espèce ${outcome.mapSpecies.plant_id} confirmée sur la carte ${outcome.mapSpecies.map_id}`
        : `Observation ${obsId} refusée`,
      {
        req: options.audit?.req || null,
        ...(options.audit?.req ? {} : { actorUserType: 'teacher', actorUserId: teacher }),
        payload: {
          observer_user_id: outcome.obs.observer_user_id,
          map_id: outcome.obs.map_id,
          plant_id: observation?.plant_id ?? null,
          map_species: outcome.mapSpecies,
          interactions_upgraded: outcome.interactionsUpgraded,
        },
      },
    );
  }
  return {
    observation,
    alreadyDecided: outcome.alreadyDecided,
    mapSpecies: outcome.mapSpecies,
    interactionsUpgraded: outcome.interactionsUpgraded,
  };
}

/**
 * Rattache une observation comme preuve d'une interaction du réseau trophique.
 * L'observation doit porter sur l'une des deux espèces de la relation et ne pas être refusée ;
 * si elle est validée, l'interaction passe à `observe_site` (jamais l'inverse).
 *
 * @returns {Promise<{ attached: boolean, evidenceLevel: string, upgraded: boolean }>}
 */
async function attachInteractionEvidence(
  interactionId,
  observationId,
  { actorId = null, audit = null } = {},
) {
  const interaction = positiveInt(interactionId);
  const obsId = positiveInt(observationId);
  if (!interaction || !obsId) fail(400, 'Identifiant invalide');

  const outcome = await database.withTransaction(async (tx) => {
    const si = await repo.lockInteraction(tx, interaction);
    if (!si) fail(404, 'Interaction introuvable');
    const obs = await repo.lockObservation(tx, obsId);
    if (!obs) fail(404, 'Observation introuvable');
    if (obs.status === OBSERVATION_STATUS.REFUSED) {
      fail(409, 'Une observation refusée ne peut pas servir de preuve', 'OBSERVATION_REFUSED');
    }
    const plant = obs.plant_id == null ? null : Number(obs.plant_id);
    const species = [
      Number(si.from_plant_id),
      si.to_plant_id == null ? null : Number(si.to_plant_id),
    ];
    if (!plant || !species.includes(plant)) {
      fail(400, 'L’observation ne porte sur aucune des deux espèces de cette relation');
    }
    const inserted = await repo.insertEvidence(tx, {
      interactionId: interaction,
      observationId: obsId,
      createdBy: optionalId(actorId),
    });
    let upgraded = 0;
    if (obs.status === OBSERVATION_STATUS.VALIDATED) {
      upgraded = Number((await repo.markInteractionObserved(tx, interaction))?.affectedRows) || 0;
    }
    const evidenceLevel = upgraded > 0 ? 'observe_site' : String(si.evidence_level);
    return {
      attached: (Number(inserted?.affectedRows) || 0) > 0,
      evidenceLevel,
      upgraded: upgraded > 0,
      obs,
    };
  });

  if (outcome.attached) {
    await logAudit(
      'attach_interaction_evidence',
      'species_interaction',
      interaction,
      `Observation ${obsId} rattachée comme preuve de l’interaction ${interaction}`,
      {
        req: audit?.req || null,
        ...(audit?.req ? {} : { actorUserType: 'teacher', actorUserId: optionalId(actorId) }),
        payload: {
          observation_id: obsId,
          observation_status: outcome.obs.status,
          evidence_level: outcome.evidenceLevel,
          upgraded: outcome.upgraded,
        },
      },
    );
  }
  return {
    attached: outcome.attached,
    evidenceLevel: outcome.evidenceLevel,
    upgraded: outcome.upgraded,
  };
}

/**
 * Retire une preuve rattachée par erreur — seulement tant que l'observation n'est pas validée :
 * détacher une preuve validée pourrait laisser une interaction `observe_site` sans preuve.
 * @returns {Promise<{ detached: boolean }>}
 */
async function detachInteractionEvidence(
  interactionId,
  observationId,
  { actorId = null, audit = null } = {},
) {
  const interaction = positiveInt(interactionId);
  const obsId = positiveInt(observationId);
  if (!interaction || !obsId) fail(400, 'Identifiant invalide');
  const detached = await database.withTransaction(async (tx) => {
    const obs = await repo.lockObservation(tx, obsId);
    if (!obs) fail(404, 'Observation introuvable');
    if (obs.status === OBSERVATION_STATUS.VALIDATED) {
      fail(409, 'Une preuve validée ne se détache pas', 'EVIDENCE_VALIDATED');
    }
    const res = await repo.deleteEvidence(tx, { interactionId: interaction, observationId: obsId });
    return (Number(res?.affectedRows) || 0) > 0;
  });
  if (detached) {
    await logAudit(
      'detach_interaction_evidence',
      'species_interaction',
      interaction,
      `Observation ${obsId} détachée de l’interaction ${interaction}`,
      {
        req: audit?.req || null,
        ...(audit?.req ? {} : { actorUserType: 'teacher', actorUserId: optionalId(actorId) }),
        payload: { observation_id: obsId },
      },
    );
  }
  return { detached };
}

// --- Photos -------------------------------------------------------------------------------

const IMAGE_SIGNATURES = Object.freeze([
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) =>
      b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP',
  },
]);

/** Data URL ou base64 → { buffer, mime, ext } ; signature d'image vérifiée (pas l'en-tête seul). */
function decodeImagePayload(imageData) {
  const raw = String(imageData || '').trim();
  if (!raw) fail(400, 'Photo manquante');
  const header = /^data:([^;,]+);base64,/i.exec(raw);
  if (header && !/^image\/(jpeg|jpg|png|webp)$/i.test(header[1])) {
    fail(400, 'Photo invalide : JPEG, PNG ou WebP attendu');
  }
  const base64 = header ? raw.slice(header[0].length) : raw;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < 12) fail(400, 'Photo invalide');
  try {
    assertUploadSize(buffer.length);
  } catch (err) {
    fail(400, err.message || 'Photo trop volumineuse');
  }
  const format = IMAGE_SIGNATURES.find((sig) => sig.test(buffer));
  if (!format) fail(400, 'Photo invalide : JPEG, PNG ou WebP attendu');
  return { buffer, mime: format.mime, ext: format.ext };
}

/**
 * Ajoute une photo : le fichier est écrit (EXIF retiré) PUIS la ligne insérée ; si l'insertion
 * échoue, le fichier est supprimé — jamais de ligne sans fichier ni de fichier sans ligne.
 * @returns {Promise<{ id: number, url: string }>}
 */
async function addObservationPhoto(observationId, imageData, { dbx = database } = {}) {
  const obsId = positiveInt(observationId);
  if (!obsId) fail(400, 'Identifiant invalide');
  const { buffer, mime, ext } = decodeImagePayload(imageData);
  if ((await repo.countPhotos(dbx, obsId)) >= MAX_PHOTOS_PER_OBSERVATION) {
    fail(409, `${MAX_PHOTOS_PER_OBSERVATION} photos au plus par observation`, 'PHOTO_LIMIT');
  }
  const relativePath = `${PHOTO_DIR}/${obsId}/${crypto.randomUUID()}.${ext}`;
  await writeBufferToDisk(relativePath, buffer);
  let byteSize = buffer.length;
  try {
    byteSize = (await fs.promises.stat(getAbsolutePath(relativePath))).size;
  } catch (_) {
    /* taille reçue par défaut */
  }
  try {
    const id = await repo.insertPhoto(dbx, {
      observationId: obsId,
      filePath: relativePath,
      mimeType: mime,
      byteSize,
    });
    return { id: Number(id), url: photoUrl(id) };
  } catch (err) {
    deleteFile(relativePath);
    throw err;
  }
}

/** Supprime la ligne puis le fichier (un échec disque laisse au pire un fichier orphelin). */
async function deleteObservationPhoto(observationId, photoId, { dbx = database } = {}) {
  const photo = await repo.getPhoto(dbx, positiveInt(photoId) || 0);
  if (!photo || Number(photo.observation_id) !== Number(observationId)) {
    fail(404, 'Photo introuvable');
  }
  await repo.deletePhotoRow(dbx, photo.id);
  deleteFile(photo.file_path);
  return { deleted: true };
}

async function getPhotoFile(photoId, { dbx = database } = {}) {
  const id = positiveInt(photoId);
  if (!id) return null;
  const photo = await repo.getPhoto(dbx, id);
  if (!photo) return null;
  return {
    id: Number(photo.id),
    observationId: Number(photo.observation_id),
    absolutePath: getAbsolutePath(photo.file_path),
    mimeType: photo.mime_type || null,
  };
}

/**
 * Supprime une observation non validée, ses photos (lignes et fichiers) et ses rattachements.
 * Une observation validée est une preuve : elle reste (invariants 2 et 3).
 */
async function deleteObservation(id, { dbx = database } = {}) {
  const obsId = positiveInt(id);
  if (!obsId) fail(400, 'Identifiant invalide');
  const row = await repo.getObservationRow(dbx, obsId);
  if (!row) fail(404, 'Observation introuvable');
  if (row.status === OBSERVATION_STATUS.VALIDATED) {
    fail(
      409,
      'Une observation validée sert de preuve : elle ne peut pas être supprimée',
      'VALIDATED',
    );
  }
  const paths = await repo.listPhotoPathsForObservation(dbx, obsId);
  await repo.deleteObservation(dbx, obsId);
  for (const p of paths) deleteFile(p);
  return { deleted: true, observation: serializeObservation(row) };
}

/**
 * Chemins des photos d'un compte — à lire AVANT la suppression du compte (les lignes partent
 * en cascade avec lui), puis à effacer après le commit. Voir le rapport de lot : raccord à
 * poser dans `lib/studentDeletion.js`.
 */
async function collectObserverPhotoPaths(userId, { dbx = database } = {}) {
  const id = optionalId(userId);
  if (!id) return [];
  return repo.listPhotoPathsForObserver(dbx, id);
}

// --- Lectures -----------------------------------------------------------------------------

async function listObservationsForObserver(
  observerId,
  { limit = OBSERVER_LIST_MAX, dbx = database } = {},
) {
  const id = optionalId(observerId);
  if (!id) return [];
  const bounded = Math.min(Math.max(Number(limit) || OBSERVER_LIST_MAX, 1), OBSERVER_LIST_MAX);
  return hydrateRows(dbx, await repo.listByObserver(dbx, id, bounded));
}

/**
 * File d'examen de l'enseignant.
 * @param {{ mapIds?: string[]|null, status?: string|null, limit?: number }} filters
 *   `mapIds` null = toutes les cartes ; `status` null = tous les statuts
 * @returns {Promise<{ items: object[], counts: Record<string, number> }>}
 */
async function listObservationsForReview(
  { mapIds = null, status = OBSERVATION_STATUS.SUBMITTED, limit = 100 } = {},
  { dbx = database } = {},
) {
  if (status != null && !OBSERVATION_STATUSES.includes(status)) fail(400, 'Statut inconnu');
  const bounded = Math.min(Math.max(Number(limit) || 100, 1), REVIEW_LIST_MAX);
  const [rows, countRows] = await Promise.all([
    repo.listForReview(dbx, { mapIds, status, limit: bounded }),
    repo.countByStatus(dbx, { mapIds }),
  ]);
  const counts = Object.fromEntries(OBSERVATION_STATUSES.map((s) => [s, 0]));
  for (const row of countRows) counts[row.status] = Number(row.n) || 0;
  return { items: await hydrateRows(dbx, rows), counts };
}

/** Interactions du réseau où figure l'espèce de l'observation (candidates à une preuve). */
async function listInteractionCandidates(observationId, { dbx = database } = {}) {
  const obs = await getObservation(observationId, dbx);
  if (!obs) fail(404, 'Observation introuvable');
  if (!obs.plant_id) return { observation: obs, items: [] };
  const rows = await repo.listInteractionsForPlant(dbx, obs.plant_id, obs.id);
  return {
    observation: obs,
    items: rows.map((r) => ({
      id: Number(r.id),
      interaction_type: r.interaction_type,
      evidence_level: r.evidence_level,
      from: { id: Number(r.from_plant_id), name: r.from_name || '', emoji: r.from_emoji || '' },
      to:
        r.to_plant_id == null
          ? null
          : { id: Number(r.to_plant_id), name: r.to_name || '', emoji: r.to_emoji || '' },
      attached: Number(r.attached) === 1,
    })),
  };
}

module.exports = {
  OBSERVATION_STATUS,
  OBSERVATION_STATUSES,
  DECISIONS,
  DETECTION_MODES,
  OBSERVATION_TEXT_MAX,
  DECISION_NOTE_MAX,
  MAX_PHOTOS_PER_OBSERVATION,
  PHOTO_DIR,
  CLIENT_UUID_RE,
  ObservationError,
  normalizeObservedAt,
  decodeImagePayload,
  serializeObservation,
  getObservation,
  recordObservation,
  validateObservation,
  attachInteractionEvidence,
  detachInteractionEvidence,
  addObservationPhoto,
  deleteObservationPhoto,
  getPhotoFile,
  deleteObservation,
  collectObserverPhotoPaths,
  listObservationsForObserver,
  listObservationsForReview,
  listInteractionCandidates,
};
