'use strict';

const XLSX = require('xlsx');

/**
 * Outils d'import joueurs Gnomes & Licornes (CSV / XLSX).
 *
 * Pattern aligné sur `routes/students.js` : alias d'en-têtes français/anglais,
 * parsing CSV maison (`;` ou `,`), parsing XLSX via la lib `xlsx`. Pas de
 * dépendance à Express : le module est purement fonctionnel et testable.
 */

const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;

const TEMPLATE_COLUMNS = [
  'Prénom',
  'Nom',
  'Pseudo',
  'Mot de passe',
  'Classe',
];

const TEMPLATE_SAMPLE_ROW = [
  'Aurore',
  'Dupont',
  'equipe_aurore',
  'azerty123',
  '6e A',
];

const IMPORT_HEADER_ALIASES = new Map([
  ['prenom', 'firstName'],
  ['prénom', 'firstName'],
  ['first_name', 'firstName'],
  ['firstname', 'firstName'],
  ['first', 'firstName'],
  ['nom', 'lastName'],
  ['last_name', 'lastName'],
  ['lastname', 'lastName'],
  ['last', 'lastName'],
  ['pseudo', 'pseudo'],
  ['equipe', 'pseudo'],
  ['équipe', 'pseudo'],
  ['team', 'pseudo'],
  ['mot_de_passe', 'password'],
  ['motdepasse', 'password'],
  ['mdp', 'password'],
  ['password', 'password'],
  ['pass', 'password'],
  ['classe', 'className'],
  ['class', 'className'],
  ['class_name', 'className'],
  ['classname', 'className'],
  ['groupe', 'className'],
]);

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function normalizeImportHeader(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].split(';').length >= lines[0].split(',').length) ? ';' : ',';
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

function parseWorkbookRowsFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, blankrows: false });
}

function mapRowToPlayerShape(row = {}) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const target = IMPORT_HEADER_ALIASES.get(normalizeImportHeader(key));
    if (!target) continue;
    mapped[target] = value;
  }
  return mapped;
}

function buildPlayerImportPayload(row = {}) {
  const mapped = mapRowToPlayerShape(row);
  return {
    firstName: asTrimmedString(mapped.firstName),
    lastName: asTrimmedString(mapped.lastName),
    pseudo: normalizeOptionalString(mapped.pseudo),
    password: asTrimmedString(mapped.password),
    className: normalizeOptionalString(mapped.className),
  };
}

/**
 * Valide une ligne import joueur GL.
 *
 * @param {object} payload — résultat de `buildPlayerImportPayload`.
 * @param {number} rowNumber — numéro humain (en-tête = 1, première ligne = 2).
 * @param {object} options
 * @param {number} options.passwordMinLength — longueur min mot de passe (mot de passe peut rester vide → must_reset=1).
 * @returns {Array<{row:number,field:string,error:string}>}
 */
function validatePlayerImportPayload(payload, rowNumber, { passwordMinLength = 4 } = {}) {
  const errors = [];
  if (!payload.firstName) errors.push({ row: rowNumber, field: 'firstName', error: 'Prénom requis' });
  if (!payload.lastName) errors.push({ row: rowNumber, field: 'lastName', error: 'Nom requis' });
  if (!payload.className) errors.push({ row: rowNumber, field: 'className', error: 'Classe requise (doit déjà exister)' });
  if (payload.pseudo != null && !PSEUDO_RE.test(payload.pseudo)) {
    errors.push({ row: rowNumber, field: 'pseudo', error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)' });
  }
  if (payload.password) {
    const min = Math.max(4, Number(passwordMinLength) || 4);
    if (payload.password.length < min) {
      errors.push({ row: rowNumber, field: 'password', error: `Mot de passe trop court (min ${min} caractères)` });
    }
  }
  return errors;
}

/**
 * Décode un fichier CSV/XLSX encodé base64 et renvoie les lignes brutes (objets de cellules).
 * @throws Error pour fichier vide, trop volumineux ou format non supporté.
 */
function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw new Error('Fichier import trop volumineux (max 8 Mo)');
  const fileName = asTrimmedString(body.fileName).toLowerCase();
  if (fileName.endsWith('.csv')) return parseCsvRowsFromBuffer(buffer);
  return parseWorkbookRowsFromBuffer(buffer);
}

function csvEscape(value) {
  const s = String(value ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildCsvTemplate() {
  const BOM = '\uFEFF';
  const header = TEMPLATE_COLUMNS.map(csvEscape).join(';');
  const sample = TEMPLATE_SAMPLE_ROW.map(csvEscape).join(';');
  return `${BOM}${header}\r\n${sample}\r\n`;
}

function buildXlsxTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, TEMPLATE_SAMPLE_ROW]);
  XLSX.utils.book_append_sheet(wb, ws, 'Joueurs GL');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  TEMPLATE_COLUMNS,
  TEMPLATE_SAMPLE_ROW,
  PSEUDO_RE,
  asTrimmedString,
  normalizeOptionalString,
  buildPlayerImportPayload,
  validatePlayerImportPayload,
  resolveImportRows,
  buildCsvTemplate,
  buildXlsxTemplate,
};
