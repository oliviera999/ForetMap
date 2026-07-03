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

/** Comptage créations/mises à jour en dry-run (aucune écriture). */
function countDryRunUpserts(validRows, existingCodes, totals) {
  for (const { payload } of validRows) {
    if (existingCodes.has(payload.question_code)) totals.updated += 1;
    else totals.created += 1;
  }
}

/** Upserts des questions valides + comptage created/updated dans `totals`. */
async function executeQuestionUpserts(
  deps,
  validRows,
  { sql, buildParams, existingCodes, totals },
) {
  for (const { payload } of validRows) {
    const existed = existingCodes.has(payload.question_code);
    await deps.execute(sql, buildParams(payload));
    if (existed) totals.updated += 1;
    else {
      totals.created += 1;
      existingCodes.add(payload.question_code);
    }
  }
}

/** Upserts d'un catalogue annexe (catégories, chapitres) ; renvoie le nombre synchronisé. */
async function executeCatalogUpserts(deps, payloads, sql, toParams) {
  let count = 0;
  for (const payload of payloads) {
    await deps.execute(sql, toParams(payload));
    count += 1;
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
  executeQuestionUpserts,
  executeCatalogUpserts,
  rowToExportArrayByHeaders,
};
