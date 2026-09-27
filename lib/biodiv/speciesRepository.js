'use strict';

/**
 * Dépôt des fiches espèces (`plants`) — **SQL seulement** (étape B3 de la piste B, audit du
 * 25/09/2026, § 2.2 et § 3.3 ligne 9).
 *
 * Aucune règle métier ici : validation, revue des dangers, préremplissage et transactions
 * vivent dans `lib/biodiv/speciesService.js`. Chaque fonction prend en dernier argument un
 * exécuteur `dbx` — le pool par défaut, ou le `tx` fourni par `withTransaction` — sur le
 * modèle de `lib/tasks/taskQueries.js` et de `lib/speciesJunction.js`.
 *
 * Les listes de colonnes écrites viennent de `PLANT_COLUMNS` (`lib/plantsRouteHelpers.js`) :
 * une liste blanche, jamais le corps de la requête. Tout le SQL est paramétré ; les seuls
 * fragments assemblés sont des noms de colonnes de cette liste blanche et des suites de `?`.
 */

const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { PLANT_COLUMNS, PHOTO_FIELDS } = require('../plantsRouteHelpers');

/** Exécuteur par défaut : le pool (avec `withTransaction` disponible). */
const defaultDb = { queryAll, queryOne, execute, withTransaction };

function placeholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

// ─── Lecture des fiches ───────────────────────────────────────────────────────

/** Fiche complète (toutes colonnes), ou `undefined`. */
function findPlantById(plantId, dbx = defaultDb) {
  return dbx.queryOne('SELECT * FROM plants WHERE id = ?', [plantId]);
}

/** Identité minimale (`id`, `name`) d'une fiche, ou `undefined`. */
function findPlantIdentity(plantId, dbx = defaultDb) {
  return dbx.queryOne('SELECT id, name FROM plants WHERE id = ? LIMIT 1', [plantId]);
}

/** `{ id }` si la fiche existe, sinon `undefined`. */
function findPlantIdOnly(plantId, dbx = defaultDb) {
  return dbx.queryOne('SELECT id FROM plants WHERE id = ?', [plantId]);
}

/**
 * Catalogue complet, trié par nom. `SELECT *` voulu (audit §2.4/§3.7) : la fiche complète,
 * le formulaire d'édition et les vues biodiversité sont rendus depuis ces lignes.
 */
function listAllPlants(dbx = defaultDb) {
  return dbx.queryAll('SELECT * FROM plants ORDER BY name');
}

/** Noms et identifiants de toutes les fiches (rapprochement par nom de l'import). */
function listPlantIdsAndNames(dbx = defaultDb) {
  return dbx.queryAll('SELECT id, name FROM plants');
}

/** Interactions dont la fiche est la source (`from`). */
function listInteractionsFromPlant(plantId, dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT si.id, si.interaction_type, si.description,
            pt.id AS to_id, pt.name AS to_name, pt.emoji AS to_emoji
       FROM species_interactions si
       LEFT JOIN plants pt ON pt.id = si.to_plant_id
      WHERE si.from_plant_id = ?
      ORDER BY si.interaction_type ASC, pt.name ASC`,
    [plantId],
  );
}

/** Interactions dont la fiche est la cible (`to`). */
function listInteractionsToPlant(plantId, dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT si.id, si.interaction_type, si.description,
            pf.id AS from_id, pf.name AS from_name, pf.emoji AS from_emoji
       FROM species_interactions si
       JOIN plants pf ON pf.id = si.from_plant_id
      WHERE si.to_plant_id = ?
      ORDER BY si.interaction_type ASC, pf.name ASC`,
    [plantId],
  );
}

/** Termes de glossaire actifs rattachés à la fiche. */
function listActiveGlossaryTermsForPlant(plantId, dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT g.glossary_code, g.terme, g.variantes, g.categorie, g.niveau, g.definition_courte
       FROM glossary_term_species gts
       JOIN glossary_terms g ON g.glossary_code = gts.glossary_code
      WHERE gts.plant_id = ? AND g.statut = 'actif'
      ORDER BY g.terme ASC`,
    [plantId],
  );
}

// ─── Observations (« Espèce observée ») ──────────────────────────────────────

/** Identifiants des fiches observées au moins une fois par l'utilisateur. */
function listObservedPlantIdsForUser(userId, dbx = defaultDb) {
  return dbx.queryAll(
    'SELECT DISTINCT plant_id FROM user_plant_observation_events WHERE user_id = ? ORDER BY plant_id ASC',
    [String(userId)],
  );
}

/** Observations de tout le site, par fiche (`plant_id`, `c`). */
function countSiteObservationsByPlant(plantIds, dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT plant_id, COUNT(*) AS c FROM user_plant_observation_events WHERE plant_id IN (${placeholders(plantIds.length)}) GROUP BY plant_id`,
    plantIds,
  );
}

