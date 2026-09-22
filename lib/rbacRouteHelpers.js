'use strict';

/**
 * Logique pure de `routes/rbac.js` (O10) : constantes et validations des profils
 * (slugs réservés, clés de PATCH, paliers n3beur éligibles aux réglages forum /
 * commentaires / plafond de tâches), normalisations e-mail, emoji et entiers
 * optionnels, conversion des valeurs texte BDD en chaînes JSON stables.
 * Déplacement byte-identique depuis la route — AUCUN changement de logique,
 * aucune I/O, aucun accès req/res/DB. Les middlewares, résolutions de comptes
 * (resolveRbacSubjectForMutation) et émissions temps réel restent dans la route.
 */

const { PSEUDO_RE, PSEUDO_INVALID_MSG } = require('./shared/pseudo');
const { normalizeEmail } = require('./identity');
const {
  TEACHER_ACCESS_LOCKED_ROLE_SLUGS: TEACHER_ACCESS_LOCKED_ROLE_SLUGS_CORE,
  RESERVED_ROLE_SLUGS: RESERVED_ROLE_SLUGS_CORE,
  isSystemStaffRoleSlug,
  isN3beurTierSlug,
  normalizeRoleSlug,
} = require('./shared/n3beurRolesCore');

const MAX_DESCRIPTION_LEN = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STUDENT_ROLE_SLUG_RE = /^eleve_/i;

/**
 * Slugs réservés aux profils système : interdits pour création / duplication personnalisées.
 * Source unique : `lib/shared/n3beurRolesCore.js` (profils ForetMap **et** G&L, CDG-44).
 */
const RESERVED_ROLE_SLUGS = new Set(RESERVED_ROLE_SLUGS_CORE);

/**
 * Permission qui ouvre l'application aux comptes `user_type = 'teacher'`.
 *
 * Un compte enseignant n'a pas de fiche n3beur : la session cliente n'a donc rien
 * d'autre à quoi se raccrocher. Sans cette permission, le compte se connecte
 * (jeton émis, 200) puis revient sur l'écran de connexion. Le front ne s'en remet
 * plus à elle pour ouvrir la porte (cf. `isTeacherAccount` dans `src/App.jsx`),
 * mais la révoquer prive quand même le compte de toutes les routes qui l'exigent.
 */
const TEACHER_ACCESS_PERMISSION = 'teacher.access';

/**
 * Profils système qui ne peuvent pas perdre `teacher.access` depuis la console
 * « Profils & utilisateurs » — `admin` et `prof` seuls (source :
 * `lib/shared/n3beurRolesCore.js`).
 *
 * **Prof de classe en est sorti** (réalignement des profils du 22/09/2026). Le verrou
 * l'y avait mis parce que ce droit était alors sa seule porte d'entrée dans l'application ;
 * ce n'est plus vrai (le front ouvre sur la session, cf. `isTeacherAccount` dans
 * `src/App.jsx`), et le profil a désormais une interface de type apprenant, sans barre
 * haute n3boss. Le verrou avait pour effet pervers de rendre le profil **entièrement
 * inenregistrable** dès que la permission était retirée en base : la console renvoyait 400
 * sur tout `PUT .../permissions` ne la contenant pas, y compris pour une modification sans
 * rapport.
 *
 * La liste est figée contre `ROLE_PERMISSION_MATRIX` par le test de gel des matrices
 * (`tests/foretmap-permissions-catalog-alignment.test.js`) : tout profil système dont
 * la matrice porte `teacher.access` doit y figurer.
 */
const TEACHER_ACCESS_LOCKED_ROLE_SLUGS = new Set(TEACHER_ACCESS_LOCKED_ROLE_SLUGS_CORE);

/**
 * Refus motivé si un remplacement de permissions retirerait `teacher.access` à un
 * profil système qui en dépend.
 * @param {string} roleSlug slug du profil modifié
 * @param {string[]} permissionKeys clés demandées (liste complète de remplacement)
 * @returns {string|null} message d'erreur, ou `null` si la modification est permise
 */
