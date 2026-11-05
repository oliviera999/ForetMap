'use strict';

/**
 * Garde-fous « données personnelles par construction » du connecteur MCP.
 *
 * C'est le **seul** module qui décide quelles tables un outil MCP peut lire. Trois listes :
 *
 * - `CONTENT_TABLES` (liste blanche) : contenu pédagogique, cartes, contenu G&L. Une requête
 *   d'outil ne peut nommer **que** ces tables ; toute autre table lève `McpDataAccessError`.
 * - `AGGREGATE_ONLY_TABLES` : traces produites par les élèves (observations, réponses aux
 *   QCM, lectures de tutoriels, compteurs d'usage). Lisibles **uniquement** par le mode
 *   agrégat (requêtes internes `COUNT`/`SUM` regroupées, seuil n ≥ 5 appliqué ensuite), jamais
 *   par un outil de lecture ordinaire ni par `foretmap_sql_select`.
 * - `DENIED_TABLE_PATTERNS` (liste noire) : comptes, identités, jetons, journaux, forum,
 *   commentaires, notifications, OAuth… Elle **prime** sur les deux listes précédentes : une
 *   table qui y correspond est refusée même si quelqu'un l'ajoutait par erreur à la blanche.
 *
 * Au niveau colonne, `DENIED_COLUMN_RE` refuse dans le texte SQL tout identifiant d'e-mail, de
 * mot de passe, de hachage, de jeton, d'IP, de secret ou d'auteur (`*_by`, `*_user_id`), et
 * `scrubValue` / `scrubRows` retirent en sortie ces clés et masquent les valeurs qui
 * ressemblent à un e-mail, un hachage bcrypt, un JWT ou un jeton MCP (défense en profondeur :
 * un crédit photo a déjà contenu une adresse e-mail, cf. migration 313).
 */

class McpDataAccessError extends Error {
  constructor(message, code = 'MCP_DATA_ACCESS_DENIED') {
    super(message);
    this.name = 'McpDataAccessError';
    this.code = code;
  }
}

/** Liste blanche : tables de contenu lisibles par les outils. */
const CONTENT_TABLES = Object.freeze(
  new Set([
    // Biodiversité ForetMap
    'plants',
    'plant_name_aliases',
    'plant_photos',
    'plant_lookalikes',
    'clades',
    'species_interactions',
    'v_food_web',
    'v_zone_inventory',
    // Cartes, zones, repères
    'maps',
    'zones',
    'zone_species',
    'zone_photos',
    'zone_categories',
    'map_markers',
    'marker_species',
    'marker_photos',
    'marker_categories',
    'map_species',
    'map_routes',
    'map_route_steps',
    'location_categories',
    // Tutoriels, glossaire, QCM, notions, clés
    'tutorials',
    'tutorial_zones',
    'tutorial_markers',
    'glossary_terms',
    'glossary_term_species',
    'glossary_term_tutorials',
    'glossary_term_relations',
    'glossary_term_interactions',
    'glossary_term_notions',
    'glossary_category_notions',
    'quiz_questions',
    'quiz_categories',
    'quiz_question_species',
    'quiz_question_tutorials',
    'quiz_question_notions',
    'quiz_category_notions',
    'resource_question_links',
    'curriculum_notions',
    // Contenus éditoriaux de visite et séances (lot C du connecteur, 05/11/2026).
    'visit_zones',
    'visit_markers',
    'visit_media',
    'visit_tutorials',
    'pedago_sessions',
    'id_keys',
    'id_key_couplets',
    'id_key_leads',
    'schema_version',
    // Gnomes & Licornes — contenu
    'gl_species',
    'gl_species_interactions',
    'gl_glossary_terms',
    'gl_glossary_term_biomes',
    'gl_glossary_term_relations',
    'gl_lore_glossary_terms',
    'gl_lore_glossary_relations',
    'gl_qcm_questions',
    'gl_qcm_categories',
    'gl_qcm_lore_questions',
    'gl_qcm_lore_categories',
    'gl_qcm_lore_scopes',
    'gl_resource_question_links',
    // Table retirée par la migration 186 ; lue seulement si elle existe encore (audit).
    'gl_qcm_question_glossary',
    'gl_chapters',
    'gl_chapter_markers',
    'gl_chapter_biomes',
    'gl_chapter_spells',
    'gl_kingdom_zones',
    'gl_lore_feuillets',
    'gl_lore_plateaux',
    'gl_biomes',
    'gl_spells',
    'gl_spell_categories',
    'gl_tutorials',
    'gl_content_pages',
  ]),
);

