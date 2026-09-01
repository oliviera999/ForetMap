'use strict';

/**
 * Moteur commun des imports/exports XLSX de questions (audit §4.2, paire 1.2) :
 * `glQcmImport` (QCM biomes GL), `glQcmLoreImport` (QCM lore GL) et `fmQuizImport`
 * (quiz ForetMap) partageaient ~50 % de lignes strictement identiques. Ce module
 * mutualise le MOTEUR (parseWorkbook → mapping des entêtes → boucle de validation
 * ligne à ligne → upserts et comptage du rapport) — PAS les schémas de colonnes,
 * qui diffèrent réellement (photos/Wikipédia côté QCM biomes, chapitres/tiers côté
 * lore, thèmes côté quiz ForetMap). Chaque import conserve son schéma, ses
 * validateurs et ses messages d'erreur français exacts (contrats testés).
 */

const { parseWorkbook } = require('../spreadsheet');
const { getGlImportMaxFileBytes, formatImportMaxFileLabel } = require('../glImportLimits');
const { asTrimmedString, normalizeImportHeader } = require('./stringHelpers');

/** Lignes d'une feuille par nom, `[]` si la feuille est absente. */
function readSheetRows(wb, sheetName) {
  return wb.sheetNames.includes(sheetName) ? wb.sheets[sheetName] || [] : [];
}

/** Projette une ligne brute sur les clés canoniques via la table d'alias d'entêtes. */
function mapRow(row = {}, aliases) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = aliases.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

/** Force les URLs http:// en https:// (photos/Wikipédia), `null` si vide. */
function normalizeHttpsUrl(value) {
  const s = asTrimmedString(value);
  if (!s) return null;
  if (/^http:\/\//i.test(s)) return s.replace(/^http:\/\//i, 'https://');
  return s;
}

/**
 * Fabrique la paire format/parse d'un code question `PREFIXNNNN` (zero-pad 4) :
 * `QCM…` (biomes), `LQCM…` (lore), `QF…` (quiz ForetMap).
 */
function createQuestionCodeHelpers(prefix) {
  const codePattern = new RegExp(`^${prefix}(\\d+)$`, 'i');
  return {
    formatQuestionCode(rawId) {
      const n = Number(rawId);
      if (!Number.isFinite(n) || n <= 0) return '';
      return `${prefix}${String(Math.floor(n)).padStart(4, '0')}`;
    },
    parseQuestionIdFromCode(code) {
      const m = codePattern.exec(asTrimmedString(code));
      return m ? Number(m[1]) : '';
    },
  };
}

/**
 * Parse un buffer XLSX après contrôles communs (buffer vide, taille max).
 * Messages d'erreur français exacts, testés côté routes d'import.
 */
async function parseImportWorkbook(buffer, options = {}) {
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  const maxBytes = options.maxFileBytes ?? getGlImportMaxFileBytes('default');
  if (buffer.length > maxBytes) {
    throw new Error(`Fichier import trop volumineux (max ${formatImportMaxFileLabel(maxBytes)})`);
  }
  return parseWorkbook(buffer);
}

/** Décode `body.fileDataBase64` (data-URL tolérée) en buffer ; exige un fichier. */
function decodeImportFileBase64(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  return Buffer.from(raw, 'base64');
}

/**
 * Rapport d'import initial. `extraTotals` porte les compteurs propres au dataset
 * (ex. `scopes_synced` côté lore, `categories_synced`, `glossary_links_synced`).
 */
function buildImportReportBase(dryRun, questionCount, extraTotals = {}) {
  return {
    dryRun,
    sourceType: 'xlsx',
    totals: {
      received: questionCount,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_invalid: 0,
      ...extraTotals,
    },
    preview: [],
    errors: [],
  };
}

/** Garde-fou volumétrie (message français exact, testé). */
function assertMaxImportRows(count, maxRows) {
  if (count > maxRows) throw new Error(`Trop de lignes (max ${maxRows})`);
}

/**
 * Boucle générique de validation ligne à ligne (numérotation tableur : entêtes en
 * ligne 1, données à partir de la ligne 2). Les erreurs alimentent `report.errors` ;
 * `countInvalid` incrémente `totals.skipped_invalid` (feuille questions uniquement).
 * @returns {Array<{rowNumber: number, payload: object}>} lignes valides
 */
function collectValidRows(rows, buildPayload, validate, report, { countInvalid = false } = {}) {
  const valid = [];
  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildPayload(rows[i]);
    const rowErrors = validate(payload, rowNumber);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      if (countInvalid) report.totals.skipped_invalid += 1;
      continue;
    }
    valid.push({ rowNumber, payload });
  }
  return valid;
}

