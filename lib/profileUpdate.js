'use strict';

/**
 * Blocs partagés de la mise à jour de profil utilisateur, extraits à comportement
 * identique des deux handlers dupliqués (audit) :
 * - PATCH /api/auth/me/profile   (routes/auth.js — tout compte, self-service)
 * - PATCH /api/students/:id/profile (routes/students.js — élève propriétaire)
 *
 * Les différences voulues entre les deux routes (messages 404/401, normalisation
 * email, validation des champs, dossier avatar, colonne display_name, événement
 * d'audit) restent dans les routes ; seuls les blocs byte-identiques vivent ici.
 */

const bcrypt = require('bcryptjs');
const { queryOne } = require('../database');
const { saveBase64ToDisk, deleteFile } = require('./uploads');
const { isValidVisitMascotId } = require('./settings');
const { isVisitMascotOffered } = require('./visitMascotRegistry');
const {
  MAX_AVATAR_BYTES,
  normalizeVisitMascotPreference,
  detectAvatarExtension,
  hasOwn,
} = require('./studentRouteHelpers');
const { normalizeOptionalString } = require('./shared/httpHelpers');

/**
 * Ré-authentification avant un changement de mot de passe (la modification de profil,
 * elle, se contente de la session).
 *
 * Un compte **avec** mot de passe doit le redonner (`currentPassword`). Un compte **sans**
 * mot de passe (connexion Google, miroir G&L) n'est jamais ré-authentifié par la session
 * seule : sa première pose passe par un lien envoyé à l'adresse en place
 * (`POST /api/auth/me/password`, A3, audit du 19/11/2026). La session suffisait avant, et
 * ouvrait la voie à un changement d'e-mail depuis une session volée (garde AC3 contournée).
 *
 * @param {{ password_hash?: string|null }} account ligne `users`
 * @param {object} body corps de requête
 * @returns {Promise<{ ok: true }|{ ok: false, status: number, error: string, code?: string }>}
 */
async function verifyCurrentPassword(account, body) {
  if (!account?.password_hash) {
    return {
      ok: false,
      status: 409,
      error: 'Ce compte n’a pas encore de mot de passe : un lien de définition est nécessaire',
      code: 'PASSWORD_SETUP_LINK_REQUIRED',
    };
  }
  const current = body?.currentPassword;
  if (!current) return { ok: false, status: 400, error: 'Mot de passe actuel requis' };
  const ok = await bcrypt.compare(String(current), account.password_hash);
  if (!ok) return { ok: false, status: 401, error: 'Mot de passe actuel incorrect' };
  return { ok: true };
}

/** Message des refus du niveau de contenu (réglage réservé aux comptes non élèves). */
const PEDAGO_CONTENT_LEVEL_STUDENT_ERROR =
  'Le niveau de contenu se règle pour les comptes non élèves : le niveau d’un élève suit sa classe';

/**
 * Niveau de contenu d'un compte non élève (`users.pedago_content_level`, migration 387) :
 * vide → `null` (retour au niveau des groupes, sinon cycle 3) ; valeur hors
 * `STAFF_CONTENT_LEVEL_ENUM` → erreur 400.
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
function resolvePedagoContentLevelUpdate(raw) {
  if (raw == null || String(raw).trim() === '') return { ok: true, value: null };
  const { normalizeStaffContentLevel, STAFF_CONTENT_LEVEL_ENUM } = require('./shared/pedagoEnums');
  const value = normalizeStaffContentLevel(raw);
  if (!value) {
    return {
      ok: false,
      error: `pedago_content_level invalide (${STAFF_CONTENT_LEVEL_ENUM.values.join('|')})`,
    };
  }
  return { ok: true, value };
}

/** Drapeaux de présence des champs modifiables du corps de requête. */
function readProfileFieldFlags(body) {
  const flags = {
    hasPseudo: hasOwn(body, 'pseudo'),
    hasEmail: hasOwn(body, 'email') || hasOwn(body, 'mail'),
    hasDescription: hasOwn(body, 'description'),
    hasVisitMascotCatalogId: hasOwn(body, 'visit_mascot_catalog_id'),
    hasBiodivPedagoLevel: hasOwn(body, 'biodiv_pedago_level'),
    hasPedagoContentLevel: hasOwn(body, 'pedago_content_level'),
    hasAvatarData: hasOwn(body, 'avatarData'),
    removeAvatar: !!body.removeAvatar,
  };
  flags.hasAny =
    flags.hasPseudo ||
    flags.hasEmail ||
    flags.hasDescription ||
    flags.hasVisitMascotCatalogId ||
    flags.hasBiodivPedagoLevel ||
    flags.hasPedagoContentLevel ||
    flags.hasAvatarData ||
    flags.removeAvatar;
  return flags;
}