/**
 * Traces d'usage et productions d'élèves : agrégats anonymes seulement (seuil n ≥ 5).
 * Jamais lisibles ligne à ligne.
 */
const AGGREGATE_ONLY_TABLES = Object.freeze(
  new Set([
    'usage_counters',
    'species_observations',
    'task_assignments',
    'user_quiz_attempts',
    'user_tutorial_reads',
    'gl_qcm_attempts',
    'interaction_evidence',
  ]),
);

/** Liste noire documentée — prime sur toutes les autres listes. */
const DENIED_TABLE_PATTERNS = Object.freeze([
  /^users$/,
  /^students$/,
  /^teachers$/,
  /^password_reset_tokens$/,
  /^external_identities$/,
  /^external_group_members$/,
  /^security_events$/,
  /^audit_log$/,
  /^elevation_audit$/,
  /^lti_/,
  /^group_members$/,
  /^forum_/,
  /^gl_forum_/,
  /^context_comment/,
  /^gl_context_comment/,
  /^notifications$/,
  /^visit_seen_/,
  /^oauth_/,
  /^mcp_/,
  /^gl_players$/,
  /^gl_player_/,
  /^gl_admins$/,
  /^gl_team_members$/,
  /^task_logs$/,
  /^observation_logs$/,
  /^user_journal/,
  /^sync_/,
  /^app_settings$/,
  /^gl_settings$/,
  /^v_user_totp_status$/,
]);

/**
 * `user_*` est sur la liste noire, **sauf** les deux tables d'usage explicitement admises en
 * agrégat ci-dessus : la règle est écrite à part pour que l'exception soit visible.
 */
const USER_PREFIX_RE = /^user_/;

/**
 * Colonnes interdites, dans le texte SQL comme dans les résultats : e-mail, mot de passe,
 * hachage, jeton, IP, secret, auteur nominatif (`created_by`, `*_user_id`, `owner_*`…).
 */
const DENIED_COLUMN_RE =
  /^(?:.*email.*|.*password.*|.*_hash|.*token.*|.*secret.*|ip_address|user_agent|.*_by|.*_by_user_\w+|.*user_id|owner_\w+|reader_user_\w+|actor_\w+|first_name|last_name|display_name|pseudo|google_sub|payload_json)$/i;

const SQL_DENIED_COLUMN_SCAN_RE =
  /\b(?:\w*email\w*|\w*password\w*|\w+_hash|\w*token\w*|\w*secret\w*|ip_address|user_agent|\w+_by|\w+_by_user_\w+|\w*user_id|owner_\w+|reader_user_\w+|actor_\w+|first_name|last_name|display_name|pseudo|google_sub|payload_json)\b/i;

