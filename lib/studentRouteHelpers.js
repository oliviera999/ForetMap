'use strict';

/**
 * Logique pure de `routes/students.js` (O10) : constantes (limites, regex, colonnes
 * du modèle d'import), parsing CSV / classeur en mémoire, mapping et validation des
 * lignes d'import, normalisations (mascotte de visite, rôle importé, extension
 * d'avatar) et échappement CSV. Déplacement byte-identique depuis la route —
 * aucune I/O directe, aucun accès req/res/DB ni système de fichiers
 * (parseFirstSheetRows et Buffer travaillent en mémoire uniquement).
 *
 * Import fichier : la colonne Rôle désigne le **profil RBAC** (pas seulement
 * élève/prof). Les e-mails du fichier **ne** sont **pas** filtrés par les
 * domaines OAuth / Moodle (`IMPORT_SKIPS_EMAIL_DOMAIN_RESTRICTIONS`).
 */

const { asTrimmedString, normalizeImportHeader } = require('./shared/stringHelpers');
const { detectAvatarExtension } = require('./shared/dataUrlImage');
const { parseFirstSheetRows } = require('./spreadsheet');
const { parseStudentAffiliationInput } = require('./studentAffiliation');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const { PSEUDO_RE, PSEUDO_INVALID_MSG } = require('./shared/pseudo');
const { parseGroupRefsCell } = require('./groupImport');

const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Plancher local pour comptes enseignant / admin si le caller ne fournit pas le réglage. */
const PRIVILEGED_IMPORT_PASSWORD_MIN = 12;

const TEMPLATE_COLUMNS = [
  'Rôle',
  'Prénom',
  'Nom',
  'Mot de passe',
  'Affiliation (n3|foret|both|id_carte)',
  // Pas de « ; » dans le libellé : le modèle CSV est délimité par des points-virgules
  // (même si csvEscape quote la cellule, les fichiers collés à la main cassent sinon).
  'Groupes (noms/slugs | chemin Parent>Enfant)',
  'Pseudo (optionnel)',
  'Email (optionnel)',
  'Description (optionnel)',
];

/** L'import CSV/XLSX n'applique jamais GOOGLE_OAUTH_ALLOWED_DOMAINS / Moodle email_domains. */
const IMPORT_SKIPS_EMAIL_DOMAIN_RESTRICTIONS = true;

/**
 * Profils ForetMap importables (hors rôles G&L).
 * `aliases` : valeurs acceptées dans la colonne Rôle (casse ignorée).
 */
const IMPORT_ROLE_DEFINITIONS = [
  {
    slug: 'visiteur',
    userType: 'student',
    aliases: ['visiteur', 'visitor'],
  },
  {
    slug: 'eleve_novice',
    userType: 'student',
    aliases: [
      'eleve_novice',
      'eleve',
      'élève',
      'n3beur',
      'n3beurs',
      'student',
      'students',
      'novice',
    ],
  },
  {
    slug: 'eleve_avance',
    userType: 'student',
    aliases: ['eleve_avance', 'avance', 'avancé', 'avancee', 'avancée', 'n3beur_avance'],
  },
  {
    slug: 'eleve_chevronne',
    userType: 'student',
    aliases: ['eleve_chevronne', 'chevronne', 'chevronné', 'n3beur_chevronne'],
  },
  {
    slug: 'prof_classe',
    userType: 'teacher',
    aliases: ['prof_classe', 'professeur_classe', 'tuteur', 'enseignant_classe'],
  },
  {
    slug: 'prof',
    userType: 'teacher',
    aliases: ['prof', 'professeur', 'n3boss', 'teacher', 'teachers'],
  },
  {
    slug: 'admin',
    userType: 'teacher',
    aliases: ['admin', 'administrateur', 'administrator'],
  },
];

const IMPORT_ROLE_SLUGS = new Set(IMPORT_ROLE_DEFINITIONS.map((d) => d.slug));
const IMPORT_ROLE_ALIAS_TO_SLUG = new Map();
for (const def of IMPORT_ROLE_DEFINITIONS) {
  for (const alias of def.aliases) {
    IMPORT_ROLE_ALIAS_TO_SLUG.set(alias.toLowerCase(), def.slug);
  }
  IMPORT_ROLE_ALIAS_TO_SLUG.set(def.slug, def.slug);
}

/** @deprecated Conservé pour compat tests : types de compte student|teacher. */
const ALLOWED_IMPORT_USER_TYPES = new Set(['student', 'teacher']);

