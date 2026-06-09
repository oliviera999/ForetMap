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
const ExcelJS = require('exceljs');

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
    if (has) { headerRowNum = r; break; }
  }
  if (headerRowNum == null) return [];

  const headers = {};
  ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, col) => {
    const text = cellToText(cell);
    if (text.trim() !== '') headers[col] = text;
  });
  const cols = Object.keys(headers).map(Number).sort((a, b) => a - b);
  if (cols.length === 0) return [];

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
  const wb = new ExcelJS.Workbook();
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
  const wb = new ExcelJS.Workbook();
  const list = Array.isArray(sheets) ? sheets : [];
  for (const entry of list) {
    const ws = wb.addWorksheet(entry?.name || 'Feuille1');
    for (const row of (entry?.aoa || [])) ws.addRow(Array.isArray(row) ? row : [row]);
  }
  if (wb.worksheets.length === 0) wb.addWorksheet('Feuille1');
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

/** Équivalent json_to_sheet(rows, { header }) → aoa [header, ...valeurs ordonnées]. */
function jsonRowsToAoa(rows, header) {
  const cols = Array.isArray(header) ? header : (rows[0] ? Object.keys(rows[0]) : []);
  const body = (rows || []).map((r) => cols.map((c) => {
    const v = r ? r[c] : '';
    return v === null || v === undefined ? '' : v;
  }));
  return [cols, ...body];
}

module.exports = {
  parseWorkbook,
  parseFirstSheetRows,
  buildWorkbookBuffer,
  jsonRowsToAoa,
  worksheetToRows,
  cellToText,
};
