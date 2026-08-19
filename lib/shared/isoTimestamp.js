'use strict';

/**
 * Format d'horodatage des colonnes temporelles héritées, stockées en `VARCHAR(32)`.
 *
 * Vingt-neuf colonnes des tables ForetMap historiques portent un instant dans une chaîne
 * (héritage du portage SQLite → MySQL ; les tables GL, plus récentes, utilisent `DATETIME`).
 * Tant qu'une seule écriture existe, le tri lexicographique de MySQL coïncide avec l'ordre
 * chronologique. Deux formats concurrents le cassent : au dixième caractère, MySQL compare
 * `'T'` (0x54) à `' '` (0x20), donc toute valeur ISO passe après toute valeur
 * `YYYY-MM-DD HH:MM:SS` du même jour, quelle que soit l'heure réelle
 * (audit docs/AUDIT_BDD_2026-08.md §3.2).
 *
 * **Le format retenu est l'ISO-8601 UTC** (`2026-04-05T16:04:00.000Z`) :
 *   - il trie correctement en lexicographique, à condition d'être seul ;
 *   - il porte son fuseau, alors que `NOW()` produit une heure locale muette — que
 *     `new Date(...)` réinterpréterait comme locale côté navigateur ;
 *   - il est déjà majoritaire en base.
 *
 * Écrire un horodatage dans l'une de ces colonnes passe par `nowIsoUtc()` ou
 * `toIsoUtc(date)` — **jamais** par `NOW()` en SQL. Le filet de sécurité est
 * `lib/legacyTimestampNormalization.js`, qui reconvertit au démarrage toute valeur restée
 * dans l'ancien format.
 *
 * Pour les colonnes `DATETIME` (tables GL, `users.created_at`…), `NOW()` reste correct :
 * le type porte alors la sémantique, pas la chaîne.
 */

/**
 * Horodatage courant au format des colonnes VARCHAR temporelles.
 * @returns {string} ex. `2026-04-05T16:04:00.000Z`
 */
function nowIsoUtc() {
  return new Date().toISOString();
}

/**
 * Convertit une date au format des colonnes VARCHAR temporelles.
 * @param {Date|number|string} value
 * @returns {string|null} `null` si la valeur n'est pas une date exploitable
 */
function toIsoUtc(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = { nowIsoUtc, toIsoUtc };
