'use strict';

const logger = require('./logger');

/**
 * Normalisation des horodatages hérités stockés en VARCHAR (audit docs/AUDIT_BDD_2026-08.md §3.2).
 *
 * Le problème
 * -----------
 * Vingt-neuf colonnes temporelles sont typées `VARCHAR(32)` (héritage du portage
 * SQLite → MySQL). Tant que le format reste unique, c'est un défaut de forme supportable.
 * Il ne l'est plus : trois colonnes mélangent deux écritures.
 *
 *   - `new Date().toISOString()` côté application → `2026-04-05T16:04:00.000Z` (UTC)
 *   - `NOW()` côté SQL, ou reprise d'une base SQLite → `2026-04-05 18:04:00` (heure locale)
 *
 * MySQL trie une chaîne octet par octet : au dixième caractère il compare `'T'` (0x54) à
 * `' '` (0x20). **Toute date ISO passe donc après toute date MySQL du même jour**, quelle
 * que soit l'heure réelle. Sur l'export de production du 18/08/2026, cela produisait
 * 15 paires de marqueurs et 30 paires de tutoriels affichées dans le désordre.
 *
 * La correction
 * -------------
 * On converge vers l'ISO-8601 UTC, format déjà majoritaire et non ambigu côté navigateur
 * (`new Date('2026-04-05 18:04:00')` serait interprété en heure LOCALE par JavaScript,
 * alors que le suffixe `Z` fixe le fuseau). Les valeurs héritées, elles, ont été écrites en
 * heure locale : on retire l'offset Europe/Paris **de la ligne concernée** avant de
 * reformater — +2 h en heure d'été, +1 h en heure d'hiver.
 *
 * L'offset est calculé en SQL pur, sans dépendre des tables de fuseaux horaires de MariaDB
 * (souvent absentes en hébergement mutualisé, ce qui ferait retourner NULL à `CONVERT_TZ`).
 * Règle européenne : heure d'été du dernier dimanche de mars 02:00 au dernier dimanche
 * d'octobre 03:00, heure locale.
 *
 * Pourquoi ici et pas dans une migration numérotée
 * ------------------------------------------------
 * Même modèle que `inlineLegacyTutorialHtmlToDb` : l'opération ne touche QUE les lignes
 * encore dans l'ancien format, elle est donc naturellement idempotente et convergente.
 * Exécutée à chaque `initSchema()`, elle rattrape aussi une reprise de base ou un écrivain
 * égaré, ce qu'une migration numérotée — jouée une seule fois — ne ferait pas.
 *
 * Colonnes NON traitées : `tasks.due_date`, `tasks.start_date`,
 * `tasks.recurrence_spawned_for_due_date` et `zone_history.harvested_at` contiennent des
 * DATES (`YYYY-MM-DD`), pas des instants. Les convertir en horodatage serait un contresens.
 */

/** Colonnes VARCHAR portant un INSTANT, où les deux formats ont été observés. */
const LEGACY_TIMESTAMP_COLUMNS = Object.freeze([
  { table: 'map_markers', column: 'created_at' },
  { table: 'tutorials', column: 'created_at' },
  { table: 'users', column: 'last_seen' },
]);

/** Dernier dimanche du mois `month` (deux chiffres) de l'année de `col`, au format `YYYY-MM-DD`. */
function lastSundayOfMonth(col, month) {
  const firstOfMonth = `CONCAT(YEAR(\`${col}\`), '-${month}-01')`;
  return (
    `DATE_FORMAT(DATE_SUB(LAST_DAY(${firstOfMonth}), ` +
    `INTERVAL DAYOFWEEK(LAST_DAY(${firstOfMonth})) - 1 DAY), '%Y-%m-%d')`
  );
}

/**
 * Expression SQL convertissant une valeur `YYYY-MM-DD HH:MM:SS` en heure locale
 * Europe/Paris vers `YYYY-MM-DDTHH:MM:SS.000Z` en UTC.
 * @param {string} col nom de colonne (déjà validé : issu de LEGACY_TIMESTAMP_COLUMNS)
 */
function toIsoUtcExpression(col) {
  const dstStart = `CONCAT(${lastSundayOfMonth(col, '03')}, ' 02:00:00')`;
  const dstEnd = `CONCAT(${lastSundayOfMonth(col, '10')}, ' 03:00:00')`;
  const offsetHours = `IF(\`${col}\` >= ${dstStart} AND \`${col}\` < ${dstEnd}, 2, 1)`;
  return `DATE_FORMAT(DATE_SUB(\`${col}\`, INTERVAL (${offsetHours}) HOUR), '%Y-%m-%dT%H:%i:%s.000Z')`;
}

/** Ne cible que les valeurs `YYYY-MM-DD HH:MM:SS` — les ISO et les dates seules sont épargnées. */
function legacyShapeCondition(col) {
  return `\`${col}\` LIKE '____-__-__ __:__:__'`;
}

/**
 * Convertit les horodatages hérités restants. Sans effet si tout est déjà en ISO.
 *
 * @param {{ execute: Function }} db
 * @returns {Promise<{ converted: Record<string, number>, total: number }>}
 */
async function normalizeLegacyTimestamps(db) {
  const converted = {};
  let total = 0;
  for (const { table, column } of LEGACY_TIMESTAMP_COLUMNS) {
    try {
      const result = await db.execute(
        `UPDATE \`${table}\` SET \`${column}\` = ${toIsoUtcExpression(column)}
          WHERE ${legacyShapeCondition(column)}`,
      );
      const n = Number(result?.affectedRows || 0);
      if (n > 0) {
        converted[`${table}.${column}`] = n;
        total += n;
      }
    } catch (err) {
      // Une colonne absente (base partiellement migrée) ne doit pas empêcher le démarrage.
      logger.warn({ err, table, column }, 'Normalisation horodatage hérité ignorée');
    }
  }
  if (total > 0) {
    logger.info({ converted, total }, 'Horodatages hérités normalisés en ISO-8601 UTC');
  }
  return { converted, total };
}

module.exports = {
  normalizeLegacyTimestamps,
  toIsoUtcExpression,
  legacyShapeCondition,
  LEGACY_TIMESTAMP_COLUMNS,
};
