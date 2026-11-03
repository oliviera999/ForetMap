/**
 * Référentiel des valeurs énumérées — domaine **plateforme** (réglages). Voir `enumCore.js`.
 *
 * Miroir CJS : `lib/shared/platformEnums.js` (généré, ne pas éditer).
 */

import { defineEnum } from './enumCore.js';

/** Portée d'un réglage : qui peut le lire. */
export const SETTING_SCOPE_ENUM = defineEnum('SETTING_SCOPE_ENUM', {
  values: ['public', 'teacher', 'admin'],
  labels: { public: 'Public', teacher: 'Personnel', admin: 'Administration' },
  columns: ['app_settings.scope'],
});

/** Mode d'une exécution de la purge planifiée (`retention_purge_runs`, migration 319). */
export const RETENTION_PURGE_MODE_ENUM = defineEnum('RETENTION_PURGE_MODE_ENUM', {
  values: ['simulation', 'apply'],
  labels: { simulation: 'Simulation', apply: 'Exécution réelle' },
  columns: ['retention_purge_runs.mode'],
});

/** Issue d'une exécution de la purge planifiée. */
export const RETENTION_PURGE_OUTCOME_ENUM = defineEnum('RETENTION_PURGE_OUTCOME_ENUM', {
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
export const MCP_OAUTH_CLIENT_KIND_ENUM = defineEnum('MCP_OAUTH_CLIENT_KIND_ENUM', {
  values: ['dcr', 'cimd'],
  labels: { dcr: 'Enregistrement dynamique', cimd: 'Document de métadonnées client' },
  columns: ['mcp_oauth_clients.kind'],
});

/** Nature d'un jeton du connecteur MCP (`mcp_oauth_tokens`, migration 324). */
export const MCP_OAUTH_TOKEN_KIND_ENUM = defineEnum('MCP_OAUTH_TOKEN_KIND_ENUM', {
  values: ['access', 'refresh'],
  labels: { access: 'Jeton d’accès', refresh: 'Jeton de rafraîchissement' },
  columns: ['mcp_oauth_tokens.kind'],
});

/** État d'un plan d'écriture de contenu du connecteur MCP (`mcp_content_plans`, migration 324). */
export const MCP_CONTENT_PLAN_STATUS_ENUM = defineEnum('MCP_CONTENT_PLAN_STATUS_ENUM', {
  values: ['planned', 'applied', 'expired', 'conflict'],
  labels: {
    planned: 'Préparé',
    applied: 'Appliqué',
    expired: 'Expiré',
    conflict: 'Refusé (contenu modifié entre-temps)',
  },
  columns: ['mcp_content_plans.status'],
});

/** Portée d'une note de mémoire du connecteur MCP (`mcp_memory`, migration 325). */
export const MCP_MEMORY_SCOPE_ENUM = defineEnum('MCP_MEMORY_SCOPE_ENUM', {
  values: ['site', 'user'],
  labels: { site: 'Partagée (site)', user: 'Personnelle' },
  columns: ['mcp_memory.scope'],
});

/** Origine d'un rapport de santé (`mcp_health_reports`, migration 325). */
export const MCP_HEALTH_REPORT_SOURCE_ENUM = defineEnum('MCP_HEALTH_REPORT_SOURCE_ENUM', {
  values: ['cron', 'tool'],
  labels: { cron: 'Tâche planifiée', tool: 'Outil du connecteur' },
  columns: ['mcp_health_reports.source'],
});

/** Statut global d'un rapport de santé (`mcp_health_reports`, migration 325). */
export const MCP_HEALTH_STATUS_ENUM = defineEnum('MCP_HEALTH_STATUS_ENUM', {
  values: ['green', 'orange', 'red'],
  labels: { green: 'Vert', orange: 'Orange', red: 'Rouge' },
  columns: ['mcp_health_reports.status'],
});

/** Issue d'une exécution de tâche planifiée (`scheduled_job_runs`, migration 325). */
export const SCHEDULED_JOB_OUTCOME_ENUM = defineEnum('SCHEDULED_JOB_OUTCOME_ENUM', {
  values: ['running', 'success', 'failure'],
  labels: { running: 'En cours', success: 'Succès', failure: 'Échec' },
  columns: ['scheduled_job_runs.outcome'],
});