/** Paramètres d'upsert dans l'ordre de la liste de champs (valeurs absentes → NULL). */
function buildParamsFromFieldKeys(payload, fieldKeys) {
  return fieldKeys.map((key) => payload[key] ?? null);
}

/** Codes question existants (le SELECT est une constante du module appelant). */
async function loadExistingQuestionCodes(deps, selectSql) {
  const rows = await deps.queryAll(selectSql);
  return new Set(rows.map((r) => String(r.question_code)));
}

/**
 * Taille de lot des insertions d'import (G4, audit 2026-09) : un import de plusieurs
 * centaines de lignes écrites une à une faisait autant d'allers-retours MySQL séquentiels
 * — assez pour dépasser les 40 s du client (`API_FETCH_TIMEOUT_MS`) pendant que le
 * serveur continuait. Les upserts partent désormais par paquets de 100 lignes.
 */
const IMPORT_INSERT_BATCH_SIZE = 100;

/** Découpe `items` en lots de `size` (le dernier lot peut être plus court). */
function chunkRows(items, size = IMPORT_INSERT_BATCH_SIZE) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Bornes du tuple `VALUES (…)` (parenthèses équilibrées — il peut contenir `NOW()`). */
function locateValuesTuple(sql) {
  const valuesMatch = /\bVALUES\s*\(/i.exec(sql);
  if (!valuesMatch) {
    throw new Error('expandMultiRowInsertSql : clause VALUES introuvable');
  }
  const tupleStart = valuesMatch.index + valuesMatch[0].length - 1;
  let depth = 0;
  for (let i = tupleStart; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    else if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) return { tupleStart, tupleEnd: i };
    }
  }
  throw new Error('expandMultiRowInsertSql : tuple VALUES non fermé');
}

/**
 * Un upsert n'est lotissable par répétition de tuple que si TOUS ses `?` vivent dans le
 * tuple `VALUES` : un paramètre dans `ON DUPLICATE KEY UPDATE` (ex. le
 * `COALESCE(?, caster_kind)` de l'import sortilèges) est unique par requête et ne peut
 * pas porter une valeur différente par ligne.
 */
function isBatchableInsertSql(sql) {
  try {
    const { tupleStart, tupleEnd } = locateValuesTuple(sql);
    return !sql.slice(0, tupleStart).includes('?') && !sql.slice(tupleEnd + 1).includes('?');
  } catch (_) {
    return false;
  }
}

/**
 * Transforme un `INSERT … VALUES (tuple) [ON DUPLICATE …]` mono-ligne en variante
 * multi-lignes : le tuple est répété `rowCount` fois. La clause
 * `ON DUPLICATE KEY UPDATE … VALUES(col)` de MySQL s'applique ligne à ligne, le
 * comportement par ligne est donc inchangé. Refuse un SQL non lotissable (des `?`
 * hors du tuple) dès que `rowCount > 1`.
 */