/** Observations de l'utilisateur, par fiche (`plant_id`, `c`). */
function countUserObservationsByPlant(userId, plantIds, dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT plant_id, COUNT(*) AS c FROM user_plant_observation_events WHERE user_id = ? AND plant_id IN (${placeholders(plantIds.length)}) GROUP BY plant_id`,
    [String(userId), ...plantIds],
  );
}

/** Observation déjà enregistrée sous cette clé d'idempotence (même utilisateur, même fiche). */
function findObservationByClientUuid(userId, plantId, clientUuid, dbx = defaultDb) {
  return dbx.queryOne(
    `SELECT observed_at FROM user_plant_observation_events
      WHERE user_id = ? AND client_uuid = ? AND plant_id = ? LIMIT 1`,
    [String(userId), clientUuid, plantId],
  );
}

/** `{ c }` : observations de la fiche par l'utilisateur. */
function countUserObservationsOfPlant(userId, plantId, dbx = defaultDb) {
  return dbx.queryOne(
    'SELECT COUNT(*) AS c FROM user_plant_observation_events WHERE user_id = ? AND plant_id = ?',
    [String(userId), plantId],
  );
}

/** `{ c }` : observations de la fiche, tout le site. */
function countSiteObservationsOfPlant(plantId, dbx = defaultDb) {
  return dbx.queryOne(
    'SELECT COUNT(*) AS c FROM user_plant_observation_events WHERE plant_id = ?',
    [plantId],
  );
}

function insertObservationEvent({ userId, plantId, observedAt, clientUuid }, dbx = defaultDb) {
  return dbx.execute(
    'INSERT INTO user_plant_observation_events (user_id, plant_id, observed_at, client_uuid) VALUES (?, ?, ?, ?)',
    [String(userId), plantId, observedAt, clientUuid],
  );
}

// ─── Écriture des fiches ─────────────────────────────────────────────────────

/** Insère une fiche (colonnes `PLANT_COLUMNS`) ; renvoie `{ insertId, affectedRows }`. */
function insertPlant(payload, dbx = defaultDb) {
  return dbx.execute(
    `INSERT INTO plants (${PLANT_COLUMNS.join(', ')}) VALUES (${placeholders(PLANT_COLUMNS.length)})`,
    PLANT_COLUMNS.map((col) => payload[col]),
  );
}

/**
 * Insère plusieurs fiches en un seul `INSERT` multi-valeurs (aucun `insertId` exploitable).
 * L'appelant borne la taille du lot : 33 colonnes × 2 000 lignes dépasseraient la limite de
 * paramètres d'une requête préparée.
 */
function insertPlantsBulk(payloads, dbx = defaultDb) {
  const rowPlaceholder = `(${placeholders(PLANT_COLUMNS.length)})`;
  const params = [];
  for (const payload of payloads) {
    for (const col of PLANT_COLUMNS) params.push(payload[col]);
  }
  return dbx.execute(
    `INSERT INTO plants (${PLANT_COLUMNS.join(', ')}) VALUES ${payloads.map(() => rowPlaceholder).join(', ')}`,
    params,
  );
}

/**
 * Réécrit les colonnes `PLANT_COLUMNS` d'une fiche. `resetHazardReview` remet la relecture
 * des dangers à zéro (drapeau, relecteur, date) dans le même `UPDATE`.
 */
function updatePlant(plantId, payload, { resetHazardReview = false } = {}, dbx = defaultDb) {
  const setClause = [
    ...PLANT_COLUMNS.map((col) => `${col}=?`),
    ...(resetHazardReview
      ? ['hazard_reviewed=0', 'hazard_reviewed_by=NULL', 'hazard_reviewed_at=NULL']
      : []),
  ].join(', ');
  return dbx.execute(`UPDATE plants SET ${setClause} WHERE id=?`, [
    ...PLANT_COLUMNS.map((col) => payload[col]),
    plantId,
  ]);
}

/** Réécrit une colonne photo (nom validé contre `PHOTO_FIELDS`, jamais pris du corps brut). */
function updatePlantPhotoColumn(plantId, field, value, dbx = defaultDb) {
  if (!PHOTO_FIELDS.includes(field)) {
    throw new Error(`Colonne photo inconnue : ${field}`);
  }
  return dbx.execute(`UPDATE plants SET ${field} = ? WHERE id = ?`, [value, plantId]);
}

/** Relecture des dangers : drapeau, relecteur et date (seule écriture de ces trois colonnes). */
function setHazardReview(plantId, { reviewed, reviewerId, reviewedAt }, dbx = defaultDb) {
  return dbx.execute(
    'UPDATE plants SET hazard_reviewed = ?, hazard_reviewed_by = ?, hazard_reviewed_at = ? WHERE id = ?',
    [reviewed, reviewerId, reviewedAt, plantId],
  );
}

function deletePlant(plantId, dbx = defaultDb) {
  return dbx.execute('DELETE FROM plants WHERE id = ?', [plantId]);
}

/** Vide le catalogue (import « remplacer tout »). Les jonctions suivent par clé étrangère. */
function deleteAllPlants(dbx = defaultDb) {
  return dbx.execute('DELETE FROM plants');
}

module.exports = {
  defaultDb,
  findPlantById,
  findPlantIdentity,
  findPlantIdOnly,
  listAllPlants,
  listPlantIdsAndNames,
  listInteractionsFromPlant,
  listInteractionsToPlant,
  listActiveGlossaryTermsForPlant,
  listObservedPlantIdsForUser,
  countSiteObservationsByPlant,
  countUserObservationsByPlant,
  findObservationByClientUuid,
  countUserObservationsOfPlant,
  countSiteObservationsOfPlant,
  insertObservationEvent,
  insertPlant,
  insertPlantsBulk,
  updatePlant,
  updatePlantPhotoColumn,
  setHazardReview,
  deletePlant,
  deleteAllPlants,
};