/**
 * Préférence mascotte visite : normalisation + contrôle liste autorisée.
 *
 * La liste autorisée vide signifie « aucune restriction » : toute mascotte du registre
 * (catalogue livré **ou** pack publié, cf. `lib/visitMascotRegistry.js`) est acceptée,
 * seule la forme de l'identifiant est contrôlée.
 *
 * @returns {Promise<{ ok: true, value: string } | { ok: false, error: string }>}
 */
async function resolveVisitMascotUpdate(hasField, rawValue, currentValue) {
  const value = hasField
    ? normalizeVisitMascotPreference(rawValue)
    : normalizeVisitMascotPreference(currentValue);
  if (hasField && value) {
    if (!isValidVisitMascotId(value)) {
      return { ok: false, error: 'Mascotte indisponible pour la visite' };
    }
    // Posée au registre, la même source que le sélecteur : une mascotte visible est
    // choisissable, une mascotte retirée de la visite ne l'est pas. Cf. `isVisitMascotOffered`.
    if (!(await isVisitMascotOffered(value))) {
      return { ok: false, error: 'Mascotte indisponible pour la visite' };
    }
  }
  return { ok: true, value };
}

/**
 * Traitement de l'avatar (nouvel upload base64 ou suppression) — mêmes gardes,
 * messages et effets fichiers que les deux handlers d'origine.
 * @param {object} p
 * @param {boolean} p.hasAvatarData  Champ `avatarData` présent dans le corps.
 * @param {unknown} p.avatarDataRaw  Valeur brute de `avatarData`.
 * @param {boolean} p.removeAvatar   Drapeau `removeAvatar` (ignoré si upload).
 * @param {string|null} p.currentPath Chemin actuel (colonne `avatar_path`).
 * @param {string} p.folder          Dossier uploads (ex. `students`, `student`, `teacher`).
 * @param {string} p.userId          Identifiant utilisateur (nom de sous-dossier).
 * @returns {{ ok: true, avatarPath: string|null } | { ok: false, error: string }}
 */
async function applyAvatarUpdate({
  hasAvatarData,
  avatarDataRaw,
  removeAvatar,
  currentPath,
  folder,
  userId,
}) {
  let avatarPath = currentPath || null;
  if (hasAvatarData) {
    const avatarData = normalizeOptionalString(avatarDataRaw);
    if (!avatarData) return { ok: false, error: 'Image de profil invalide' };
    const ext = detectAvatarExtension(avatarData);
    if (!ext) return { ok: false, error: 'Format image invalide (png/jpg/webp)' };
    const base64Payload = avatarData.includes(',') ? avatarData.split(',')[1] : avatarData;
    const bytes = Buffer.byteLength(base64Payload, 'base64');
    if (bytes > MAX_AVATAR_BYTES) {
      return { ok: false, error: 'Image trop lourde (max 2 Mo)' };
    }
    const relativePath = `${folder}/${userId}/avatar-${Date.now()}.${ext}`;
    await saveBase64ToDisk(relativePath, avatarData);
    if (currentPath && currentPath !== relativePath) {
      deleteFile(currentPath);
    }
    avatarPath = relativePath;
  } else if (removeAvatar) {
    if (currentPath) deleteFile(currentPath);
    avatarPath = null;
  }
  return { ok: true, avatarPath };
}

/**
 * Unicité GLOBALE pseudo/email (tous les comptes — périmètre des index
 * uq_users_pseudo / uq_users_email), hors compte en cours de modification.
 * @returns {Promise<string|null>} Message d'erreur 409, ou null si libre.
 */
async function findProfileUniquenessConflict(pseudo, email, excludeUserId) {
  if (pseudo) {
    const existingPseudo = await queryOne('SELECT id FROM users WHERE pseudo = ? AND id <> ?', [
      pseudo,
      excludeUserId,
    ]);
    if (existingPseudo) return 'Ce pseudo est déjà utilisé';
  }
  if (email) {
    const existingEmail = await queryOne('SELECT id FROM users WHERE email = ? AND id <> ?', [
      email,
      excludeUserId,
    ]);
    if (existingEmail) return 'Cet email est déjà utilisé';
  }
  return null;
}

/** Vrai pour une violation d'index unique MySQL (course résiduelle sur l'UPDATE). */
function isDuplicateEntryError(err) {
  return !!(err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY'));
}

module.exports = {
  PEDAGO_CONTENT_LEVEL_STUDENT_ERROR,
  resolvePedagoContentLevelUpdate,
  verifyCurrentPassword,
  readProfileFieldFlags,
  resolveVisitMascotUpdate,
  applyAvatarUpdate,
  findProfileUniquenessConflict,
  isDuplicateEntryError,
};
