'use strict';

/**
 * Réglages du connecteur Claude (MCP distant, `lib/mcp/`) — domaine « connecteur Claude ».
 *
 * Décision du propriétaire (05/11/2026) : **tout est ouvert par défaut** et paramétrable ici ;
 * une variable d'environnement posée gagne toujours et **verrouille** la clé (l'interface
 * l'affiche grisée, « fixé par le serveur »). La résolution env > base > défaut vit dans
 * `lib/mcp/config.js` (`resolveMcpSettings`) ; ce fichier ne fait que déclarer les clés.
 *
 * Ce module est **pur** (aucun accès base) : le script stdio Cursor le charge à travers
 * `lib/mcp/config.js` pour connaître les défauts.
 *
 * Portée `admin` : ces clés ne sont jamais servies par `GET /api/settings/public`.
 *
 * Non négociable, quel que soit le réglage : aucun secret ne sort (hachages, TOTP, jetons,
 * `.env`), chaque écriture et chaque lecture nominative est journalisée (`via: 'mcp'`), et la
 * porte d'entrée reste OAuth + TOTP + `mcp.use`, sous l'interrupteur général `MCP_ENABLED`.
 */

const MCP_DOMAIN_NAMES = Object.freeze([
  'tasks',
  'task_projects',
  'students',
  'groups',
  'tutorials',
  'learning',
  'quiz',
  'glossary',
  'curriculum',
  'pedago_sessions',
  'species',
  'food_web',
  'observations',
  'id_keys',
  'maps',
  'visit',
  'plans',
  'social',
  'settings',
  'rbac',
  'audit_log',
  'calendar',
  'moodle',
  'stats',
  'ops',
  // Gnomes & Licornes (outils `gl_*`, pont G&L `lib/mcp/glBridge.js`).
  'gl',
]);

const HTTP_METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const MCP_SETTINGS = {
  /** `direct` : `foretmap_content_change` et écritures immédiates ; `plan` : plan → apply. */
  'mcp.write_mode': {
    scope: 'admin',
    type: 'enum',
    values: ['direct', 'plan'],
    default: 'direct',
  },
  /** Qui reçoit la portée `foretmap.write` au consentement OAuth : tout compte `mcp.use`
   *  (`app_permissions` : le pont agit avec ses droits applicatifs) ou `mcp.write` seulement. */
  'mcp.write_scope_policy': {
    scope: 'admin',
    type: 'enum',
    values: ['app_permissions', 'admin_only'],
    default: 'app_permissions',
  },
  /** Pont interne `foretmap_api` et écritures des outils de domaine. */
  'mcp.api_bridge_enabled': { scope: 'admin', type: 'boolean', default: true },
  /** Méthodes HTTP admises par le pont (liste séparée par des virgules). */
  'mcp.api_bridge_methods': {
    scope: 'admin',
    type: 'string',
    maxLength: 60,
    default: HTTP_METHODS.join(','),
  },
  /** Routes d'authentification sensibles par le pont (prise de contrôle, enrôlement TOTP,
   *  renouvellement de session…). Fermé par défaut ; les jetons renvoyés restent masqués. */
  'mcp.api_bridge_sensitive_auth': { scope: 'admin', type: 'boolean', default: false },
  /** Domaines d'outils retirés (`tasks`, `students`, `maps`…), séparés par des virgules. */
  'mcp.domains_disabled': { scope: 'admin', type: 'string', maxLength: 600, default: '' },
  /** `foretmap_sql_select`. */
  'mcp.sql_select_enabled': { scope: 'admin', type: 'boolean', default: true },
  /** `auto` : compte `DB_MCP_USER` s'il existe, sinon pool principal en transaction READ ONLY. */
  'mcp.sql_select_pool': {
    scope: 'admin',
    type: 'enum',
    values: ['auto', 'dedicated_only'],
    default: 'auto',
  },
  /** `foretmap_sql_execute` (DML). */
  'mcp.sql_write_enabled': { scope: 'admin', type: 'boolean', default: true },
  /** DDL / DCL dans `foretmap_sql_execute`. */
  'mcp.sql_ddl_enabled': { scope: 'admin', type: 'boolean', default: true },
  /** Plafond de lignes touchées par instruction. */
  'mcp.sql_max_affected_rows': {
    scope: 'admin',
    type: 'number',
    min: 1,
    max: 1_000_000,
    default: 10_000,
  },
  /** Confirmation par code e-mail : `off`, `sensitive` (opérations sensibles), `all_writes`. */
  'mcp.confirm_mode': {
    scope: 'admin',
    type: 'enum',
    values: ['off', 'sensitive', 'all_writes'],
    default: 'off',
  },
  /** Données nominatives d'élèves (lecture et écriture) pour les porteurs de `mcp.privacy_bypass`. */
  'mcp.privacy_bypass': { scope: 'admin', type: 'boolean', default: true },
  /** Accusé de lecture du registre de traitement (AAAA-MM-JJ), informatif. */
  'mcp.privacy_bypass_ack': { scope: 'admin', type: 'string', maxLength: 10, default: '' },
  /** Détail de la ligne d'audit d'une lecture nominative (il n'existe pas de valeur `off`). */
  'mcp.privacy_reads_audit_details': {
    scope: 'admin',
    type: 'enum',
    values: ['summary', 'full'],
    default: 'summary',
  },
  /** `foretmap_ops` (tâches planifiées, migrations, redémarrage, sauvegarde…). */
  'mcp.ops_enabled': { scope: 'admin', type: 'boolean', default: true },
  /** Outils de consultation des fichiers du serveur. */
  'mcp.files_enabled': { scope: 'admin', type: 'boolean', default: true },
  /** Plafond de lignes des lectures. */
  'mcp.max_rows': { scope: 'admin', type: 'number', min: 50, max: 5000, default: 2000 },
  /** Plafond de caractères d'une réponse d'outil (au-delà : `foretmap_export`). */
  'mcp.max_output_chars': {
    scope: 'admin',
    type: 'number',
    min: 20_000,
    max: 2_000_000,
    default: 400_000,
  },
  /** `complet` : tous les outils ; `essentiel` : socle, tâches, élèves, groupes, espèces,
   *  cartes, réglages (si le choix d'outil par Claude se dégrade). */
  'mcp.tool_profile': {
    scope: 'admin',
    type: 'enum',
    values: ['complet', 'essentiel'],
    default: 'complet',
  },
};

module.exports = { HTTP_METHODS, MCP_DOMAIN_NAMES, MCP_SETTINGS };