const IMPORT_HEADER_ALIASES = new Map([
  ['role', 'role'],
  ['rôle', 'role'],
  ['profil', 'role'],
  ['type', 'role'],
  ['user_type', 'role'],
  ['utilisateur_type', 'role'],
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
  ['groupes', 'groups'],
  ['groupes_noms_slugs_ou_chemin', 'groups'],
  ['groupes_noms_slugs_ou_chemin_parent_enfant', 'groups'],
  ['groupes_noms_slugs_chemin_parent_enfant', 'groups'],
  ['groups', 'groups'],
  ['classe', 'groups'],
  ['classes', 'groups'],
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

/**
 * Résout la colonne Rôle vers un slug RBAC ForetMap.
 * Vide → `eleve_novice` (rétrocompat modèle « eleve » / cellule vide).
 * Inconnu → `null`.
 */
function normalizeImportRoleSlug(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'eleve_novice';
  return IMPORT_ROLE_ALIAS_TO_SLUG.get(raw.toLowerCase()) || null;
}

function userTypeForImportRoleSlug(roleSlug) {
  const def = IMPORT_ROLE_DEFINITIONS.find((d) => d.slug === roleSlug);
  return def ? def.userType : null;
}

/**
 * @deprecated Préférer `normalizeImportRoleSlug` + `userTypeForImportRoleSlug`.
 * Conserve l'ancien contrat student|teacher|null.
 */
function normalizeImportUserType(value) {
  const slug = normalizeImportRoleSlug(value);
  if (slug == null) return null;
  return userTypeForImportRoleSlug(slug);
}

/** Garde anti-escalade miroir de `POST /api/rbac/users`. */
function canActorImportRoleSlug(auth, roleSlug) {
  const actor = String(auth?.roleSlug || '')
    .trim()
    .toLowerCase();
  if (!IMPORT_ROLE_SLUGS.has(roleSlug)) return false;
  if (roleSlug === 'admin') return actor === 'admin';
  if (roleSlug === 'prof' || roleSlug === 'prof_classe') {
    return actor === 'admin' || actor === 'prof';
  }
  return true;
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
  const roleSlug = normalizeImportRoleSlug(mapped.role);
  return {
    roleSlug,
    userType: roleSlug ? userTypeForImportRoleSlug(roleSlug) : null,
    firstName: asTrimmedString(mapped.firstName),
    lastName: asTrimmedString(mapped.lastName),
    password: asTrimmedString(mapped.password),
    affiliation: affiliationFromImportCell(mapped.affiliation),
    groupRefs: parseGroupRefsCell(mapped.groups),
    pseudo: normalizeOptionalString(mapped.pseudo),
    email: normalizeOptionalString(mapped.email),
    description: normalizeOptionalString(mapped.description),
  };
}

/** Clé d'identité dans le fichier : type de compte + prénom + nom. */
function studentImportIdentityKey(payload) {
  return `${asTrimmedString(payload?.userType).toLowerCase()}|${asTrimmedString(payload?.firstName).toLowerCase()}|${asTrimmedString(payload?.lastName).toLowerCase()}`;
}

function groupRefDedupeKey(ref) {
  return (ref?.path || [])
    .map((p) =>
      String(p || '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
    .join('>');
}

function mergeGroupRefsLists(a = [], b = []) {
  const seen = new Set();
  const out = [];
  for (const ref of [...(a || []), ...(b || [])]) {
    const key = groupRefDedupeKey(ref);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ path: [...(ref.path || [])] });
  }
  return out;
}

function pickLastNonEmpty(prev, next) {
  if (next === undefined || next === null) return prev;
  if (typeof next === 'string' && next.trim() === '') return prev;
  return next;
}

/**
 * Fusionne deux payloads du même compte : groupes cumulés ; scalaires = dernière valeur
 * non vide (mot de passe, pseudo, e-mail, rôle, affiliation, description).
 */
function mergeStudentImportPayloads(prev, next) {
  return {
    roleSlug: pickLastNonEmpty(prev.roleSlug, next.roleSlug),
    userType: pickLastNonEmpty(prev.userType, next.userType),
    firstName: prev.firstName,
    lastName: prev.lastName,
    password: pickLastNonEmpty(prev.password, next.password),
    affiliation: next.affiliation != null ? next.affiliation : prev.affiliation,
    groupRefs: mergeGroupRefsLists(prev.groupRefs, next.groupRefs),
    pseudo: pickLastNonEmpty(prev.pseudo, next.pseudo),
    email: pickLastNonEmpty(prev.email, next.email),
    description: pickLastNonEmpty(prev.description, next.description),
  };
}

/**
 * Fusionne les lignes valides en double dans le fichier.
 * @param {Array<{ payload: object, rowNumber: number }>} items
 * @returns {{ items: Array<{ payload: object, rowNumber: number, sourceRows: number[] }>, infos: object[] }}
 */
function mergeDuplicateStudentImportItems(items) {
  const byKey = new Map();
  for (const item of items || []) {
    const key = studentImportIdentityKey(item.payload);
    if (!key || key.startsWith('|') || key.endsWith('|')) {
      // prénom/nom manquants : ne devrait pas arriver après validation
      continue;
    }
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        payload: {
          ...item.payload,
          groupRefs: mergeGroupRefsLists([], item.payload.groupRefs),
        },
        rowNumber: item.rowNumber,
        sourceRows: [item.rowNumber],
      });
      continue;
    }
    prev.payload = mergeStudentImportPayloads(prev.payload, item.payload);
    prev.rowNumber = item.rowNumber;
    prev.sourceRows.push(item.rowNumber);
  }
  const infos = [];
  for (const entry of byKey.values()) {
    if (entry.sourceRows.length > 1) {
      infos.push({
        code: 'duplicate_rows_merged',
        rows: [...entry.sourceRows],
        message: `Lignes ${entry.sourceRows.join(', ')} : ${entry.payload.firstName} ${entry.payload.lastName} — fusionnées (groupes cumulés ; dernière ligne pour le reste).`,
      });
    }
  }
  return { items: [...byKey.values()], infos };
}

