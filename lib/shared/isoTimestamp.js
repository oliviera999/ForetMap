'use strict';

/**
 * Écriture d'un instant dans une colonne temporelle.
 *
 * Historique — pourquoi ce module s'appelle encore « iso »
 * -------------------------------------------------------
 * Vingt-neuf colonnes des tables ForetMap portaient un instant dans une `VARCHAR(32)`
 * (héritage du portage SQLite → MySQL). Le format retenu était l'ISO-8601 UTC, seul format
 * qui trie correctement en lexicographique tout en portant son fuseau, et ces deux
 * fonctions en étaient le point d'entrée unique.
 *
 * La migration 249 a converti ces colonnes en `DATETIME(3)` et `DATE`. Le contrat change
 * donc ici, et il n'est pas facultatif : MariaDB en mode `STRICT_TRANS_TABLES` **refuse**
 * une chaîne ISO dans une colonne DATETIME. `INSERT ... VALUES ('2026-04-05T16:04:00.000Z')`
 * lève « Truncated incorrect datetime value » — la fonction `CAST()` accepte le `T` et le
 * `Z`, l'affectation de colonne non.
 *
 * Le nouveau contrat
 * ------------------
 * Ces fonctions rendent un objet `Date`, pas une chaîne. C'est le seul type correct des
 * deux côtés à la fois :
 *   - vers MySQL, mysql2 le sérialise en heure UTC, parce que le pool déclare
 *     `timezone: 'Z'` (cf. `database.js`) ;
 *   - vers le client, `JSON.stringify` le rend en `2026-04-05T16:04:00.000Z` —
 *     exactement la chaîne qu'écrivait l'ancienne version. Le contrat d'API ne bouge pas.
 *
 * Les 44 appelants passent la valeur en paramètre SQL ou la laissent partir en JSON ;
 * aucun n'en manipulait la forme textuelle, ce qui rend le changement transparent.
 */

/**
 * Instant courant, prêt à être écrit dans une colonne temporelle.
 * @returns {Date}
 */
function nowDbTimestamp() {
  return new Date();
}

/**
 * Convertit une valeur en instant écrivable dans une colonne temporelle.
 * @param {Date|number|string} value
 * @returns {Date|null} `null` si la valeur n'est pas une date exploitable
 */
function toDbTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = { nowDbTimestamp, toDbTimestamp };
