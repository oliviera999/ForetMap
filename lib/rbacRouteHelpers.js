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

const { normalizeOptionalString } = require('./shared/httpHelpers');

const MAX_DESCRIPTION_LEN = 300;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STUDENT_ROLE_SLUG_RE = /^eleve_/i;

/** Slugs réservés aux profils système : interdits pour création / duplication personnalisées. */
const RESERVED_ROLE_SLUGS = new Set([
  'admin',
  'prof',
  'visiteur',
  'eleve_novice',
  'eleve_avance',
  'eleve_chevronne',
]);

function reservedRoleSlugError(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  if (!RESERVED_ROLE_SLUGS.has(s)) return null;
  return (
    'Ce slug est réservé au système (admin, n3boss, visiteur ou palier n3beur d’origine). ' +
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
/** Profils pour lesquels on règle seuils / tasks.propose / forum côté n3beur (hors admin, n3boss, visiteur). */
function isStaffRoleSlug(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase();
  return s === 'admin' || s === 'prof' || s === 'visiteur';
}
/** Slug eleve_* ou palier personnalisé (rang strictement inférieur à celui du profil n3boss, 400) : mêmes réglages que les paliers seedés. */
function canConfigureStudentTierForumContext(slug, rank) {
  if (isStaffRoleSlug(slug)) return false;
  if (STUDENT_ROLE_SLUG_RE.test(slug)) return true;
  const r = Number(rank);
  return Number.isFinite(r) && r < 400;
}

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

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
  EMAIL_RE,
  STUDENT_ROLE_SLUG_RE,
  RESERVED_ROLE_SLUGS,
  reservedRoleSlugError,
  PROFILE_PATCH_KEYS,
  isStaffRoleSlug,
  canConfigureStudentTierForumContext,
  normalizeEmail,
  jsonTextField,
  normalizeRoleEmoji,
  parseOptionalNonNegativeInt,
  parseOptionalMaxConcurrentTasks,
};
