'use strict';

/**
 * Détection des modifications concurrentes (verrou optimiste) sur les fiches éditées par les
 * profs : tâches, zones, repères, fiches espèces (migration 312, colonne `edit_revision`).
 *
 * Contrat HTTP : un `PUT` peut porter `expected_revision` (entier), la révision de la fiche
 * telle qu'elle a été ouverte. Si la fiche a été enregistrée entre-temps par quelqu'un
 * d'autre, la réponse est un 409 `{ error, code: 'edit_conflict', current_revision }` et rien
 * n'est écrit. Sans `expected_revision`, l'écriture passe comme avant (actions rapides,
 * glisser-déposer, anciens clients) — la révision avance quand même.
 *
 * La réservation est atomique (`UPDATE … WHERE edit_revision = ?`) : deux enregistrements
 * simultanés partis de la même révision ne peuvent pas passer tous les deux. Elle a lieu
 * AVANT l'écriture métier, pour que la fiche relue en réponse porte déjà la nouvelle
 * révision ; si l'écriture métier échoue, `releaseEditRevision` la rend.
 *
 * Même principe que l'en-tête `If-Match` / réponse 412 de HTTP (RFC 9110 §13.1.1), porté dans
 * le corps JSON : le client central `api()` ne transmet pas d'en-têtes par appel.
 */

const { queryOne, execute } = require('../database');

const EDIT_REVISION_TABLES = new Set(['tasks', 'zones', 'map_markers', 'plants']);
const EDIT_CONFLICT_CODE = 'edit_conflict';
const EDIT_CONFLICT_MESSAGE =
  'Cette fiche a été modifiée par quelqu’un d’autre depuis que vous l’avez ouverte.';

function assertTable(table) {
  if (!EDIT_REVISION_TABLES.has(table)) {
    throw new TypeError(`Table sans révision d'édition : ${table}`);
  }
}

/**
 * Révision attendue lue dans le corps.
 * @returns {number|null|undefined} entier ≥ 0, `null` si absente, `undefined` si invalide
 */
function readExpectedRevision(body) {
  const raw = body && typeof body === 'object' ? body.expected_revision : undefined;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Corps sans le champ de contrôle, pour les services qui valident les clés reçues. */
function withoutRevisionField(body) {
  if (!body || typeof body !== 'object' || !('expected_revision' in body)) return body;
  const { expected_revision: _ignored, ...rest } = body;
  return rest;
}

async function currentRevision(table, id) {
  const row = await queryOne(`SELECT edit_revision FROM ${table} WHERE id = ?`, [id]);
  return row ? Number(row.edit_revision) || 0 : null;
}

/**
 * Réserve la révision suivante avant une modification.
 * @returns {Promise<{ revision: number|null } | { error: { status: number, body: object } }>}
 *   `revision: null` : fiche introuvable, le service répondra lui-même (404).
 */
async function claimEditRevision(table, id, body) {
  assertTable(table);
  const expected = readExpectedRevision(body);
  if (expected === undefined) {
    return { error: { status: 400, body: { error: 'expected_revision invalide' } } };
  }
  const result =
    expected === null
      ? await execute(`UPDATE ${table} SET edit_revision = edit_revision + 1 WHERE id = ?`, [id])
      : await execute(
          `UPDATE ${table} SET edit_revision = edit_revision + 1 WHERE id = ? AND edit_revision = ?`,
          [id, expected],
        );
  const revision = await currentRevision(table, id);
  if (revision === null) return { revision: null };
  if (!Number(result?.affectedRows)) {
    return {
      error: {
        status: 409,
        body: {
          error: EDIT_CONFLICT_MESSAGE,
          code: EDIT_CONFLICT_CODE,
          current_revision: revision,
        },
      },
    };
  }
  return { revision };
}

/** Rend une révision réservée quand l'écriture métier n'a pas abouti. */
async function releaseEditRevision(table, id, claim) {
  assertTable(table);
  if (!claim || !Number.isInteger(claim.revision) || claim.revision < 1) return;
  await execute(
    `UPDATE ${table} SET edit_revision = edit_revision - 1 WHERE id = ? AND edit_revision = ?`,
    [id, claim.revision],
  );
}

/** Fait avancer la révision sans contrôle (écriture passée par une autre surface). */
async function bumpEditRevision(table, id) {
  assertTable(table);
  await execute(`UPDATE ${table} SET edit_revision = edit_revision + 1 WHERE id = ?`, [id]);
}

/**
 * Enchaîne réservation, écriture métier et restitution en cas d'échec.
 * @param {string} table
 * @param {string|number} id
 * @param {object} body corps reçu (peut contenir `expected_revision`)
 * @param {(cleanBody: object) => Promise<{ status: number, body: object }>} write
 * @returns {Promise<{ status: number, body: object }>}
 */
async function withEditRevision(table, id, body, write) {
  const claim = await claimEditRevision(table, id, body);
  if (claim.error) return claim.error;
  let result;
  try {
    result = await write(withoutRevisionField(body));
  } catch (err) {
    await releaseEditRevision(table, id, claim).catch(() => {});
    throw err;
  }
  if (!result || result.status >= 400) await releaseEditRevision(table, id, claim);
  return result;
}

module.exports = {
  EDIT_CONFLICT_CODE,
  EDIT_CONFLICT_MESSAGE,
  readExpectedRevision,
  withoutRevisionField,
  claimEditRevision,
  releaseEditRevision,
  bumpEditRevision,
  withEditRevision,
};
