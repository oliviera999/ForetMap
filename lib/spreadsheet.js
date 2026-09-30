'use strict';

/**
 * Adaptateur tableur basé sur `exceljs` (remplace `xlsx`/SheetJS, vulnérable : CVE-2023-30533
 * prototype pollution + CVE-2024-22363 ReDoS, non corrigées sur npm).
 *
 * Reproduit le comportement utilisé par les importeurs : `XLSX.utils.sheet_to_json(ws,
 * { defval: '', raw: false, blankrows: false })` — c.-à-d. première ligne = en-têtes, chaque
 * ligne de données → objet { en-tête: texte cellule } (cellules vides → '', lignes vides ignorées).
 * Les importeurs normalisent ensuite les clés (`normalizeImportHeader`) : seules la normalisation
 * et les valeurs comptent, pas la chaîne d'en-tête exacte.
 *
 * exceljs étant asynchrone, les fonctions de lecture/écriture renvoient des promesses.
 */
// Chargé au premier usage : ~+30 Mo de RSS et ~180 ms de require pour des
// imports/exports occasionnels (audit docs/AUDIT_CHARGE_SERVEUR_2026-08.md, piste 1).
let ExcelJSLazy = null;
function getExcelJS() {
  if (!ExcelJSLazy) ExcelJSLazy = require('exceljs');
  return ExcelJSLazy;
}

const { httpError } = require('./shared/httpError');

/**
 * Bornes de lecture d'un classeur (audit sécurité du 30/09/2026, AP9 — bombe ZIP).
 *
 * Un `.xlsx` est une archive ZIP : `exceljs.load` décompressait tout avant le moindre contrôle.
 * On lit d'abord le répertoire central (tailles **déclarées**, sans rien décompresser) et on
 * refuse une archive dont le total dépasse le plafond, puis on borne le nombre de lignes lues
 * par feuille. Les défauts couvrent largement les imports légitimes (≤ 2 000 lignes, fichiers
 * ≤ 32 Mo avec images).
 */
function parsePositiveIntEnv(name, fallback) {
  const n = parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function spreadsheetLimits() {
  return {
    maxUncompressedBytes: parsePositiveIntEnv(
      'FORETMAP_SPREADSHEET_MAX_UNCOMPRESSED_BYTES',
      128 * 1024 * 1024,
    ),
    maxEntries: parsePositiveIntEnv('FORETMAP_SPREADSHEET_MAX_ENTRIES', 5000),
    maxRows: parsePositiveIntEnv('FORETMAP_SPREADSHEET_MAX_ROWS', 50000),
  };
}

/**
 * Refuse (400) une archive XLSX dont la taille décompressée déclarée ou le nombre d'entrées
 * dépasse les plafonds. Une archive illisible est laissée à `exceljs` (message d'origine).
 * @param {Buffer} buffer
 */
function assertSpreadsheetArchiveWithinLimits(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return;
  // Signature ZIP « PK\x03\x04 » : sinon ce n'est pas un .xlsx, exceljs répondra.
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return;
  const { maxUncompressedBytes, maxEntries } = spreadsheetLimits();
  let entries;
  try {
    const AdmZip = require('adm-zip');
    entries = new AdmZip(buffer).getEntries();
  } catch {
    return;
  }
  if (entries.length > maxEntries) {
    throw httpError(400, 'Classeur invalide : trop de parties dans l’archive');
  }
  let total = 0;
  for (const entry of entries) {
    const declared = Number(entry?.header?.size);
    total += Number.isFinite(declared) && declared > 0 ? declared : 0;
    if (total > maxUncompressedBytes) {
      throw httpError(400, 'Classeur trop volumineux une fois décompressé');
    }
  }
}

/** Texte d'une cellule, équivalent `raw:false` (valeur formatée affichée). Vide → ''. */
function cellToText(cell) {
  if (!cell) return '';
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return cell.text == null ? '' : String(cell.text);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((rt) => (rt && rt.text) || '').join('');
    if (v.formula !== undefined || v.sharedFormula !== undefined) {
      return v.result === null || v.result === undefined ? '' : String(v.result);
    }
    if (v.hyperlink !== undefined && v.text !== undefined) return String(v.text);
    if (v.error) return '';
    return cell.text == null ? '' : String(cell.text);
  }
  return String(v);
}

