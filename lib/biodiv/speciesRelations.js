'use strict';

/**
 * Tables liées des fiches espèces (piste C de l'audit du 25/09/2026, § 2.3 et § 3.5) :
 * chargement pour la lecture, et écriture — nouvelle structure (source de vérité) PLUS
 * miroir dans les anciennes colonnes de `plants` (temps 2 ; le miroir sera retiré au temps
 * 3, dans une PR ultérieure).
 *
 * Photos (`plant_photos`, migration 303). Un corps d'écriture de fiche peut :
 * - porter `photos` (liste `{ kind, url, credit, licence, source, source_url }`) : c'est la
 *   nouvelle forme, celle du formulaire ; les colonnes miroir en sont dérivées et remplacent
 *   d'éventuelles anciennes colonnes du même corps ;
 * - porter seulement les anciennes colonnes (`photo`… `photo_harvest_part`, `photo_credit`,
 *   `photo_licence`) : client historique, import tableur ; la table est recalculée depuis
 *   ces colonnes, en gardant l'attribution déjà connue d'une même photo ;
 * - ne porter ni l'un ni l'autre : les photos ne changent pas.
 *
 * Noms (`plant_name_aliases.kind`, migration 304). Les autres noms d'une fiche
 * (`nom_secondaire`) s'écrivent par `secondary_names` (texte « a, b » ou liste — le
 * formulaire), ou par l'ancien `second_name` (client historique, import) ; miroir :
 * `second_name`. Un nom déjà porté par une autre fiche (clé primaire `alias`) ou égal au nom
 * d'une autre fiche n'entre pas dans la table : il reste dans le miroir (la fiche le relit
 * en repli) et la réponse le signale (`secondary_name_conflicts`).
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
const {
  foldName,
  secondaryNamesExcludingOwn,
  secondNameMirror,
  normalizeClientSecondaryNames,
  resolvePlantNames,
} = require('./plantNames');

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

/** Lignes liées de tout le catalogue : `(plantId) => { photos, aliases }`. */
async function loadRelationsForAll(dbx = repo.defaultDb) {
  const photosByPlant = groupByPlant(await repo.listAllPhotoRows(dbx));
  const aliasesByPlant = groupByPlant(await repo.listAllAliasRows(dbx));
  return (plantId) => ({
    photos: photosByPlant.get(Number(plantId)) || [],
    aliases: aliasesByPlant.get(Number(plantId)) || [],
  });
}

/** Lignes liées d'une fiche : `{ photos, aliases }`. */
async function loadRelationsForPlant(plantId, dbx = repo.defaultDb) {
  return {
    photos: await repo.listPhotoRowsForPlant(plantId, dbx),
    aliases: await repo.listAliasRowsForPlant(plantId, dbx),
  };
}

/**
 * Autres noms (`nom_secondaire`) de plusieurs fiches, pour les lecteurs hors de la fiche
 * (reprise éditoriale des liens, recherches) : `Map<plantId, string[]>`. Le repli sur
 * `plants.second_name` (temps 1) est fait ici, pas chez l'appelant.
 */