function expandMultiRowInsertSql(sql, rowCount) {
  if (!Number.isInteger(rowCount) || rowCount < 1) {
    throw new Error(`expandMultiRowInsertSql : rowCount invalide (${rowCount})`);
  }
  const { tupleStart, tupleEnd } = locateValuesTuple(sql);
  if (rowCount > 1 && !isBatchableInsertSql(sql)) {
    throw new Error(
      'expandMultiRowInsertSql : SQL non lotissable (paramètre ? hors du tuple VALUES)',
    );
  }
  const tuple = sql.slice(tupleStart, tupleEnd + 1);
  const tuples = new Array(rowCount).fill(tuple).join(',\n  ');
  return sql.slice(0, tupleStart) + tuples + sql.slice(tupleEnd + 1);
}

/** Comptage créations/mises à jour en dry-run (aucune écriture). */
function countDryRunUpserts(validRows, existingCodes, totals) {
  for (const { payload } of validRows) {
    if (existingCodes.has(payload.question_code)) totals.updated += 1;
    else totals.created += 1;
  }
}

/**
 * Upserts des questions valides + comptage created/updated dans `totals`.
 * Exécution par LOTS de 100 lignes (`expandMultiRowInsertSql`) : le comptage par ligne
 * reste identique (une clé dupliquée à l'intérieur d'un même lot déclenche
 * ON DUPLICATE ligne à ligne, comme en exécution unitaire).
 * `codeOf` extrait la clé de dédoublonnage (question_code par défaut — les imports
 * espèces/sorts/glossaire passent la leur).
 */
async function executeQuestionUpserts(
  deps,
  validRows,
  { sql, buildParams, existingCodes, totals, codeOf = (payload) => payload.question_code },
) {
  // Un SQL non lotissable (des `?` dans ON DUPLICATE, cf. l'import sortilèges) repasse
  // en exécution ligne à ligne : la correction par ligne prime sur le gain du lot.
  const batchable = isBatchableInsertSql(sql);
  for (const chunk of chunkRows(validRows)) {
    const params = [];
    for (const { payload } of chunk) {
      const code = codeOf(payload);
      const existed = existingCodes.has(code);
      if (batchable) params.push(...buildParams(payload));
      else await deps.execute(sql, buildParams(payload));
      if (existed) totals.updated += 1;
      else {
        totals.created += 1;
        existingCodes.add(code);
      }
    }
    if (batchable) {
      await deps.execute(expandMultiRowInsertSql(sql, chunk.length), params);
    }
  }
}

/**
 * Upserts d'un catalogue annexe (catégories, chapitres) par lots ;
 * renvoie le nombre synchronisé.
 */
async function executeCatalogUpserts(deps, payloads, sql, toParams) {
  let count = 0;
  const batchable = isBatchableInsertSql(sql);
  for (const chunk of chunkRows(payloads)) {
    const params = [];
    for (const payload of chunk) {
      if (batchable) params.push(...toParams(payload));
      else await deps.execute(sql, toParams(payload));
      count += 1;
    }
    if (batchable) {
      await deps.execute(expandMultiRowInsertSql(sql, chunk.length), params);
    }
  }
  return count;
}

/**
 * Ligne d'export dans l'ordre des entêtes de la feuille (les clés des lignes d'export
 * portent exactement les noms d'entêtes des gabarits ; valeurs absentes → '').
 */
function rowToExportArrayByHeaders(row, headers) {
  return headers.map((header) => row[header] ?? '');
}

module.exports = {
  readSheetRows,
  mapRow,
  normalizeHttpsUrl,
  createQuestionCodeHelpers,
  parseImportWorkbook,
  decodeImportFileBase64,
  buildImportReportBase,
  assertMaxImportRows,
  collectValidRows,
  buildParamsFromFieldKeys,
  loadExistingQuestionCodes,
  countDryRunUpserts,
  IMPORT_INSERT_BATCH_SIZE,
  chunkRows,
  isBatchableInsertSql,
  expandMultiRowInsertSql,
  executeQuestionUpserts,
  executeCatalogUpserts,
  rowToExportArrayByHeaders,
};
