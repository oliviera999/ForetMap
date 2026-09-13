'use strict';

/**
 * Lecture des fichiers d'import tableur (XLSX / CSV) côté serveur — mutualisé le 13/09/2026
 * (audit §4.2) : `glPlayersImport`, `studentRouteHelpers`, `tasks/taskImport`, `groupImport`
 * et `plantsRouteHelpers` portaient chacun la même copie du parseur CSV, de l'échappement CSV
 * et du décodage base64 → lignes. Un correctif du parseur se fait ici, une fois.
 *
 * Les importeurs G&L par classeur (`gl*Import.js`) passent par `resolveWorkbookImportRows`,
 * qui ne fait que décoder le fichier et confier le tampon au parseur métier fourni.
 */
const { asTrimmedString } = require('./shared/stringHelpers');
const { parseFirstSheetRows } = require('./spreadsheet');

/** Plafond commun des fichiers d'import (8 Mo), identique dans toutes les copies historiques. */
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;

/** Décode `fileDataBase64` (avec ou sans préfixe data:), ou lève « Fichier requis ». */
function decodeImportFileBase64(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  return Buffer.from(raw, 'base64');
}

/**
 * Lignes d'un classeur métier : décodage puis parseur fourni (`parseSpeciesWorkbook`…).
 * @param {object} body corps de requête (`fileDataBase64`)
 * @param {(buffer: Buffer) => unknown} parseWorkbook
 */
async function resolveWorkbookImportRows(body, parseWorkbook) {
  return parseWorkbook(decodeImportFileBase64(body));
}

function csvEscape(value) {
  const s = String(value ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCsvRowsFromBuffer(buffer) {
  const text = buffer
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].split(';').length >= lines[0].split(',').length ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map((h) => asTrimmedString(h));
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = idx < cells.length ? cells[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

async function parseWorkbookRowsFromBuffer(buffer) {
  return parseFirstSheetRows(buffer);
}

async function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  if (buffer.length > MAX_IMPORT_FILE_BYTES)
    throw new Error('Fichier import trop volumineux (max 8 Mo)');

  const fileName = asTrimmedString(body.fileName).toLowerCase();
  if (fileName.endsWith('.csv')) return parseCsvRowsFromBuffer(buffer);
  return parseWorkbookRowsFromBuffer(buffer);
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  decodeImportFileBase64,
  resolveWorkbookImportRows,
  csvEscape,
  parseCsvLine,
  parseCsvRowsFromBuffer,
  parseWorkbookRowsFromBuffer,
  resolveImportRows,
};