async function loadSecondaryNamesByPlantId(plantIds, dbx = repo.defaultDb) {
  const ids = [
    ...new Set((plantIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)),
  ];
  if (ids.length === 0) return new Map();
  const plants = await repo.listPlantNameColumns(ids, dbx);
  const aliasesByPlant = groupByPlant(await repo.listAliasRowsForPlants(ids, dbx));
  return new Map(
    plants.map((plant) => [
      Number(plant.id),
      resolvePlantNames(plant, aliasesByPlant.get(Number(plant.id)) || []).secondaryNames,
    ]),
  );
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

// ─── Noms ────────────────────────────────────────────────────────────────────

/**
 * Lit l'intention « autres noms » d'un corps d'écriture (le nom de la fiche est celui du
 * payload final : une fiche renommée exclut son nouveau nom).
 * @returns {{ mode: 'none'|'list'|'legacy', names?: string[] } | { error: string }}
 */
function readNameIntent(body, ownName) {
  if (hasOwn(body, 'secondary_names')) {
    const normalized = normalizeClientSecondaryNames(body.secondary_names, ownName);
    if (normalized.error) return { error: normalized.error };
    return { mode: 'list', names: normalized.names };
  }
  if (hasOwn(body, 'second_name')) return { mode: 'legacy' };
  return { mode: 'none' };
}

/** Miroir (temps 2) : `second_name` = autres noms séparés par « , ». */
function applyNameMirrorToPayload(payload, intent) {
  if (intent?.mode !== 'list') return payload;
  payload.second_name = secondNameMirror(intent.names);
  return payload;
}

/**
 * Écrit les autres noms (`nom_secondaire`) d'une fiche : ajouts, ordre, graphie, retraits.
 * Un nom déjà porté par la fiche comme `variante` devient `nom_secondaire`. Les noms en
 * conflit (portés par une autre fiche, ou nom d'une autre fiche) sont écartés et renvoyés.
 *
 * @returns {Promise<Array<{ name: string, reason: 'nom_d_une_autre_fiche'|'nom_deja_utilise',
 *   plant_id: number, plant_name: string }>>}
 */
async function writeSecondaryNames(tx, plantId, intent, payload) {
  if (!intent || intent.mode === 'none') return [];
  const names =
    intent.mode === 'list'
      ? intent.names
      : secondaryNamesExcludingOwn(payload?.second_name, payload?.name);
  const existing = await repo.listAliasRowsForPlant(plantId, tx);
  const existingByFold = new Map(existing.map((row) => [foldName(row.alias), row]));

  const conflicts = [];
  const otherPlants = await repo.listOtherPlantsNamed(names, plantId, tx);
  const otherOwners = await repo.listAliasesOwnedElsewhere(names, plantId, tx);
  const namedByFold = new Map(otherPlants.map((row) => [foldName(row.name), row]));
  const ownedByFold = new Map(otherOwners.map((row) => [foldName(row.alias), row]));

  const kept = new Set();
  let order = 0;
  for (const name of names) {
    const key = foldName(name);
    const other = namedByFold.get(key);
    if (other) {
      conflicts.push({
        name,
        reason: 'nom_d_une_autre_fiche',
        plant_id: Number(other.id),
        plant_name: other.name,
      });
      continue;
    }
    const owner = ownedByFold.get(key);
    if (owner) {
      conflicts.push({
        name,
        reason: 'nom_deja_utilise',
        plant_id: Number(owner.plant_id),
        plant_name: owner.plant_name,
      });
      continue;
    }
    const current = existingByFold.get(key);
    const sortOrder = order;
    order += 1;
    kept.add(key);
    if (current) {
      if (
        current.alias !== name ||
        current.kind !== 'nom_secondaire' ||
        Number(current.sort_order || 0) !== sortOrder
      ) {
        await repo.updateAlias(
          plantId,
          current.alias,
          { alias: name, kind: 'nom_secondaire', sortOrder },
          tx,
        );
      }
      continue;
    }
    const inserted = await repo.insertAliasIgnore(
      { alias: name, plantId, kind: 'nom_secondaire', sortOrder },
      tx,
    );
    if (!inserted.affectedRows) {
      conflicts.push({ name, reason: 'nom_deja_utilise', plant_id: null, plant_name: null });
      kept.delete(key);
    }
  }
  const removed = existing
    .filter((row) => row.kind === 'nom_secondaire' && !kept.has(foldName(row.alias)))
    .map((row) => row.alias);
  await repo.deleteAliases(plantId, removed, tx);
  return conflicts;
}

/**
 * Après un import « remplacer tout » : autres noms recalculés depuis `second_name` pour les
 * fiches qui n'en ont aucun dans la table (toutes, les noms étant partis avec les fiches).
 */
async function rebuildSecondaryNamesFromColumns(tx) {
  const plants = await repo.listPlantNameColumnsWithoutSecondaryRows(tx);
  for (const plant of plants) {
    await writeSecondaryNames(tx, plant.id, { mode: 'legacy' }, plant);
  }
}

module.exports = {
  LEGACY_PHOTO_KEYS,
  loadRelationsForAll,
  loadRelationsForPlant,
  loadSecondaryNamesByPlantId,
  readPhotoIntent,
  validatePhotoInput,
  applyPhotoMirrorToPayload,
  writePhotos,
  replacePhotos,
  rebuildPhotosFromColumns,
  readNameIntent,
  applyNameMirrorToPayload,
  writeSecondaryNames,
  rebuildSecondaryNamesFromColumns,
};
