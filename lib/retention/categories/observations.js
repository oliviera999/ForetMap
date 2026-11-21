'use strict';

/**
 * Catégorie `observations` — observations d'espèces (`species_observations`) et leurs photos
 * (`species_observation_photos`, fichiers privés sous `uploads/observations/species/`).
 *
 * Trois règles, dans cet ordre (durées : `lib/retention/policy.js`) :
 *   1. photos des observations **refusées** : ligne et fichier supprimés peu après la décision ;
 *   2. observations **refusées** (texte, note de l'enseignant) : supprimées après le délai de
 *      lecture ;
 *   3. observations **soumises** jamais examinées : supprimées avec leurs photos au bout d'un an.
 *
 * Une observation **validée** n'est JAMAIS touchée : elle est la preuve d'une ligne de
 * l'inventaire et vit avec le compte de son auteur (voir `policy.js`). Chaque requête de
 * suppression répète la condition de statut : une observation validée entre le relevé et la
 * suppression n'est pas emportée.
 *
 * Fichiers : la ligne est supprimée d'abord, le fichier ensuite (jamais de ligne sans
 * fichier ; un échec disque laisse au pire un fichier orphelin, repris par
 * `scripts/reconcile-orphan-uploads.js`). Même ordre que `lib/terrain/observationService.js`.
 *
 * Lots bornés (`BATCH_SIZE` lignes) : aucune transaction longue, une interruption laisse un
 * état cohérent et la reprise repart de ce qui reste. La sortie ne contient que des comptages :
 * ni nom, ni texte d'observation, ni chemin de fichier.
 */

const {
  OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS,
  OBSERVATION_REFUSED_RETENTION_DAYS,
  OBSERVATION_PENDING_RETENTION_DAYS,
} = require('../policy');
const { MAX_BATCHES } = require('../batches');
const { SPECIES_OBSERVATION_STATUS_ENUM } = require('../../shared/terrainEnums');

const [STATUS_SUBMITTED, STATUS_VALIDATED, STATUS_REFUSED] = SPECIES_OBSERVATION_STATUS_ENUM.values;

/** Lignes relevées par lot (identifiants passés en paramètres d'un `IN (…)`). */
const BATCH_SIZE = 200;

/** Date de décision d'une observation refusée (à défaut, dernière modification). */
const DECIDED_AT_SQL = 'COALESCE(o.decided_at, o.updated_at)';

function placeholders(list) {
  return list.map(() => '?').join(', ');
}

async function countOf(db, sql, params) {
  const row = await db.queryOne(sql, params);
  return Number(row?.n) || 0;
}

/** Suppression d'un fichier photo, injectable (tests) ; par défaut `lib/uploads.js`. */
function fileRemover(deps) {
  if (typeof deps?.deleteObservationFile === 'function') return deps.deleteObservationFile;
  // `require` paresseux : `lib/uploads.js` charge sharp à la première image.
  return require('../../uploads').deleteFile;
}

/**
 * Répète `step` (un lot) jusqu'à un lot incomplet.
 * @param {() => Promise<number>} step rend le nombre de lignes relevées dans le lot
 */
async function untilDrained(step) {
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    if ((await step()) < BATCH_SIZE) return;
  }
  throw new Error('Purge des observations interrompue : nombre maximal de lots atteint.');
}

/** Règle 1 — photos des observations refusées, au-delà du délai court. */
async function purgeRefusedPhotos({ apply, db, removeFile }) {
  const where = `o.status = ? AND ${DECIDED_AT_SQL} < NOW() - INTERVAL ? DAY`;
  const params = [STATUS_REFUSED, OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS];
  if (!apply) {
    return countOf(
      db,
      `SELECT COUNT(*) AS n FROM species_observation_photos ph
         JOIN species_observations o ON o.id = ph.observation_id
        WHERE ${where}`,
      params,
    );
  }
  let removed = 0;
  await untilDrained(async () => {
    const rows = await db.queryAll(
      `SELECT ph.id, ph.file_path FROM species_observation_photos ph
         JOIN species_observations o ON o.id = ph.observation_id
        WHERE ${where}
        ORDER BY ph.id LIMIT ?`,
      [...params, String(BATCH_SIZE)],
    );
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    // Le statut est revérifié dans la suppression elle-même.
    const res = await db.execute(
      `DELETE ph FROM species_observation_photos ph
         JOIN species_observations o ON o.id = ph.observation_id
        WHERE ph.id IN (${placeholders(ids)}) AND o.status = ?`,
      [...ids, STATUS_REFUSED],
    );
    for (const row of rows) if (row.file_path) removeFile(String(row.file_path));
    removed += Number(res?.affectedRows) || 0;
    return rows.length;
  });
  return removed;
}

