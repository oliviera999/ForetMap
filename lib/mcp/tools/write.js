'use strict';

/**
 * Outils MCP d'écriture de contenu (patron plan → apply).
 *
 * Activés par défaut (`MCP_WRITE_ENABLED=true`, décision du propriétaire) mais réservés à la
 * portée `foretmap.write` **et** à la permission `mcp.write` (semée pour le seul profil admin) :
 * un compte prof ne reçoit jamais la portée d'écriture au consentement, ne voit pas ces outils
 * dans `tools/list` et se les voit refuser s'il les appelle quand même.
 */

const { z } = require('zod');
const { SCOPES } = require('../config');
const { applyPlan, exportPlanAsMigration, planContentChange } = require('../write/plans');
const { EDITABLE_FIELDS, LINK_TABLES } = require('../write/operations');

const WRITE_REQUIRES = Object.freeze({
  scope: SCOPES.WRITE,
  permission: ['mcp.use', 'mcp.write'],
  flag: 'write',
});

const keyValue = z.union([z.string().min(1).max(64), z.number().int().positive()]);

const operationSchema = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('set_field'),
    table: z.enum(Object.keys(EDITABLE_FIELDS)),
    key: z.record(z.string(), keyValue).describe('Clé primaire, ex. { "id": 12 }'),
    column: z.string().min(1).max(64),
    value: z.string().max(20000).nullable(),
  }),
  z.strictObject({
    op: z.enum(['link', 'unlink']),
    table: z.enum(Object.keys(LINK_TABLES)),
    key: z.record(z.string(), keyValue).describe('Ex. { "zone_id": "z1", "plant_id": 12 }'),
  }),
]);

function describeEditable() {
  return Object.entries(EDITABLE_FIELDS)
    .map(([t, d]) => `${t}(${Object.keys(d.fields).join(', ')})`)
    .join(' ; ');
}

function buildWriteTools() {
  return [
    {
      name: 'foretmap_plan_content_change',
      title: 'Préparer une correction de contenu',
      description:
        'Prépare (SANS RIEN ÉCRIRE) une correction du contenu pédagogique et renvoie {plan_id, diff avant/après, risques, migration_sql idempotente, rollback_sql}. Opérations : `set_field` (champ texte d’une ligne, par clé primaire) sur ' +
        describeEditable() +
        ' ; `link` / `unlink` d’une espèce (plant_id) sur ' +
        Object.keys(LINK_TABLES).join(', ') +
        '. Au plus 50 opérations. Montrer le diff à la personne avant tout foretmap_apply_plan.',
      inputSchema: z.strictObject({
        operations: z.array(operationSchema).min(1).max(50),
        note: z.string().max(300).optional().describe('Motif de la correction (journalisé)'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      requires: WRITE_REQUIRES,
      handler: (args, ctx) => planContentChange(args, ctx.user),
    },
    {
      name: 'foretmap_apply_plan',
      title: 'Appliquer un plan de correction',
      description:
        'Applique un plan préparé par foretmap_plan_content_change : vérifie que le contenu n’a pas changé depuis le plan (sinon conflit, rien n’est écrit), applique tout en une transaction, journalise dans le journal d’audit et renvoie la migration SQL équivalente à verser dans le dépôt par PR. À n’appeler qu’après accord explicite de la personne sur le diff.',
      inputSchema: z.strictObject({ plan_id: z.string().uuid() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      requires: WRITE_REQUIRES,
      handler: (args, ctx) => applyPlan(args.plan_id, ctx.user),
    },
    {
      name: 'foretmap_export_plan_as_migration',
      title: 'Exporter un plan en migration',
      description:
        'Renvoie seulement la migration SQL idempotente et son rollback pour un plan (appliqué ou non), avec un nom de fichier suggéré : voie « par PR », recommandée pour le corpus semé par les migrations.',
      inputSchema: z.strictObject({ plan_id: z.string().uuid() }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      requires: WRITE_REQUIRES,
      handler: (args, ctx) => exportPlanAsMigration(args.plan_id, ctx.user),
    },
  ];
}

module.exports = { WRITE_REQUIRES, buildWriteTools };
