'use strict';

/**
 * Logique pure de `routes/students.js` (O10) : constantes (limites, regex, colonnes
 * du modèle d'import), parsing CSV / classeur en mémoire, mapping et validation des
 * lignes d'import, normalisations (mascotte de visite, type d'utilisateur importé,
 * extension d'avatar) et échappement CSV. Déplacement byte-identique depuis la
 * route — aucune I/O directe, aucun accès req/res/DB ni système de fichiers
 * (parseFirstSheetRows et Buffer travaillent en mémoire uniquement).
 */

const { asTrimmedString, normalizeImportHeader } = require('./shared/stringHelpers');
const { parseFirstSheetRows } = require('./spreadsheet');
const { parseStudentAffiliationInput } = require('./studentAffiliation');
const { normalizeOptionalString } = require('./shared/httpHelpers');

const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPLATE_COLUMNS = [
  'Rôle',
  'Prénom',
  'Nom',
  'Mot de passe',
  'Affiliation (n3|foret|both|id_carte)',
  'Pseudo (optionnel)',
  'Email (optionnel)',
  'Description (optionnel)',
];

const ALLOWED_IMPORT_USER_TYPES = new Set(['student', 'teacher']);

const IMPORT_HEADER_ALIASES = new Map([
  ['role', 'userType'],
  ['rôle', 'userType'],
  ['profil', 'userType'],
  ['type', 'userType'],
  ['user_type', 'userType'],
  ['utilisateur_type', 'userType'],
  ['prenom', 'firstName'],
  ['prénom', 'firstName'],
  ['first_name', 'firstName'],
  ['firstname', 'firstName'],
  ['first', 'firstName'],
  ['nom', 'lastName'],
  ['last_name', 'lastName'],
  ['lastname', 'lastName'],
  ['last', 'lastName'],
  ['mot_de_passe', 'password'],
  ['motdepasse', 'password'],
  ['mdp', 'password'],
  ['password', 'password'],
  ['pass', 'password'],
  ['pseudo', 'pseudo'],
  ['pseudo_optionnel', 'pseudo'],
  ['email', 'email'],
  ['mail', 'email'],
  ['email_optionnel', 'email'],
  ['description', 'description'],
  ['description_optionnel', 'description'],
  ['affiliation', 'affiliation'],
  ['affiliation_n3_foret_both', 'affiliation'],
  ['affiliation_n3_foret_both_id_carte', 'affiliation'],
  ['espace', 'affiliation'],
  ['mon_espace', 'affiliation'],
  ['zone', 'affiliation'],
]);

function normalizeVisitMascotPreference(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function affiliationFromImportCell(raw) {
  const p = parseStudentAffiliationInput(raw);
  if (p.kind === 'invalid') return null;
  return p.value;
}

function normalizeImportUserType(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'student';
  const normalized = raw.toLowerCase();
  if (['eleve', 'élève', 'n3beur', 'n3beurs', 'student', 'students'].includes(normalized))
    return 'student';
  if (['prof', 'professeur', 'n3boss', 'teacher', 'teachers'].includes(normalized))
    return 'teacher';
  return null;
}

function detectAvatarExtension(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const raw = String(m[1]).toLowerCase();
  return raw === 'jpeg' ? 'jpg' : raw;
}

async function parseWorkbookRowsFromBuffer(buffer) {
  return parseFirstSheetRows(buffer);
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

function mapImportRowToStudentShape(row = {}) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(key);
    const target = IMPORT_HEADER_ALIASES.get(normalized);
    if (!target) continue;
    mapped[target] = value;
  }
  return mapped;
}

function buildImportStudentPayload(row = {}) {
  const mapped = mapImportRowToStudentShape(row);
  return {
    userType: normalizeImportUserType(mapped.userType),
    firstName: asTrimmedString(mapped.firstName),
    lastName: asTrimmedString(mapped.lastName),
    password: asTrimmedString(mapped.password),
    affiliation: affiliationFromImportCell(mapped.affiliation),
    pseudo: normalizeOptionalString(mapped.pseudo),
    email: normalizeOptionalString(mapped.email),
    description: normalizeOptionalString(mapped.description),
  };
}

function validateImportStudentPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.userType || !ALLOWED_IMPORT_USER_TYPES.has(payload.userType)) {
    errors.push({ row: rowNumber, field: 'userType', error: 'Rôle invalide (n3beur/n3boss)' });
  }
  if (!payload.firstName)
    errors.push({ row: rowNumber, field: 'firstName', error: 'Prénom requis' });
  if (!payload.lastName) errors.push({ row: rowNumber, field: 'lastName', error: 'Nom requis' });
  if (!payload.password) {
    errors.push({ row: rowNumber, field: 'password', error: 'Mot de passe requis' });
  } else if (payload.password.length < 4) {
    errors.push({
      row: rowNumber,
      field: 'password',
      error: 'Mot de passe trop court (min 4 caractères)',
    });
  }
  if (!payload.affiliation) {
    errors.push({
      row: rowNumber,
      field: 'affiliation',
      error: 'Affiliation invalide (n3, foret, both ou identifiant de carte)',
    });
  }
  if (payload.pseudo != null && !PSEUDO_RE.test(payload.pseudo)) {
    errors.push({
      row: rowNumber,
      field: 'pseudo',
      error: 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)',
    });
  }
  if (payload.email != null && !EMAIL_RE.test(payload.email)) {
    errors.push({ row: rowNumber, field: 'email', error: 'Email invalide' });
  }
  if (payload.description != null && payload.description.length > MAX_DESCRIPTION_LEN) {
    errors.push({
      row: rowNumber,
      field: 'description',
      error: `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`,
    });
  }
  return errors;
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

function csvEscape(value) {
  const s = String(value ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildTemplateWorkbookRows() {
  return [
    {
      [TEMPLATE_COLUMNS[0]]: 'eleve',
      [TEMPLATE_COLUMNS[1]]: 'Exemple',
      [TEMPLATE_COLUMNS[2]]: 'Eleve',
      [TEMPLATE_COLUMNS[3]]: 'azerty123',
      [TEMPLATE_COLUMNS[4]]: 'both',
      [TEMPLATE_COLUMNS[5]]: 'exemple_eleve',
      [TEMPLATE_COLUMNS[6]]: 'exemple.eleve@lyautey.ma',
      [TEMPLATE_COLUMNS[7]]: 'Remplacer ou supprimer cette ligne avant import.',
    },
  ];
}

module.exports = {
  MAX_DESCRIPTION_LEN,
  MAX_AVATAR_BYTES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  PSEUDO_RE,
  EMAIL_RE,
  TEMPLATE_COLUMNS,
  ALLOWED_IMPORT_USER_TYPES,
  IMPORT_HEADER_ALIASES,
  normalizeVisitMascotPreference,
  asTrimmedString,
  hasOwn,
  affiliationFromImportCell,
  normalizeImportUserType,
  detectAvatarExtension,
  normalizeImportHeader,
  parseWorkbookRowsFromBuffer,
  parseCsvLine,
  parseCsvRowsFromBuffer,
  mapImportRowToStudentShape,
  buildImportStudentPayload,
  validateImportStudentPayload,
  resolveImportRows,
  csvEscape,
  buildTemplateWorkbookRows,
};
