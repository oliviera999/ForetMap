'use strict';

const { asTrimmedString, normalizeImportHeader } = require('./shared/stringHelpers');
const { buildWorkbookBuffer } = require('./spreadsheet');
const { PSEUDO_RE, PSEUDO_INVALID_MSG } = require('./shared/pseudo');
const { MAX_IMPORT_FILE_BYTES, csvEscape, resolveImportRows } = require('./importRows');

/**
 * Outils d'import joueurs Gnomes & Licornes (CSV / XLSX).
 *
 * Pattern aligné sur `routes/students.js` : alias d'en-têtes français/anglais,
 * parsing CSV maison (`;` ou `,`), parsing XLSX via la lib `xlsx`. Pas de
 * dépendance à Express : le module est purement fonctionnel et testable.
 */

const MAX_IMPORT_ROWS = 1000;

const TEMPLATE_COLUMNS = ['Prénom', 'Nom', 'Email', 'Pseudo', 'Mot de passe', 'Classe'];

const TEMPLATE_SAMPLE_ROW = [
  'Aurore',
  'Dupont',
  'aurore.dupont@pedagolyautey.org',
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
  ['email', 'email'],
  ['mail', 'email'],
  ['courriel', 'email'],
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

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
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
  const rawEmail = normalizeOptionalString(mapped.email);
  return {
    firstName: asTrimmedString(mapped.firstName),
    lastName: asTrimmedString(mapped.lastName),
    email: rawEmail ? rawEmail.toLowerCase() : null,
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
  if (!payload.firstName)
    errors.push({ row: rowNumber, field: 'firstName', error: 'Prénom requis' });
  if (!payload.lastName) errors.push({ row: rowNumber, field: 'lastName', error: 'Nom requis' });
  if (!payload.className)
    errors.push({
      row: rowNumber,
      field: 'className',
      error: 'Classe requise (doit déjà exister)',
    });
  if (payload.pseudo != null && !PSEUDO_RE.test(payload.pseudo)) {
    errors.push({
      row: rowNumber,
      field: 'pseudo',
      error: PSEUDO_INVALID_MSG,
    });
  }
  if (payload.password) {
    const min = Math.max(4, Number(passwordMinLength) || 4);
    if (payload.password.length < min) {
      errors.push({
        row: rowNumber,
        field: 'password',
        error: `Mot de passe trop court (min ${min} caractères)`,
      });
    }
  }
  return errors;
}

function buildCsvTemplate() {
  const BOM = '\uFEFF';
  const header = TEMPLATE_COLUMNS.map(csvEscape).join(';');
  const sample = TEMPLATE_SAMPLE_ROW.map(csvEscape).join(';');
  return `${BOM}${header}\r\n${sample}\r\n`;
}

async function buildXlsxTemplate() {
  return buildWorkbookBuffer([
    { name: 'Joueurs GL', aoa: [TEMPLATE_COLUMNS, TEMPLATE_SAMPLE_ROW] },
  ]);
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  TEMPLATE_COLUMNS,
  TEMPLATE_SAMPLE_ROW,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
  asTrimmedString,
  normalizeOptionalString,
  buildPlayerImportPayload,
  validatePlayerImportPayload,
  resolveImportRows,
  buildCsvTemplate,
  buildXlsxTemplate,
};
