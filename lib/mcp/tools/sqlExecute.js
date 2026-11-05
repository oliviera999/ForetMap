'use strict';

/**
 * `foretmap_sql_execute` — une instruction SQL en écriture (admin, mode productivité).
 *
 * Drapeaux : `MCP_SQL_WRITE_ENABLED` (outil), `MCP_SQL_DDL_ENABLED` (DDL/DCL).
 * Confirmation par code pour DDL/DCL, UPDATE/DELETE sans WHERE, tables d'autorisation,
 * dépassement de `max_affected_rows`.
 */

const { z } = require('zod');
const { SCOPES } = require('../config');
const { confirmationFields } = require('../confirm');
const { sqlExecute } = require('../sqlWrite/execute');

function buildSqlExecuteTools() {
  return [
    {
      name: 'foretmap_sql_execute',
      title: 'Exécuter une instruction SQL (écriture, admin)',
      description:
        'Une seule instruction SQL en ÉCRITURE (INSERT/UPDATE/DELETE ; DDL/DCL si MCP_SQL_DDL_ENABLED). Transaction + délai max. dry_run=true : exécute puis annule (DML) ou valide sans exécuter (DDL). Renvoie affectedRows, échantillon, migration_sql idempotente à verser par PR pour le corpus. LOAD DATA / INTO OUTFILE / SHUTDOWN / SET PASSWORD interdits. Colonnes secrètes (password_hash, jetons, secrets) refusées, y compris dans la liste d’un INSERT ou REPLACE ; INSERT/REPLACE sans liste de colonnes refusé. DDL, sans WHERE, plafond et tables d’autorisation exigent une confirmation par code e-mail (confirmation_id + confirmation_code).',
      inputSchema: z.strictObject({
        sql: z.string().min(6).max(8000).describe('Une instruction SQL (sans « ; » final)'),
        dry_run: z.boolean().optional().describe('Exécuter puis annuler (DML) ; défaut false'),
        max_affected_rows: z
          .number()
          .int()
          .min(1)
          .max(100000)
          .optional()
          .describe('Plafond de lignes affectées (défaut MCP_SQL_MAX_AFFECTED_ROWS)'),
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
      handler: sqlExecute,
    },
  ];
}

module.exports = { buildSqlExecuteTools };
