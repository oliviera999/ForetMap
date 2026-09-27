'use strict';

/**
 * Tables liées des fiches espèces (piste C de l'audit du 25/09/2026, § 2.3 et § 3.5) :
 * chargement pour la lecture, et écriture — nouvelle structure (source de vérité) PLUS
 * miroir dans les anciennes colonnes de `plants` (temps 2 ; le miroir sera retiré au temps
 * 3, dans une PR ultérieure).
 *
 * Photos (`plant_photos`, migration 302). Un corps d'écriture de fiche peut :
 * - porter `photos` (liste `{ kind, url, credit, licence, source, source_url }`) : c'est la
 *   nouvelle forme, celle du formulaire ; les colonnes miroir en sont dérivées et remplacent
 *   d'éventuelles anciennes colonnes du même corps ;
 * - porter seulement les anciennes colonnes (`photo`… `photo_harvest_part`, `photo_credit`,
 *   `photo_licence`) : client historique, import tableur ; la table est recalculée depuis
 *   ces colonnes, en gardant l'attribution déjà connue d'une même photo ;
 * - ne porter ni l'un ni l'autre : les photos ne changent pas.
 */

const repo = require('./speciesRepository');
const {
  PHOTO_KINDS,
  photoRowsFromColumns,
  mirrorColumnsFromPhotoRows,
  normalizeClientPhotos,
  diffPhotoRows,
} = require('./plantPhotos');
const { validateHttpsPhotoLinks } = require('../plantsRouteHelpers');

const LEGACY_PHOTO_KEYS = [...PHOTO_KINDS, 'photo_credit', 'photo_licence'];
/** Lot d'insertion des photos reconstruites (8 paramètres par ligne). */
const PHOTO_INSERT_CHUNK = 250;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function groupByPlant(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const id = Number(row.plant_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Lignes liées de tout le catalogue : `Map<plantId, { photos }>` (fonction d'accès). */
async function loadRelationsForAll(dbx = repo.defaultDb) {
  const photosByPlant = groupByPlant(await repo.listAllPhotoRows(dbx));
  return (plantId) => ({ photos: photosByPlant.get(Number(plantId)) || [] });
}

/** Lignes liées d'une fiche : `{ photos }`. */
async function loadRelationsForPlant(plantId, dbx = repo.defaultDb) {
  return { photos: await repo.listPhotoRowsForPlant(plantId, dbx) };
}

// ─── Intentions d'écriture ───────────────────────────────────────────────────

/**
 * Lien d'une photo de la liste : même règle que les anciennes colonnes (image HTTPS directe
 * ou fichier téléversé). Tant que le miroir existe, un lien ne peut contenir ni virgule ni
 * retour à la ligne : l'ancienne colonne le couperait en deux (encoder la virgule en `%2C`).
 */
function validatePhotoLink(kind, url) {
  if (/[,\n\r]/.test(url)) {
    return `${kind}: lien invalide (virgule ou retour à la ligne : encoder la virgule en %2C)`;
  }
  return validateHttpsPhotoLinks({ [kind]: url });
}

/**
 * Lit l'intention « photos » d'un corps d'écriture.
 * @returns {{ mode: 'none'|'list'|'legacy', rows?: object[] } | { error: string }}
 */
function readPhotoIntent(body) {
  if (hasOwn(body, 'photos')) {
    const normalized = normalizeClientPhotos(body.photos, validatePhotoLink);
    if (normalized.error) return { error: normalized.error };
    return { mode: 'list', rows: normalized.rows };
  }
  if (LEGACY_PHOTO_KEYS.some((key) => hasOwn(body, key))) return { mode: 'legacy' };
  return { mode: 'none' };
}

/**
 * Validation des liens photo d'un corps : la liste `photos` si elle est fournie (les
 * anciennes colonnes du même corps sont alors ignorées), sinon les anciennes colonnes.
 * @returns {string|null} message d'erreur (400)
 */
function validatePhotoInput(body) {
  if (hasOwn(body, 'photos')) {
    const intent = readPhotoIntent(body);
    return intent.error || null;
  }
  return validateHttpsPhotoLinks(body);
}

/**
 * Miroir (temps 2) : quand la liste `photos` est fournie, les 8 anciennes colonnes du
 * payload en sont dérivées — elles restent écrites pour qu'un retour arrière du code
 * retrouve des colonnes à jour.
 */
function applyPhotoMirrorToPayload(payload, intent) {
  if (intent?.mode !== 'list') return payload;
  Object.assign(payload, mirrorColumnsFromPhotoRows(intent.rows));
  return payload;
}

/**
 * Écrit les photos d'une fiche selon l'intention : différence avec l'existant (lignes
 * conservées, attribution mise à jour, ajouts, retraits). À appeler dans la transaction de
 * l'écriture de la fiche, APRÈS l'écriture des colonnes (payload final).
 */
async function writePhotos(tx, plantId, intent, payload, existingRows = []) {
  if (!intent || intent.mode === 'none') return;
  const wanted = intent.mode === 'list' ? intent.rows : photoRowsFromColumns(payload, existingRows);
  const { update, insert, remove } = diffPhotoRows(existingRows, wanted);
  await repo.deletePhotoRows(plantId, remove, tx);
  for (const row of update) await repo.updatePhotoRow({ ...row, plant_id: plantId }, tx);
  await repo.insertPhotoRows(
    insert.map((row) => ({ ...row, plant_id: plantId })),
    tx,
  );
}

/** Remplace TOUTES les photos d'une fiche par `rows` (téléversement). */
async function replacePhotos(tx, plantId, rows, existingRows = []) {
  await writePhotos(tx, plantId, { mode: 'list', rows }, null, existingRows);
}

/**
 * Après un import « remplacer tout » (lignes insérées sans identifiant exploitable) :
 * recalcule la table depuis les colonnes des fiches qui n'y ont encore aucune ligne — après
 * un « remplacer tout », toutes.
 */
async function rebuildPhotosFromColumns(tx) {
  const plants = await repo.listPlantPhotoColumnsWithoutRows(tx);
  const rows = [];
  for (const plant of plants) {
    for (const row of photoRowsFromColumns(plant)) rows.push({ ...row, plant_id: plant.id });
  }
  for (let i = 0; i < rows.length; i += PHOTO_INSERT_CHUNK) {
    await repo.insertPhotoRows(rows.slice(i, i + PHOTO_INSERT_CHUNK), tx);
  }
}

module.exports = {
  LEGACY_PHOTO_KEYS,
  loadRelationsForAll,
  loadRelationsForPlant,
  readPhotoIntent,
  validatePhotoInput,
  applyPhotoMirrorToPayload,
  writePhotos,
  replacePhotos,
  rebuildPhotosFromColumns,
};