/** Convertit une worksheet exceljs en tableau d'objets (sheet_to_json defval:'' raw:false blankrows:false). */
function worksheetToRows(ws) {
  if (!ws || !ws.rowCount) return [];

  // En-têtes : première ligne contenant du texte.
  let headerRowNum = null;
  for (let r = 1; r <= ws.rowCount; r += 1) {
    let has = false;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (cellToText(cell).trim() !== '') has = true;
    });
    if (has) {
      headerRowNum = r;
      break;
    }
  }
  if (headerRowNum == null) return [];

  const headers = {};
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, col) => {
    const text = cellToText(cell);
    if (text.trim() !== '') headers[col] = text;
  });
  const cols = Object.keys(headers)
    .map(Number)
    .sort((a, b) => a - b);
  if (cols.length === 0) return [];

  const { maxRows } = spreadsheetLimits();
  if (ws.rowCount - headerRowNum > maxRows) {
    throw httpError(400, `Feuille « ${ws.name} » trop longue (max ${maxRows} lignes)`);
  }
  const out = [];
  for (let r = headerRowNum + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const obj = {};
    let nonEmpty = false;
    for (const col of cols) {
      const val = cellToText(row.getCell(col));
      obj[headers[col]] = val; // defval '' (cellToText renvoie '' si vide)
      if (val !== '') nonEmpty = true;
    }
    if (!nonEmpty) continue; // blankrows:false
    out.push(obj);
  }
  return out;
}

async function loadWorkbook(buffer) {
  assertSpreadsheetArchiveWithinLimits(buffer);
  const wb = new (getExcelJS().Workbook)();
  await wb.xlsx.load(buffer);
  return wb;
}

/**
 * Lit un classeur : { sheetNames, sheets: { nom: rows[] }, rows: rows[] (première feuille) }.
 * Couvre les 3 usages : première feuille, feuille nommée, test de présence (`sheetNames.includes`).
 */
async function parseWorkbook(buffer) {
  const wb = await loadWorkbook(buffer);
  const sheetNames = wb.worksheets.map((w) => w.name);
  const sheets = {};
  for (const ws of wb.worksheets) sheets[ws.name] = worksheetToRows(ws);
  return { sheetNames, sheets, rows: sheetNames.length ? sheets[sheetNames[0]] : [] };
}

/** Raccourci : lignes de la première feuille. */
async function parseFirstSheetRows(buffer) {
  return (await parseWorkbook(buffer)).rows;
}

/**
 * Construit un buffer .xlsx depuis des feuilles décrites en tableaux de tableaux (aoa).
 * @param {{ name: string, aoa: Array<Array<any>> }[]} sheets
 */
async function buildWorkbookBuffer(sheets) {
  const wb = new (getExcelJS().Workbook)();
  const list = Array.isArray(sheets) ? sheets : [];
  for (const entry of list) {
    const ws = wb.addWorksheet(entry?.name || 'Feuille1');
    for (const row of entry?.aoa || []) ws.addRow(Array.isArray(row) ? row : [row]);
  }
  if (wb.worksheets.length === 0) wb.addWorksheet('Feuille1');
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

/** Équivalent json_to_sheet(rows, { header }) → aoa [header, ...valeurs ordonnées]. */
function jsonRowsToAoa(rows, header) {
  const cols = Array.isArray(header) ? header : rows[0] ? Object.keys(rows[0]) : [];
  const body = (rows || []).map((r) =>
    cols.map((c) => {
      const v = r ? r[c] : '';
      return v === null || v === undefined ? '' : v;
    }),
  );
  return [cols, ...body];
}

module.exports = {
  assertSpreadsheetArchiveWithinLimits,
  parseWorkbook,
  parseFirstSheetRows,
  buildWorkbookBuffer,
  jsonRowsToAoa,
  worksheetToRows,
  cellToText,
};
