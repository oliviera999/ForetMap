'use strict';

/**
 * `foretmap_sql_execute` — une instruction SQL en écriture (admin, mode productivité).
 *
 * Réglages : `mcp.sql_write_enabled` (outil), `mcp.sql_ddl_enabled` (DDL/DCL),
 * `mcp.sql_max_affected_rows`, `mcp.confirm_mode` — ouverts par défaut, verrouillables par
 * `MCP_SQL_WRITE_ENABLED`, `MCP_SQL_DDL_ENABLED`… Le SQL d'écriture **contourne la logique
 * métier** : il est réservé aux corrections de données.
 * Confirmation par code pour DDL/DCL, UPDATE/DELETE sans WHERE ou dont le WHERE est
 * toujours vrai (`1=1`, `col = col`, `LIKE '%'`, `… OR 1=1`), tables d'autorisation,
 * dépassement de `max_affected_rows`.
 *
 * Décision d'Oliv du 22/11/2026 : le connecteur **garde** ses écritures de structure en prod
 * (aucune règle changée ici). Un DDL réussi reçoit seulement une mention d'information
 * (`schema_drift_note`) : l'écart apparaîtra dans `foretmap_db_status` (contrôle d'écart,
 * `lib/schemaFingerprint.js`) tant qu'il n'est pas repris en migration.
 */

const { z } = require('zod');
const { SCOPES } = require('../config');
const { confirmationFields } = require('../confirm');
const { sqlExecute } = require('../sqlWrite/execute');

const SCHEMA_DRIFT_NOTE =
  'Information : ce changement de structure apparaîtra comme un écart dans foretmap_db_status ' +
  '(et npm run db:status, rapport de santé) tant qu’il n’est pas repris en migration ' +
  '(migrations/NNN_*.sql par PR, puis node scripts/schema-fingerprint.js --write).';

/**
 * Ajoute la mention d'information à la réponse d'un DDL exécuté (ni simulé, ni refusé, ni en
 * attente de confirmation). Ne change rien d'autre : même objet enrichi d'un champ.
 * @param {object} result réponse de `sqlExecute`
 */
function withSchemaDriftNote(result) {
  if (
    result &&
    typeof result === 'object' &&
    result.kind === 'ddl' &&
    result.executed === true &&
    result.dry_run === false
  ) {
    return { ...result, schema_drift_note: SCHEMA_DRIFT_NOTE };
  }
  return result;
}

function buildSqlExecuteTools() {
  return [
    {
      name: 'foretmap_sql_execute',
      title: 'Exécuter une instruction SQL (écriture, admin)',
      description:
        'Une seule instruction SQL en ÉCRITURE (INSERT/UPDATE/DELETE ; DDL/DCL si le réglage mcp.sql_ddl_enabled le permet). CONTOURNE LA LOGIQUE MÉTIER (statuts, avancement des projets, progression, notifications, journal) : pour les tâches, projets, inscriptions et validations, utilise foretmap_tasks / foretmap_api ; réserve cet outil aux corrections de données. Transaction + délai max. dry_run=true : exécute puis annule (DML) ou valide sans exécuter (DDL). Renvoie affectedRows, échantillon, migration_sql idempotente à verser par PR pour le corpus. LOAD DATA / INTO OUTFILE / SHUTDOWN / SET PASSWORD interdits. Colonnes secrètes (password_hash, jetons, secrets) refusées, y compris dans la liste d’un INSERT ou REPLACE ; INSERT/REPLACE sans liste de colonnes refusé. DDL, sans WHERE, WHERE toujours vrai (1=1, col=col, LIKE %, OR 1=1), plafond et tables d’autorisation exigent une confirmation par code e-mail selon le réglage mcp.confirm_mode (confirmation_id + confirmation_code).',
      inputSchema: z.strictObject({
        sql: z.string().min(6).max(8000).describe('Une instruction SQL (sans « ; » final)'),
        dry_run: z.boolean().optional().describe('Exécuter puis annuler (DML) ; défaut false'),
        max_affected_rows: z
          .number()
          .int()
          .min(1)
          .max(1000000)
          .optional()
          .describe('Plafond de lignes affectées (défaut : réglage mcp.sql_max_affected_rows)'),
        ...confirmationFields,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      requires: {
        scope: SCOPES.WRITE,
        permission: ['mcp.use', 'mcp.sql_execute'],
        role: 'admin',
        flag: 'sql_write',
      },
      scrub: (ctx) => (ctx.privacyBypass ? 'secrets' : 'full'),
      handler: async (...callArgs) => withSchemaDriftNote(await sqlExecute(...callArgs)),
    },
  ];
}

module.exports = { buildSqlExecuteTools, withSchemaDriftNote, SCHEMA_DRIFT_NOTE };