function normalizeTableName(name) {
  return String(name || '')
    .replace(/`/g, '')
    .trim()
    .toLowerCase();
}

function isDeniedTable(name) {
  const t = normalizeTableName(name);
  if (!t) return true;
  if (AGGREGATE_ONLY_TABLES.has(t)) return false;
  if (USER_PREFIX_RE.test(t)) return true;
  return DENIED_TABLE_PATTERNS.some((re) => re.test(t));
}

/**
 * @param {string} name
 * @param {'content'|'aggregate'} mode
 */
function assertTableReadable(name, mode = 'content') {
  const t = normalizeTableName(name);
  if (isDeniedTable(t)) {
    throw new McpDataAccessError(`Table « ${t} » interdite au connecteur (données personnelles)`);
  }
  if (CONTENT_TABLES.has(t)) return t;
  if (mode === 'aggregate' && AGGREGATE_ONLY_TABLES.has(t)) return t;
  if (AGGREGATE_ONLY_TABLES.has(t)) {
    throw new McpDataAccessError(`Table « ${t} » lisible uniquement en agrégat anonyme (n ≥ 5)`);
  }
  throw new McpDataAccessError(`Table « ${t} » hors de la liste blanche du connecteur`);
}

/** Retire chaînes littérales et commentaires pour analyser la structure d'une requête. */
function stripLiterals(sql) {
  return String(sql || '')
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/**
 * Tables nommées par une requête : identifiants qui suivent `FROM`, `JOIN`, et ceux d'une
 * liste séparée par des virgules dans une clause `FROM` (`FROM a, b`). Les sous-requêtes
 * (`FROM (`) sont parcourues récursivement par le même balayage du texte complet.
 * @returns {string[]}
 */
function extractTableNames(sql) {
  const text = stripLiterals(sql);
  const out = new Set();
  const re =
    /\b(?:FROM|JOIN)\s+((?:`?[A-Za-z0-9_$.]+`?(?:\s+(?:AS\s+)?`?[A-Za-z0-9_]+`?)?\s*,\s*)*`?[A-Za-z0-9_$.]+`?)/gi;
  let m;
  while ((m = re.exec(text))) {
    for (const part of m[1].split(',')) {
      const ident = part.trim().split(/\s+/)[0];
      if (ident) out.add(ident.replace(/`/g, '').toLowerCase());
    }
  }
  return [...out];
}

/**
 * Vérifie qu'une requête ne lit que des tables admises et ne nomme aucune colonne interdite.
 * @param {string} sql
 * @param {{ mode?: 'content'|'aggregate', allowInformationSchemaTables?: boolean }} [opts]
 */
function assertSqlReadable(sql, opts = {}) {
  const mode = opts.mode || 'content';
  const text = stripLiterals(sql);
  for (const table of extractTableNames(sql)) {
    if (table.includes('.')) {
      const [schema, name] = table.split('.');
      if (
        opts.allowInformationSchemaTables &&
        schema === 'information_schema' &&
        (name === 'tables' || name === 'columns')
      ) {
        continue;
      }
      throw new McpDataAccessError(`Référence qualifiée « ${table} » refusée`);
    }
    assertTableReadable(table, mode);
  }
  const deniedCol = SQL_DENIED_COLUMN_SCAN_RE.exec(text);
  if (deniedCol) {
    throw new McpDataAccessError(`Colonne « ${deniedCol[0]} » interdite au connecteur`);
  }
  return true;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BCRYPT_RE = /\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{20,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const MCP_TOKEN_RE = /\bfmcp_(?:at|rt|ac)_[A-Za-z0-9_-]{16,}/g;

/** Masque dans une chaîne tout ce qui ressemble à un e-mail, un hachage ou un jeton. */
function scrubString(value) {
  return String(value)
    .replace(BCRYPT_RE, '[hachage masqué]')
    .replace(JWT_RE, '[jeton masqué]')
    .replace(MCP_TOKEN_RE, '[jeton masqué]')
    .replace(EMAIL_RE, '[e-mail masqué]');
}

/** Copie profonde nettoyée : clés interdites retirées, valeurs sensibles masquées. */
function scrubValue(value, depth = 0) {
  if (depth > 12) return null;
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '[binaire]';
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (DENIED_COLUMN_RE.test(k)) continue;
      out[k] = scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function scrubRows(rows) {
  return Array.isArray(rows) ? rows.map((r) => scrubValue(r)) : [];
}

/** Motifs utilisés par le test anti-PII (sérialisation de toutes les réponses d'outils). */
const PII_LEAK_PATTERNS = Object.freeze([
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{20,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\bfmcp_(?:at|rt|ac)_[A-Za-z0-9_-]{16,}/,
]);

module.exports = {
  AGGREGATE_ONLY_TABLES,
  CONTENT_TABLES,
  DENIED_COLUMN_RE,
  DENIED_TABLE_PATTERNS,
  McpDataAccessError,
  PII_LEAK_PATTERNS,
  assertSqlReadable,
  assertTableReadable,
  extractTableNames,
  isDeniedTable,
  scrubRows,
  scrubString,
  scrubValue,
  stripLiterals,
};