function teacherAccessLockError(roleSlug, permissionKeys) {
  const slug = normalizeRoleSlug(roleSlug);
  if (!TEACHER_ACCESS_LOCKED_ROLE_SLUGS.has(slug)) return null;
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [];
  const keeps = keys.some(
    (key) =>
      String(key || '')
        .trim()
        .toLowerCase() === TEACHER_ACCESS_PERMISSION,
  );
  if (keeps) return null;
  return (
    'La permission « Accès interface n3boss » (teacher.access) ne peut pas être retirée ' +
    'au profil système « ' +
    slug +
    ' » : les comptes enseignants n’ont pas de fiche n3beur et ce droit conditionne ' +
    'leurs routes. Pour un profil sans barre haute n3boss, partez d’un profil dérivé ' +
    'plutôt que de décocher ce droit.'
  );
}

/**
 * Garde de rang (CDG-45). Le rang pilote la vue globale (≥ 400), l'échelle n3beur (< 400),
 * la barre haute n3boss et l'ordre entre groupes imposants : le rang d'un **profil système**
 * ne se modifie pas (monter « prof de classe » à 400 lui donnerait la vue globale), et, hors
 * administrateur, on ne pose pas un rang supérieur au sien sur un profil sur mesure.
 *
 * @param {{ actor: object|null, isSystemProfile: boolean, currentRank?: number|null,
 *   nextRank: number }} params
 * @returns {{ status: number, error: string }|null}
 */
function rankChangeError({ actor, isSystemProfile, currentRank = null, nextRank }) {
  const next = Number(nextRank);
  if (isSystemProfile && currentRank != null && next !== Number(currentRank)) {
    return { status: 400, error: 'Le rang d’un profil système ne se modifie pas' };
  }
  const actorIsAdmin = normalizeRoleSlug(actor?.roleSlug) === 'admin';
  if (!actorIsAdmin && next > Number(actor?.roleRank || 0)) {
    return {
      status: 403,
      error: 'Vous ne pouvez pas donner à un profil un rang supérieur au vôtre',
    };
  }
  return null;
}

function reservedRoleSlugError(slug) {
  if (!RESERVED_ROLE_SLUGS.has(normalizeRoleSlug(slug))) return null;
  return (
    'Ce slug est réservé au système (admin, n3boss, prof de classe, visiteur, personnel, palier n3beur d’origine ou profil Gnomes & Licornes). ' +
    'Choisissez un identifiant technique unique, par ex. n3boss_lycee ou prof_delegue. ' +
    'Le nom affiché peut librement être « Admin » ou « n3boss » ; seul le slug technique doit être distinct.'
  );
}

/** Clés reconnues pour PATCH /profiles/:id (snake + alias camel pour forum / commentaires). */
const PROFILE_PATCH_KEYS = new Set([
  'display_name',
  'rank',
  'emoji',
  'min_done_tasks',
  'display_order',
  'forum_participate',
  'forumParticipate',
  'context_comment_participate',
  'contextCommentParticipate',
  'max_concurrent_tasks',
  'maxConcurrentTasks',
]);
/** Profils hors paliers n3beur (seuils / forum / contexte non configurables ici). */
const isStaffRoleSlug = isSystemStaffRoleSlug;
/** Palier n3beur configurable : règle unique `isN3beurTierSlug` (lib/shared/n3beurRolesCore.js). */
const canConfigureStudentTierForumContext = isN3beurTierSlug;

/** Valeurs texte BDD → chaînes JSON stables (évite Buffer / types exotiques mysql2 côté client). */
function jsonTextField(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  const s = String(v);
  return s.length ? s : null;
}

function normalizeRoleEmoji(value) {
  const emoji = String(value || '').trim();
  if (!emoji) return null;
  return emoji.slice(0, 16);
}

function parseOptionalNonNegativeInt(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

/** null ou chaîne vide = hériter du réglage global ; 0–99 = plafond (0 = illimité pour ce profil). */
function parseOptionalMaxConcurrentTasks(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 99) return NaN;
  return n;
}

module.exports = {
  MAX_DESCRIPTION_LEN,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
  EMAIL_RE,
  STUDENT_ROLE_SLUG_RE,
  RESERVED_ROLE_SLUGS,
  reservedRoleSlugError,
  rankChangeError,
  TEACHER_ACCESS_PERMISSION,
  TEACHER_ACCESS_LOCKED_ROLE_SLUGS,
  teacherAccessLockError,
  PROFILE_PATCH_KEYS,
  isStaffRoleSlug,
  canConfigureStudentTierForumContext,
  normalizeEmail,
  jsonTextField,
  normalizeRoleEmoji,
  parseOptionalNonNegativeInt,
  parseOptionalMaxConcurrentTasks,
};
