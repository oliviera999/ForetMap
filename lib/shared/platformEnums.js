/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/enums/platformEnums.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Référentiel des valeurs énumérées — domaine **plateforme** (réglages). Voir `enumCore.js`.
 *
 * Miroir CJS : `lib/shared/platformEnums.js` (généré, ne pas éditer).
 */

const { defineEnum } = require('./enumCore');

/** Portée d'un réglage : qui peut le lire. */
const SETTING_SCOPE_ENUM = defineEnum('SETTING_SCOPE_ENUM', {
  values: ['public', 'teacher', 'admin'],
  labels: { public: 'Public', teacher: 'Personnel', admin: 'Administration' },
  columns: ['app_settings.scope'],
});

/** Mode d'une exécution de la purge planifiée (`retention_purge_runs`, migration 319). */
const RETENTION_PURGE_MODE_ENUM = defineEnum('RETENTION_PURGE_MODE_ENUM', {
  values: ['simulation', 'apply'],
  labels: { simulation: 'Simulation', apply: 'Exécution réelle' },
  columns: ['retention_purge_runs.mode'],
});

/** Issue d'une exécution de la purge planifiée. */
const RETENTION_PURGE_OUTCOME_ENUM = defineEnum('RETENTION_PURGE_OUTCOME_ENUM', {
  values: ['running', 'success', 'blocked', 'failure', 'interrupted'],
  labels: {
    running: 'En cours',
    success: 'Réussie',
    blocked: 'Bloquée par un seuil',
    failure: 'En échec',
    interrupted: 'Interrompue',
  },
  columns: ['retention_purge_runs.outcome'],
});

/** Origine d'un client OAuth du connecteur MCP (`mcp_oauth_clients`, migration 324). */
const MCP_OAUTH_CLIENT_KIND_ENUM = defineEnum('MCP_OAUTH_CLIENT_KIND_ENUM', {
  values: ['dcr', 'cimd'],
  labels: { dcr: 'Enregistrement dynamique', cimd: 'Document de métadonnées client' },
  columns: ['mcp_oauth_clients.kind'],
});

/** Nature d'un jeton du connecteur MCP (`mcp_oauth_tokens`, migration 324). */
const MCP_OAUTH_TOKEN_KIND_ENUM = defineEnum('MCP_OAUTH_TOKEN_KIND_ENUM', {
  values: ['access', 'refresh'],
  labels: { access: 'Jeton d’accès', refresh: 'Jeton de rafraîchissement' },
  columns: ['mcp_oauth_tokens.kind'],
});

/** État d'un plan d'écriture de contenu du connecteur MCP (`mcp_content_plans`, migration 324). */
const MCP_CONTENT_PLAN_STATUS_ENUM = defineEnum('MCP_CONTENT_PLAN_STATUS_ENUM', {
  values: ['planned', 'applied', 'expired', 'conflict'],
  labels: {
    planned: 'Préparé',
    applied: 'Appliqué',
    expired: 'Expiré',
    conflict: 'Refusé (contenu modifié entre-temps)',
  },
  columns: ['mcp_content_plans.status'],
});

module.exports = {
  SETTING_SCOPE_ENUM,
  RETENTION_PURGE_MODE_ENUM,
  RETENTION_PURGE_OUTCOME_ENUM,
  MCP_OAUTH_CLIENT_KIND_ENUM,
  MCP_OAUTH_TOKEN_KIND_ENUM,
  MCP_CONTENT_PLAN_STATUS_ENUM,
};