/**
 * @param {object} payload
 * @param {number} rowNumber
 * @param {{
 *   minPasswordStudent?: number,
 *   minPasswordTeacher?: number,
 *   allowWeakPasswords?: boolean,
 *   passwordRequired?: boolean,
 * }} [opts]
 */
function validateImportStudentPayload(payload, rowNumber, opts = {}) {
  const errors = [];
  const allowWeak = !!opts.allowWeakPasswords;
  const minStudent = allowWeak
    ? 1
    : Number(opts.minPasswordStudent) > 0
      ? Number(opts.minPasswordStudent)
      : 4;
  const minTeacher = allowWeak
    ? 1
    : Number(opts.minPasswordTeacher) > 0
      ? Number(opts.minPasswordTeacher)
      : PRIVILEGED_IMPORT_PASSWORD_MIN;
  const minPassword =
    payload.userType === 'teacher' ? Math.max(minStudent, minTeacher) : minStudent;
  const passwordRequired = opts.passwordRequired !== false;

  if (!payload.roleSlug || !IMPORT_ROLE_SLUGS.has(payload.roleSlug)) {
    errors.push({
      row: rowNumber,
      field: 'role',
      error:
        'Rôle invalide (visiteur, eleve_novice, eleve_avance, eleve_chevronne, prof_classe, prof, admin)',
    });
  }
  if (!payload.firstName)
    errors.push({ row: rowNumber, field: 'firstName', error: 'Prénom requis' });
  if (!payload.lastName) errors.push({ row: rowNumber, field: 'lastName', error: 'Nom requis' });
  if (!payload.password) {
    if (passwordRequired) {
      errors.push({ row: rowNumber, field: 'password', error: 'Mot de passe requis' });
    }
  } else if (payload.password.length < minPassword) {
    errors.push({
      row: rowNumber,
      field: 'password',
      error: `Mot de passe trop court (min ${minPassword} caractères)`,
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
      error: PSEUDO_INVALID_MSG,
    });
  }
  // Pas de filtre domaines OAuth/Moodle : format syntaxique uniquement.
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

/** Lignes d'exemple du modèle : un cas par profil ForetMap (à remplacer avant import réel). */
function buildTemplateWorkbookRows() {
  const studentPwd = 'azerty123';
  const teacherPwd = 'MotDePasse12!';
  const col = TEMPLATE_COLUMNS;
  return [
    {
      [col[0]]: 'visiteur',
      [col[1]]: 'Visite',
      [col[2]]: 'Exemple',
      [col[3]]: studentPwd,
      [col[4]]: 'both',
      [col[5]]: '6ème A',
      [col[6]]: 'exemple_visiteur',
      [col[7]]: 'exemple.visiteur@gmail.com',
      [col[8]]:
        'Exemple visiteur rattaché à une classe (créée si absente). Remplacer ou supprimer.',
    },
    {
      [col[0]]: 'eleve_novice',
      [col[1]]: 'Novice',
      [col[2]]: 'Exemple',
      [col[3]]: studentPwd,
      [col[4]]: 'n3',
      [col[5]]: '6ème A | 6ème B',
      [col[6]]: 'exemple_novice',
      [col[7]]: 'exemple.novice@lyautey.ma',
      [col[8]]: 'Exemple n3beur novice dans deux classes. Remplacer ou supprimer.',
    },
    {
      [col[0]]: 'eleve_avance',
      [col[1]]: 'Avance',
      [col[2]]: 'Exemple',
      [col[3]]: studentPwd,
      [col[4]]: 'foret',
      [col[5]]: '6ème A > Atelier sciences',
      [col[6]]: 'exemple_avance',
      [col[7]]: 'exemple.avance@example.org',
      [col[8]]: 'Exemple avec sous-groupe (chemin Parent>Enfant). Remplacer ou supprimer.',
    },
    {
      [col[0]]: 'eleve_chevronne',
      [col[1]]: 'Chevronne',
      [col[2]]: 'Exemple',
      [col[3]]: studentPwd,
      [col[4]]: 'both',
      [col[5]]: '',
      [col[6]]: 'exemple_chevronne',
      [col[7]]: 'exemple.chevronne@proton.me',
      [col[8]]: 'Exemple sans groupe (rattachement possible plus tard). Remplacer ou supprimer.',
    },
    {
      [col[0]]: 'prof_classe',
      [col[1]]: 'Classe',
      [col[2]]: 'Exemple',
      [col[3]]: teacherPwd,
      [col[4]]: 'both',
      [col[5]]: '6ème A | 6ème B',
      [col[6]]: 'exemple_prof_classe',
      [col[7]]: 'exemple.profclasse@outlook.com',
      [col[8]]: 'Exemple prof de classe multi-groupes — MDP ≥ 12. Remplacer ou supprimer.',
    },
    {
      [col[0]]: 'prof',
      [col[1]]: 'N3boss',
      [col[2]]: 'Exemple',
      [col[3]]: teacherPwd,
      [col[4]]: 'both',
      [col[5]]: '',
      [col[6]]: 'exemple_n3boss',
      [col[7]]: 'exemple.n3boss@lyautey.ma',
      [col[8]]: 'Exemple n3boss. Remplacer ou supprimer.',
    },
    {
      [col[0]]: 'admin',
      [col[1]]: 'Admin',
      [col[2]]: 'Exemple',
      [col[3]]: teacherPwd,
      [col[4]]: 'both',
      [col[5]]: '',
      [col[6]]: 'exemple_admin',
      [col[7]]: 'exemple.admin@example.com',
      [col[8]]: 'Exemple administrateur. Remplacer ou supprimer.',
    },
  ];
}

module.exports = {
  MAX_DESCRIPTION_LEN,
  MAX_AVATAR_BYTES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
  EMAIL_RE,
  PRIVILEGED_IMPORT_PASSWORD_MIN,
  TEMPLATE_COLUMNS,
  IMPORT_SKIPS_EMAIL_DOMAIN_RESTRICTIONS,
  IMPORT_ROLE_DEFINITIONS,
  IMPORT_ROLE_SLUGS,
  ALLOWED_IMPORT_USER_TYPES,
  IMPORT_HEADER_ALIASES,
  normalizeVisitMascotPreference,
  asTrimmedString,
  hasOwn,
  affiliationFromImportCell,
  normalizeImportRoleSlug,
  userTypeForImportRoleSlug,
  normalizeImportUserType,
  canActorImportRoleSlug,
  detectAvatarExtension,
  normalizeImportHeader,
  parseWorkbookRowsFromBuffer,
  parseCsvLine,
  parseCsvRowsFromBuffer,
  mapImportRowToStudentShape,
  buildImportStudentPayload,
  validateImportStudentPayload,
  studentImportIdentityKey,
  mergeGroupRefsLists,
  mergeStudentImportPayloads,
  mergeDuplicateStudentImportItems,
  resolveImportRows,
  csvEscape,
  buildTemplateWorkbookRows,
};
