'use strict';

/**
 * Génère une migration SQL idempotente équivalente à une instruction de `foretmap_sql_execute`,
 * uniquement pour les tables de contenu (`CONTENT_TABLES`). Hors corpus → `null` (ne pas verser
 * de données personnelles ni de DCL dans le dépôt).
 */

const { CONTENT_TABLES } = require('../sqlGuard');

/**
 * @param {{ kind: string, subtype: string, tables: string[], sql: string, ast: object|null }} classified
 * @returns {{ migration_sql: string|null, suggested_filename: string|null, warnings: string[], reason: string|null }}
 */
function buildEquivalentMigration(classified) {
  const warnings = [];
  if (classified.kind === 'dcl') {
    return {
      migration_sql: null,
      suggested_filename: null,
      warnings,
      reason: 'DCL : ne pas verser au dépôt',
    };
  }
  const tables = classified.tables || [];
  if (tables.length === 0 || !tables.every((t) => CONTENT_TABLES.has(t))) {
    return {
      migration_sql: null,
      suggested_filename: null,
      warnings,
      reason: 'hors corpus pédagogique — ne pas verser',
    };
  }

  let body = classified.sql.trim();
  const subtype = classified.subtype;

  if (subtype === 'insert' || subtype === 'replace') {
    if (!/^\s*INSERT\s+IGNORE\b/i.test(body) && !/^\s*REPLACE\b/i.test(body)) {
      body = body.replace(/^\s*INSERT\b/i, 'INSERT IGNORE');
      warnings.push('INSERT réécrit en INSERT IGNORE (rejouable si clé unique)');
    }
    if (/^\s*REPLACE\b/i.test(body)) {
      warnings.push('REPLACE : rejeu possible mais destructive si la clé existe');
    }
  } else if (subtype === 'update') {
    // Expressions non constantes (col = col + 1) : non idempotentes.
    if (
      /\bSET\b[\s\S]*?\b(\w+)\s*=\s*\1\b/i.test(body) ||
      /[+\-*/]/g.test(body.split(/\bWHERE\b/i)[0] || '')
    ) {
      // Heuristique légère : présence d'opérateur arithmétique dans le SET.
      const setPart = (body.split(/\bWHERE\b/i)[0] || '').replace(/^[\s\S]*?\bSET\b/i, '');
      if (/[+\-*/]/.test(setPart) && !/'[^']*[+\-*/][^']*'/.test(setPart)) {
        warnings.push('UPDATE avec expression : non idempotent à la relecture');
      }
    }
  } else if (subtype === 'create') {
    if (/^\s*CREATE\s+TABLE\b/i.test(body) && !/\bIF\s+NOT\s+EXISTS\b/i.test(body)) {
      body = body.replace(/^\s*CREATE\s+TABLE\b/i, 'CREATE TABLE IF NOT EXISTS');
      warnings.push('CREATE TABLE → IF NOT EXISTS');
    }
  } else if (subtype === 'alter') {
    if (/\bADD\s+COLUMN\b/i.test(body) && !/\bIF\s+NOT\s+EXISTS\b/i.test(body)) {
      body = body.replace(/\bADD\s+COLUMN\b/i, 'ADD COLUMN IF NOT EXISTS');
      warnings.push('ADD COLUMN → IF NOT EXISTS');
    }
    if (/\bDROP\s+COLUMN\b/i.test(body) && !/\bIF\s+EXISTS\b/i.test(body)) {
      body = body.replace(/\bDROP\s+COLUMN\b/i, 'DROP COLUMN IF EXISTS');
      warnings.push('DROP COLUMN → IF EXISTS');
    }
  } else if (subtype === 'drop') {
    if (/^\s*DROP\s+TABLE\b/i.test(body) && !/\bIF\s+EXISTS\b/i.test(body)) {
      body = body.replace(/^\s*DROP\s+TABLE\b/i, 'DROP TABLE IF EXISTS');
      warnings.push('DROP TABLE → IF EXISTS');
    }
  } else if (subtype === 'truncate') {
    warnings.push('TRUNCATE : non idempotent au sens données (vide la table à chaque rejeu)');
  }

  const stamp = Date.now().toString(36);
  const tableSlug = tables[0] || 'contenu';
  const header = [
    '-- =====================================================================',
    `-- Correction SQL préparée par foretmap_sql_execute (${subtype} sur ${tables.join(', ')}).`,
    '-- Idempotente autant que possible. Verser par PR (numéro NNN libre).',
    '-- =====================================================================',
    '',
    `${body};`,
    '',
  ].join('\n');

  return {
    migration_sql: header,
    suggested_filename: `migrations/NNN_mcp_sql_${tableSlug}_${stamp}.sql`,
    warnings,
    reason: null,
  };
}

module.exports = { buildEquivalentMigration };