/**
 * Règles 2 et 3 — observations d'un statut donné au-delà de leur durée, photos comprises.
 * @param {{ status: string, dateSql: string, days: number }} rule
 * @returns {Promise<{ observations: number, photos: number }>}
 */
async function purgeObservations({ apply, db, removeFile }, { status, dateSql, days }) {
  // Garde-fou : cette fonction ne reçoit jamais le statut « validée ».
  if (status === STATUS_VALIDATED) throw new Error('Une observation validée ne se purge pas.');
  const where = `o.status = ? AND ${dateSql} < NOW() - INTERVAL ? DAY`;
  const params = [status, days];
  if (!apply) {
    return {
      observations: await countOf(
        db,
        `SELECT COUNT(*) AS n FROM species_observations o WHERE ${where}`,
        params,
      ),
      photos: await countOf(
        db,
        `SELECT COUNT(*) AS n FROM species_observation_photos ph
           JOIN species_observations o ON o.id = ph.observation_id
          WHERE ${where}`,
        params,
      ),
    };
  }
  const out = { observations: 0, photos: 0 };
  await untilDrained(async () => {
    const rows = await db.queryAll(
      `SELECT o.id FROM species_observations o WHERE ${where} ORDER BY o.id LIMIT ?`,
      [...params, String(BATCH_SIZE)],
    );
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    const photos = await db.queryAll(
      `SELECT file_path FROM species_observation_photos
        WHERE observation_id IN (${placeholders(ids)})`,
      ids,
    );
    // Les lignes de photo et les rattachements partent en cascade avec l'observation.
    const res = await db.execute(
      `DELETE FROM species_observations WHERE id IN (${placeholders(ids)}) AND status = ?`,
      [...ids, status],
    );
    const deleted = Number(res?.affectedRows) || 0;
    // Fichiers effacés seulement si tout le lot est parti : une observation décidée entre le
    // relevé et la suppression garde sa ligne de photo, donc son fichier.
    if (deleted === ids.length) {
      for (const photo of photos) if (photo.file_path) removeFile(String(photo.file_path));
      out.photos += photos.length;
    } else {
      const left = await db.queryAll(
        `SELECT file_path FROM species_observation_photos
          WHERE observation_id IN (${placeholders(ids)})`,
        ids,
      );
      const kept = new Set(left.map((r) => String(r.file_path || '')));
      for (const photo of photos) {
        const filePath = String(photo.file_path || '');
        if (!filePath || kept.has(filePath)) continue;
        removeFile(filePath);
        out.photos += 1;
      }
    }
    out.observations += deleted;
    return rows.length;
  });
  return out;
}

module.exports = {
  key: 'observations',
  label: 'observations d’espèces',
  BATCH_SIZE,
  async run({ apply, db, deps, log }) {
    const ctx = { apply, db, removeFile: fileRemover(deps) };
    const refusedPhotos = await purgeRefusedPhotos(ctx);
    const refused = await purgeObservations(ctx, {
      status: STATUS_REFUSED,
      dateSql: DECIDED_AT_SQL,
      days: OBSERVATION_REFUSED_RETENTION_DAYS,
    });
    const pending = await purgeObservations(ctx, {
      status: STATUS_SUBMITTED,
      dateSql: 'o.created_at',
      days: OBSERVATION_PENDING_RETENTION_DAYS,
    });
    const verb = apply ? 'supprimée(s)' : 'à supprimer';
    log(
      `${refusedPhotos} photo(s) d’observation refusée ${verb} (plus de ` +
        `${OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS} jours après le refus).`,
    );
    log(
      `${refused.observations} observation(s) refusée(s) ${verb} (plus de ` +
        `${OBSERVATION_REFUSED_RETENTION_DAYS} jours après le refus).`,
    );
    log(
      `${pending.observations} observation(s) jamais examinée(s) ${verb} (plus de ` +
        `${OBSERVATION_PENDING_RETENTION_DAYS} jours), avec ${pending.photos} photo(s).`,
    );
    return {
      counts: {
        photos_refusees: refusedPhotos,
        observations_refusees: refused.observations,
        photos_observations_refusees: refused.photos,
        observations_non_examinees: pending.observations,
        photos_non_examinees: pending.photos,
        jours: {
          photo_refusee: OBSERVATION_REFUSED_PHOTO_RETENTION_DAYS,
          observation_refusee: OBSERVATION_REFUSED_RETENTION_DAYS,
          observation_non_examinee: OBSERVATION_PENDING_RETENTION_DAYS,
        },
      },
    };
  },
};
