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
const { normalizeOptionalString } = require('./shared/httpHelpers');
const { N3BEUR_RANK_EXCLUSIVE_MAX } = require('./shared/n3beurRolesCore');
const { PSEUDO_RE, PSEUDO_INVALID_MSG } = require('./shared/pseudo');
const { parseGroupRefsCell } = require('./groupImport');
const {
  MAX_IMPORT_FILE_BYTES,
  csvEscape,
  parseCsvLine,
  parseCsvRowsFromBuffer,
  parseWorkbookRowsFromBuffer,
  resolveImportRows,
} = require('./importRows');

const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Plancher local pour comptes enseignant / admin si le caller ne fournit pas le réglage. */
const PRIVILEGED_IMPORT_PASSWORD_MIN = 12;

const TEMPLATE_COLUMNS = [
  'Rôle',
  'Prénom',
  'Nom',
  'Mot de passe',
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
 *
 * `aliases` : valeurs acceptées dans la colonne Rôle. Elles sont **canonisées**
 * (`canonicalizeImportRoleValue`) avant comparaison : casse, accents, emoji,
 * espaces et tirets sont neutralisés. Écrire `eleve_avance` suffit donc à
 * accepter « Élève avancé », « ELEVE-AVANCE » ou « n3beur avancé 🌿 ».
 *
 * `label` : nom affiché **par défaut** du profil (cf. `SYSTEM_ROLES` de `lib/rbac.js`).
 * Il est ajouté aux alias, et le nom réellement stocké en base — qu'un administrateur
 * peut avoir renommé — l'est à l'exécution via `buildRoleAliasesFromDbRows()`.
 */
const IMPORT_ROLE_DEFINITIONS = [
  {
    slug: 'visiteur',
    userType: 'student',
    label: 'Visiteur',
    aliases: [
      'visiteur',
      'visiteurs',
      'visiteuse',
      'visitor',
      'guest',
      'invite',
      'observateur',
      'compte visiteur',
      'non promu',
      'lecture seule',
    ],
  },
  {
    /*
     * Personnel (agent, vie scolaire, AED…) : compte **enseignant**, et non élève, depuis le
     * réalignement du 22/09/2026. Ce n'est pas cosmétique : la clé d'appariement de l'import
     * est `userType|prénom|nom` (`routes/students.js`). Tant que ce profil était déclaré
     * `student`, un ré-import du fichier des personnels ne retrouvait plus les comptes
     * existants — devenus `teacher` en base — et tentait de les recréer : doublons, ou rejets
     * « Email déjà utilisé ». Le plancher de mot de passe suit aussi ce type.
     */
    slug: 'personnel',
    userType: 'teacher',
    label: 'Personnel',
    aliases: [
      'personnel',
      'personnels',
      'staff',
      'agent',
      'aed',
      'vie scolaire',
      'personnel non enseignant',
      'personnel etablissement',
    ],
  },
  {
    slug: 'eleve_novice',
    userType: 'student',
    label: 'n3beur novice',
    aliases: [
      'eleve_novice',
      'eleve',
      'eleves',
      'student',
      'students',
      'pupil',
      'novice',
      'debutant',
      'n3beur',
      'n3beurs',
      'n3beur novice',
      'eleve novice',
      'eleve debutant',
      'palier 1',
      'niveau 1',
    ],
  },
  {
    slug: 'eleve_avance',
    userType: 'student',
    label: 'n3beur avancé',
    aliases: [
      'eleve_avance',
      'avance',
      'avancee',
      'n3beur_avance',
      'n3beur avance',
      'eleve avance',
      'intermediaire',
      'palier 2',
      'niveau 2',
    ],
  },
  {
    slug: 'eleve_chevronne',
    userType: 'student',
    label: 'n3beur chevronné',
    aliases: [
      'eleve_chevronne',
      'chevronne',
      'n3beur_chevronne',
      'n3beur chevronne',
      'eleve chevronne',
      'eleve expert',
      'expert',
      'palier 3',
      'niveau 3',
    ],
  },
  {
    slug: 'prof_classe',
    userType: 'teacher',
    label: 'Prof de classe',
    aliases: [
      'prof_classe',
      'prof de classe',
      'professeur_classe',
      'professeur de classe',
      'enseignant_classe',
      'enseignant de classe',
      'tuteur',
      'tutrice',
      'tuteur de classe',
      'prof principal',
      'professeur principal',
      'referent de classe',
    ],
  },
  {
    slug: 'prof',
    userType: 'teacher',
    label: 'n3boss',
    aliases: [
      'prof',
      'profs',
      'professeur',
      'professeure',
      'professeurs',
      'enseignant',
      'enseignante',
      'enseignants',
      'teacher',
      'teachers',
      'n3boss',
      'n3bosses',
      'responsable pedagogique',
      'animateur',
      'animatrice',
    ],
  },
  {
    slug: 'admin',
    userType: 'teacher',
    label: 'Admin',
    aliases: [
      'admin',
      'admins',
      'administrateur',
      'administratrice',
      'administrator',
      'administration',
      'super admin',
      'admin etablissement',
    ],
  },
];

const IMPORT_ROLE_SLUGS = new Set(IMPORT_ROLE_DEFINITIONS.map((d) => d.slug));

/**
 * Canonise une valeur de cellule Rôle : minuscules, accents et emoji retirés, tout
 * caractère non alphanumérique replié en `_`. Même transformation que pour les
 * en-têtes de colonnes — c'est ce qui manquait au parseur : « Élève avancé »,
 * « Prof de classe » ou « n3beur novice 🪨 » (les libellés que l'application affiche
 * et que la documentation annonce) tombaient tous en « rôle invalide ».
 *
 * @param {*} value
 * @returns {string} forme canonique (`''` si vide)
 */
function canonicalizeImportRoleValue(value) {
  return normalizeImportHeader(value);
}

const IMPORT_ROLE_ALIAS_TO_SLUG = new Map();
for (const def of IMPORT_ROLE_DEFINITIONS) {
  for (const alias of [def.slug, def.label, ...def.aliases]) {
    const key = canonicalizeImportRoleValue(alias);
    if (!key) continue;
    const owner = IMPORT_ROLE_ALIAS_TO_SLUG.get(key);
    if (owner && owner !== def.slug) {
      // Un alias partagé par deux profils rendrait le mapping arbitraire (ordre de
      // déclaration) : on préfère échouer au chargement du module.
      throw new Error(`Alias de rôle d'import ambigu : « ${alias} » (${owner} / ${def.slug})`);
    }
    IMPORT_ROLE_ALIAS_TO_SLUG.set(key, def.slug);
  }
}

/**
 * Profils connus mais **non** importables par ce fichier : on préfère un message
 * explicite à « Rôle invalide » (les profils G&L se gèrent depuis l'admin G&L).
 */
const NON_IMPORTABLE_ROLE_HINTS = new Map(
  [
    ['gl_admin', 'Profil G&L (MJ Admin)'],
    ['gl_mj', 'Profil G&L (MJ)'],
    ['gl_player', 'Profil G&L (Joueur)'],
    ['gl_observateur', 'Profil G&L (Observateur)'],
    ['mj', 'Profil G&L (MJ)'],
    ['maitre du jeu', 'Profil G&L (MJ)'],
    ['joueur', 'Profil G&L (Joueur)'],
    ['gnomes et licornes', 'Profil G&L'],
  ].map(([key, label]) => [canonicalizeImportRoleValue(key), label]),
);

/** Libellé d'aide listant les valeurs acceptées (affiché dans l'erreur de ligne). */
const IMPORT_ROLE_HINT = IMPORT_ROLE_DEFINITIONS.map((d) => `${d.slug} / ${d.label}`).join(', ');

/** @deprecated Conservé pour compat tests : types de compte student|teacher. */
const ALLOWED_IMPORT_USER_TYPES = new Set(['student', 'teacher']);

const IMPORT_HEADER_ALIASES = new Map([
  ['role', 'role'],
  ['rôle', 'role'],
  ['role_slug', 'role'],
  ['profil', 'role'],
  ['profil_rbac', 'role'],
  ['statut', 'role'],
  ['type', 'role'],
  ['type_de_compte', 'role'],
  ['user_type', 'role'],
  ['utilisateur_type', 'role'],
  ['prenom', 'firstName'],
  ['prénom', 'firstName'],
  ['first_name', 'firstName'],
  ['firstname', 'firstName'],
  ['first', 'firstName'],
  ['nom', 'lastName'],
  ['nom_de_famille', 'lastName'],
  ['nom_famille', 'lastName'],
  ['last_name', 'lastName'],
  ['lastname', 'lastName'],
  ['last', 'lastName'],
  ['surname', 'lastName'],
  ['mot_de_passe', 'password'],
  ['mot_de_passe_optionnel', 'password'],
  ['mot_de_passe_provisoire', 'password'],
  ['motdepasse', 'password'],
  ['mdp', 'password'],
  ['password', 'password'],
  ['pass', 'password'],
  ['pseudo', 'pseudo'],
  ['pseudo_optionnel', 'pseudo'],
  ['pseudonyme', 'pseudo'],
  ['login', 'pseudo'],
  ['identifiant_de_connexion', 'pseudo'],
  ['email', 'email'],
  // « E-mail » se normalise en `e_mail` : sans cet alias, la colonne était ignorée
  // et l'adresse perdue silencieusement.
  ['e_mail', 'email'],
  ['mail', 'email'],
  ['email_optionnel', 'email'],
  ['mail_optionnel', 'email'],
  ['courriel', 'email'],
  ['adresse_email', 'email'],
  ['adresse_e_mail', 'email'],
  ['adresse_mail', 'email'],
  ['description', 'description'],
  ['description_optionnel', 'description'],
  ['commentaire', 'description'],
  ['note', 'description'],
  ['groupes', 'groups'],
  ['groupe', 'groups'],
  ['groupes_optionnel', 'groups'],
  ['groupes_noms_slugs_ou_chemin', 'groups'],
  ['groupes_noms_slugs_ou_chemin_parent_enfant', 'groups'],
  ['groupes_noms_slugs_chemin_parent_enfant', 'groups'],
  ['groups', 'groups'],
  ['classe', 'groups'],
  ['classes', 'groups'],
  ['division', 'groups'],
]);

/**
 * En-têtes « de repli » : ils désignent bien la cible, mais un en-tête plus explicite
 * doit gagner quand les deux sont présents dans le même fichier. Un export qui porte à
 * la fois « Rôle » (le profil) et « Type » (élève/enseignant) mappait sinon l'un ou
 * l'autre selon l'ordre des colonnes — donc au hasard.
 */
const IMPORT_HEADER_FALLBACK_KEYS = new Set([
  'statut',
  'type',
  'type_de_compte',
  'user_type',
  'utilisateur_type',
  'classe',
  'classes',
  'division',
  'espace',
  'mon_espace',
  'zone',
  'carte',
  'commentaire',
  'note',
  'login',
  'identifiant_de_connexion',
]);

function normalizeVisitMascotPreference(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

/**
 * Alias supplémentaires déduits des **libellés stockés en base** (`roles.display_name`).
 *
 * Les noms affichés des profils sont modifiables par un administrateur (« Profils &
 * utilisateurs ») : le fichier d'import doit accepter le nom que la personne lit à
 * l'écran, pas seulement le slug technique. Restreint aux profils importables ; un
 * libellé qui pointerait sur deux profils est ignoré (mapping ambigu), et les alias
 * statiques restent prioritaires.
 *
 * @param {Array<{ slug?: string, display_name?: string }>} roleRows
 * @returns {Map<string, string>} forme canonique → slug
 */
function buildRoleAliasesFromDbRows(roleRows) {
  const extra = new Map();
  const ambiguous = new Set();
  for (const row of roleRows || []) {
    const slug = asTrimmedString(row?.slug);
    if (!slug || slug.startsWith('gl_')) continue;
    const key = canonicalizeImportRoleValue(row?.display_name);
    if (!key || IMPORT_ROLE_ALIAS_TO_SLUG.has(key)) continue;
    const owner = extra.get(key);
    if (owner && owner !== slug) {
      ambiguous.add(key);
      continue;
    }
    extra.set(key, slug);
  }
  for (const key of ambiguous) extra.delete(key);
  return extra;
}

/**
 * Résout la colonne Rôle vers un slug RBAC ForetMap.
 * Vide → `eleve_novice` (rétrocompat modèle « eleve » / cellule vide).
 * Inconnu → `null`.
 *
 * @param {*} value cellule brute
 * @param {Map<string, string>} [extraAliases] alias BDD (`buildRoleAliasesFromDbRows`)
 * @returns {string|null}
 */
function normalizeImportRoleSlug(value, extraAliases) {
  const key = canonicalizeImportRoleValue(value);
  if (!key) return 'eleve_novice';
  // Un slug écrit tel quel (profil sur mesure) est accepté s'il existe en base.
  if (extraAliases instanceof Map && extraAliases.has(key)) return extraAliases.get(key);
  const staticHit = IMPORT_ROLE_ALIAS_TO_SLUG.get(key);
  if (staticHit) return staticHit;
  const dynamicHit = extraAliases instanceof Map ? extraAliases.get(key) : undefined;
  return dynamicHit || null;
}

/** Message d'aide pour une cellule Rôle non résolue (profil G&L ou valeur inconnue). */
function describeUnknownImportRole(rawValue) {
  const key = canonicalizeImportRoleValue(rawValue);
  const hint = NON_IMPORTABLE_ROLE_HINTS.get(key);
  const shown = asTrimmedString(rawValue);
  if (hint) {
    return `${hint} : non importable par ce fichier (à gérer depuis l'administration G&L)`;
  }
  return shown
    ? `Rôle « ${shown} » inconnu (attendu : ${IMPORT_ROLE_HINT}, ou le nom affiché du profil)`
    : `Rôle invalide (attendu : ${IMPORT_ROLE_HINT})`;
}

function userTypeForImportRoleSlug(roleSlug) {
  const def = IMPORT_ROLE_DEFINITIONS.find((d) => d.slug === roleSlug);
  return def ? def.userType : null;
}

/**
 * Type de compte porté par un profil : profils système connus, sinon le rang décide (un
 * profil sur mesure de rang n3boss ou plus est un compte enseignant).
 * @param {{ slug?: string, rank?: number }} role
 */
function userTypeForRole(role) {
  const known = userTypeForImportRoleSlug(
    String(role?.slug || '')
      .trim()
      .toLowerCase(),
  );
  if (known) return known;
  return Number(role?.rank) >= N3BEUR_RANK_EXCLUSIVE_MAX ? 'teacher' : 'student';
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

function isAdminRoleSlug(roleSlug) {
  return (
    String(roleSlug || '')
      .trim()
      .toLowerCase() === 'admin'
  );
}

/** Cellule optionnelle renseignée : à la mise à jour, vide = inchangé (comme le mot de passe). */
function hasImportScalarValue(value) {
  if (value == null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

/**
 * Traitement d'un compte déjà présent lors d'un import :
 * - `update` : les cellules renseignées du fichier remplacent les valeurs en base ;
 * - `fill`   : le fichier ne sert qu'à compléter les champs vides du profil ;
 * - `skip`   : la ligne est ignorée.
 */
const IMPORT_EXISTING_STRATEGIES = Object.freeze(['update', 'fill', 'skip']);

function normalizeImportExistingStrategy(value) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  return IMPORT_EXISTING_STRATEGIES.includes(v) ? v : null;
}

/**
 * Un import ne rétrograde jamais un compte existant : le profil du fichier ne s'applique
 * que s'il est de rang **strictement** supérieur au profil actuel.
 */
function shouldKeepExistingImportRole(existingRank, importedRank) {
  if (existingRank == null || existingRank === '') return false;
  const current = Number(existingRank);
  if (!Number.isFinite(current)) return false;
  const next = Number(importedRank);
  if (!Number.isFinite(next)) return true;
  return next <= current;
}

/**
 * Colonnes à écrire sur un compte existant selon la stratégie. Une cellule vide ne touche
 * jamais la base ; en `fill`, seule une valeur absente en base est complétée (le mot de
 * passe n'est posé que si le compte n'en a pas).
 *
 * @param {{ display_name?: string, email?: string, pseudo?: string, description?: string, has_password?: boolean|number }} existing
 * @param {{ firstName: string, lastName: string, email?: string, pseudo?: string, description?: string, password?: string }} payload
 * @param {'update'|'fill'} strategy
 * @returns {{ display_name?: string, email?: string, pseudo?: string, description?: string, password?: string }}
 */
function resolveImportProfileUpdates(existing, payload, strategy) {
  const fillOnly = strategy === 'fill';
  const canWrite = (current, next) =>
    hasImportScalarValue(next) && (!fillOnly || !hasImportScalarValue(current));
  const updates = {};
  const displayName = `${payload.firstName || ''} ${payload.lastName || ''}`.trim();
  if (canWrite(existing?.display_name, displayName)) updates.display_name = displayName;
  for (const col of ['email', 'pseudo', 'description']) {
    if (canWrite(existing?.[col], payload[col])) updates[col] = payload[col];
  }
  if (payload.password && (!fillOnly || !existing?.has_password)) {
    updates.password = payload.password;
  }
  return updates;
}

/**
 * Réduit une ligne brute aux champs métier via `IMPORT_HEADER_ALIASES`.
 *
 * Deux passes : les en-têtes explicites d'abord, les en-têtes de repli
 * (`IMPORT_HEADER_FALLBACK_KEYS`) ensuite et seulement pour compléter un champ resté
 * vide. Une valeur déjà renseignée n'est jamais écrasée par une colonne suivante :
 * un fichier portant « Rôle » **et** « Type » mappe désormais le profil, quel que
 * soit l'ordre des colonnes.
 */
function mapImportRowToStudentShape(row = {}) {
  const mapped = {};
  const fill = (target, value) => {
    if (hasImportScalarValue(mapped[target])) return;
    if (!hasImportScalarValue(value) && hasOwn(mapped, target)) return;
    mapped[target] = value;
  };
  const deferred = [];
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(key);
    const target = IMPORT_HEADER_ALIASES.get(normalized);
    if (!target) continue;
    if (IMPORT_HEADER_FALLBACK_KEYS.has(normalized)) {
      deferred.push([target, value]);
      continue;
    }
    fill(target, value);
  }
  for (const [target, value] of deferred) fill(target, value);
  return mapped;
}

/**
 * @param {object} row ligne brute (CSV / tableur)
 * @param {{ roleAliases?: Map<string, string> }} [opts] alias de rôles issus de la base
 */
function buildImportStudentPayload(row = {}, opts = {}) {
  const mapped = mapImportRowToStudentShape(row);
  const roleSlug = normalizeImportRoleSlug(mapped.role, opts.roleAliases);
  const roleRow = roleSlug && opts.rolesBySlug ? opts.rolesBySlug.get(roleSlug) || null : null;
  return {
    roleSlug,
    // Cellule Rôle telle qu'écrite (null si vide) : sert au message d'erreur et à
    // signaler dans le rapport les lignes retombées sur le profil par défaut.
    roleInput: normalizeOptionalString(mapped.role),
    // Type de compte : profils système connus, sinon le rang du profil (profil sur mesure).
    userType: roleRow
      ? userTypeForRole(roleRow)
      : roleSlug
        ? userTypeForImportRoleSlug(roleSlug)
        : null,
    firstName: asTrimmedString(mapped.firstName),
    lastName: asTrimmedString(mapped.lastName),
    password: asTrimmedString(mapped.password),
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
 * non vide (mot de passe, pseudo, e-mail, rôle, description).
 */
function mergeStudentImportPayloads(prev, next) {
  return {
    roleSlug: pickLastNonEmpty(prev.roleSlug, next.roleSlug),
    roleInput: pickLastNonEmpty(prev.roleInput, next.roleInput),
    userType: pickLastNonEmpty(prev.userType, next.userType),
    firstName: prev.firstName,
    lastName: prev.lastName,
    password: pickLastNonEmpty(prev.password, next.password),
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
  // Le plancher enseignant ne descend jamais, quel que soit le réglage « mots de passe
  // faibles » (réservé aux comptes élèves) : un compte qui porte des droits d'encadrement
  // protège bien plus que lui-même (CDG-41).
  const minTeacher = Math.max(
    Number(opts.minPasswordTeacher) > 0 ? Number(opts.minPasswordTeacher) : 0,
    PRIVILEGED_IMPORT_PASSWORD_MIN,
  );
  const minPassword =
    payload.userType === 'teacher' ? Math.max(minStudent, minTeacher) : minStudent;
  const passwordRequired = opts.passwordRequired !== false;

  const knownRoles = opts.knownRoleSlugs instanceof Set ? opts.knownRoleSlugs : IMPORT_ROLE_SLUGS;
  if (!payload.roleSlug || !knownRoles.has(payload.roleSlug)) {
    errors.push({
      row: rowNumber,
      field: 'role',
      error: describeUnknownImportRole(payload.roleInput),
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

/**
 * Lignes d'exemple du modèle téléchargeable (CSV et XLSX).
 *
 * Contrat : **chaque ligne est importable telle quelle** (aucune n'est volontairement
 * fautive) et l'ensemble couvre tous les profils ForetMap plus les situations que le
 * fichier sait traiter — slug ou nom affiché dans la colonne Rôle, alias, accents,
 * multi-groupes, chemin `Parent>Enfant`, absence de groupe, ligne
 * minimale, et même personne répétée sur deux lignes (fusion). La colonne Description
 * porte l'explication de chaque cas : elle est destinée à être relue puis remplacée.
 *
 * Les mêmes lignes alimentent `docs/templates/users-import-template.csv`
 * (`npm run templates:users`), et un test vérifie que les deux ne divergent pas.
 */
function buildTemplateWorkbookRows() {
  const studentPwd = 'azerty123';
  const teacherPwd = 'MotDePasse12!';
  const col = TEMPLATE_COLUMNS;
  const row = (role, firstName, lastName, password, groups, pseudo, email, note) => ({
    [col[0]]: role,
    [col[1]]: firstName,
    [col[2]]: lastName,
    [col[3]]: password,
    [col[4]]: groups,
    [col[5]]: pseudo,
    [col[6]]: email,
    [col[7]]: note,
  });

  return [
    row(
      'visiteur',
      'Vera',
      'Visite',
      studentPwd,
      '6ème A',
      'vera_visite',
      'vera.visite@gmail.com',
      'Profil écrit en slug. La classe est créée si elle n’existe pas encore. E-mail hors domaines établissement accepté. Remplacer ou supprimer.',
    ),
    row(
      'Personnel',
      'Paul',
      'Personnel',
      // Profil écrit avec son nom affiché — et compte **enseignant** : le plancher de mot de
      // passe suit le type de compte que le profil porte, pas la ligne du fichier.
      teacherPwd,
      'Personnel',
      'paul_personnel',
      'paul.personnel@etablissement.example',
      'Même profil écrit avec son nom affiché : slug et libellé sont acceptés indifféremment. « Personnel » crée un compte enseignant, d’où un mot de passe plus long. Remplacer ou supprimer.',
    ),
    row(
      'eleve_novice',
      'Nina',
      'Novice',
      studentPwd,
      '6ème A | 6ème B',
      'nina_novice',
      'nina.novice@etablissement.example',
      'Deux classes séparées par « | » (le « ; » marche aussi). Remplacer ou supprimer.',
    ),
    row(
      'n3beur novice',
      'Noé',
      'Nouveau',
      studentPwd,
      '6ème B',
      '',
      '',
      'Ligne minimale : nom affiché du profil, pseudo / e-mail / description laissés vides. Remplacer ou supprimer.',
    ),
    row(
      'Élève avancé',
      'Ava',
      'Avance',
      studentPwd,
      '6ème A > Atelier sciences',
      'ava_avance',
      'ava.avance@example.org',
      'Accents, majuscules et espaces sont neutralisés dans la colonne Rôle. Chemin « Parent > Enfant » : le sous-groupe est créé sous sa classe. Remplacer ou supprimer.',
    ),
    row(
      'eleve_chevronne',
      'Chloé',
      'Chevron',
      studentPwd,
      '',
      'chloe_chevron',
      'chloe.chevron@proton.me',
      'Sans groupe : le rattachement peut se faire plus tard. Remplacer ou supprimer.',
    ),
    row(
      'eleve_avance',
      'Dora',
      'Doublon',
      studentPwd,
      '6ème A',
      '',
      '',
      'Doublon 1/2 : la même personne (même profil élève/enseignant, prénom et nom) peut occuper plusieurs lignes — les groupes s’additionnent. Remplacer ou supprimer.',
    ),
    row(
      'eleve_avance',
      'Dora',
      'Doublon',
      '',
      '6ème B | 6ème A > Atelier sciences',
      'dora_doublon',
      'dora.doublon@etablissement.example',
      'Doublon 2/2 : pour les colonnes hors groupes, c’est la dernière ligne renseignée qui gagne ; une cellule vide (ici le mot de passe) conserve la valeur précédente. Remplacer ou supprimer.',
    ),
    row(
      'prof_classe',
      'Théo',
      'Tuteur',
      teacherPwd,
      '6ème A | 6ème B',
      'theo_tuteur',
      'theo.tuteur@etablissement.example',
      'Compte enseignant : mot de passe d’au moins 12 caractères. Tuteur de deux classes. Remplacer ou supprimer.',
    ),
    row(
      'tuteur',
      'Tina',
      'Tutelle',
      teacherPwd,
      '5ème C',
      'tina_tutelle',
      'tina.tutelle@etablissement.example',
      'Alias accepté pour « Prof de classe » (tuteur, professeur de classe, prof principal…). Remplacer ou supprimer.',
    ),
    row(
      'prof',
      'Nadia',
      'Pilote',
      teacherPwd,
      '',
      'nadia_pilote',
      'nadia.pilote@etablissement.example',
      'Profil enseignant « fort » : sans groupe, son périmètre reste global. Remplacer ou supprimer.',
    ),
    row(
      'n3boss',
      'Noam',
      'Referent',
      teacherPwd,
      '6ème A',
      'noam_referent',
      'noam.referent@outlook.com',
      'Même profil que la ligne précédente, écrit avec son nom affiché (« professeur » et « enseignant » fonctionnent aussi). Remplacer ou supprimer.',
    ),
    row(
      'admin',
      'Alix',
      'Admin',
      teacherPwd,
      '',
      'alix_admin',
      'alix.admin@example.com',
      'Administrateur : seul un administrateur peut importer cette ligne, sinon elle est refusée et signalée dans le rapport. Remplacer ou supprimer.',
    ),
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
  IMPORT_HEADER_FALLBACK_KEYS,
  IMPORT_ROLE_HINT,
  NON_IMPORTABLE_ROLE_HINTS,
  normalizeVisitMascotPreference,
  asTrimmedString,
  hasOwn,
  canonicalizeImportRoleValue,
  buildRoleAliasesFromDbRows,
  normalizeImportRoleSlug,
  describeUnknownImportRole,
  userTypeForImportRoleSlug,
  normalizeImportUserType,
  userTypeForRole,
  isAdminRoleSlug,
  hasImportScalarValue,
  IMPORT_EXISTING_STRATEGIES,
  normalizeImportExistingStrategy,
  shouldKeepExistingImportRole,
  resolveImportProfileUpdates,
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
