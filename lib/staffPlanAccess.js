'use strict';

/**
 * Porte d'entrée du plan des personnels (proflyautey, surface `staff`).
 *
 * Deux voies, dans cet ordre :
 *
 *  1. **Compte ForetMap** (Google ou mot de passe) dont le profil est dans
 *     `ui.staff_plan.allowed_role_slugs` (réglage admin, défaut : admin / n3boss /
 *     prof de classe / personnel). Un profil maison hors catalogue peut encore entrer via
 *     la permission RBAC `staff_plan.access`. C'est l'entrée normale, et la seule qui donne
 *     un rôle réel : les lieux réservés et les compléments confidentiels sont filtrés par
 *     `lib/locationAudience.js` à partir de ce rôle.
 *  2. **Code partagé**, seulement si un admin a basculé `ui.staff_plan.access_mode` sur `code`
 *     (défaut : `disabled`). Prévue pour les personnels sans compte — agent, intervenant,
 *     remplaçant. Un code partagé n'est **pas** une authentification : il ne se révoque
 *     qu'en le changeant, il se transmet d'une capture d'écran, et il ne dit pas qui est
 *     entré. D'où trois garde-fous : laissez-passer plus court que celui du plan public
 *     (7 jours contre 30), rôle endossé réglable et volontairement bas
 *     (`ui.staff_plan.code_role_slug`, défaut `personnel`), et journalisation de chaque
 *     ouverture dans le journal d'audit.
 *
 * Le laissez-passer réutilise la mécanique éprouvée de `lib/accessGate.js` (cookie signé
 * HMAC-SHA256, comparaison en temps constant, HttpOnly, SameSite=Lax, Secure en production),
 * comme la progression anonyme de la Visite et le code du plan public.
 */

const bcrypt = require('bcryptjs');

const { queryOne } = require('../database');
const { createSignedCookieGate, resolveCookieSecret } = require('./accessGate');
const { getSettingValue } = require('./settings');
const {
  JWT_SECRET,
  hydrateAuthFromTokenClaims,
  hasPermission,
} = require('../middleware/requireTeacher');
const { parseOptionalForetAuth } = require('./auth/jwtPipeline');
const { FORETMAP_AUDIENCE_ROLE_SLUGS, isKnownAudienceRoleSlug } = require('./locationAudience');

/** Permission RBAC ouvrant le plan des personnels (`lib/rbac.js`). */
const STAFF_PLAN_PERMISSION = 'staff_plan.access';

/**
 * Profils autorisés par défaut à ouvrir proflyautey via leur compte — alignés sur la matrice
 * RBAC livrée (`admin`, `prof`, `prof_classe`, `personnel`). Réglables dans
 * **Réglages → Plan Lyautey → Plan des personnels** (`ui.staff_plan.allowed_role_slugs`).
 */
const DEFAULT_ALLOWED_ROLE_SLUGS = Object.freeze(['admin', 'prof', 'prof_classe', 'personnel']);

/**
 * Durée du laissez-passer de code : 7 jours, contre 30 pour le plan public. Le plan public ne
 * protège qu'une diffusion ; ici le code ouvre des informations internes, et un secret partagé
 * qu'on ne peut pas révoquer individuellement doit expirer plus vite.
 */
const STAFF_PLAN_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Normalise une valeur de réglage (CSV / JSON / tableau) en liste de slugs d'audience connus,
 * dédoublonnés, ordre canonique. Un slug hors catalogue est ignoré (profil maison : voir
 * `accountMayAccessStaffPlan`).
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseAllowedRoleSlugs(raw) {
  if (raw == null || raw === '') return [];
  let parts = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        parts = JSON.parse(trimmed);
      } catch {
        parts = trimmed.split(/[,;]/);
      }
    } else {
      parts = trimmed.split(/[,;]/);
    }
  }
  if (!Array.isArray(parts)) return [];
  const seen = new Set();
  for (const item of parts) {
    const slug = String(item || '')
      .trim()
      .toLowerCase();
    if (slug && isKnownAudienceRoleSlug(slug)) seen.add(slug);
  }
  return FORETMAP_AUDIENCE_ROLE_SLUGS.filter((s) => seen.has(s));
}

/** Sérialise une liste de slugs pour `ui.staff_plan.allowed_role_slugs` (`;`-séparé). */
function formatAllowedRoleSlugs(slugs) {
  return parseAllowedRoleSlugs(slugs).join(';');
}

async function resolveAllowedRoleSlugs() {
  const raw = await getSettingValue(
    'ui.staff_plan.allowed_role_slugs',
    DEFAULT_ALLOWED_ROLE_SLUGS.join(';'),
  );
  const parsed = parseAllowedRoleSlugs(raw);
  // Liste vide (réglage jamais écrit correctement, ou champ texte de la grille générique
  // vidé par accident) → défaut livré. Un « personne du catalogue » volontaire n'a pas de
  // sens opérationnel : on préfère rouvrir plutôt que de fermer proflyautey à tout le monde.
  if (parsed.length === 0) return [...DEFAULT_ALLOWED_ROLE_SLUGS];
  return parsed;
}

/**
 * Un compte authentifié peut-il ouvrir le plan des personnels ?
 *
 * Accès si **l'un** des deux est vrai :
 * 1. permission RBAC `staff_plan.access` (profils livrés + profils maison) ;
 * 2. profil listé dans `ui.staff_plan.allowed_role_slugs` (cases des réglages — pour
 *    ouvrir un profil sans toucher aux permissions RBAC).
 *
 * @param {{ roleSlug?: string, permissions?: string[] } | null | undefined} auth
 * @param {string[]} [allowedSlugs] liste déjà résolue (évite un second `getSetting` en tests)
 */
function accountMayAccessStaffPlan(auth, allowedSlugs) {
  if (!auth) return false;
  if (hasPermission(auth, STAFF_PLAN_PERMISSION)) return true;
  const roleSlug = String(auth.roleSlug || '')
    .trim()
    .toLowerCase();
  const allowed = Array.isArray(allowedSlugs) ? allowedSlugs : [];
  return !!(roleSlug && allowed.includes(roleSlug));
}

/** Slug du profil **attribué** au compte (`users.assigned_role_id`), ou `''`. */
async function loadAssignedRoleSlug(userId) {
  const id = String(userId ?? '').trim();
  if (!id) return '';
  const row = await queryOne(
    'SELECT r.slug FROM users u INNER JOIN roles r ON r.id = u.assigned_role_id WHERE u.id = ? LIMIT 1',
    [id],
  );
  return String(row?.slug || '')
    .trim()
    .toLowerCase();
}

/**
 * Accès d'un compte authentifié au plan des personnels — **profil effectif d'abord, profil
 * attribué ensuite**.
 *
 * Le profil effectif (`user_roles.is_primary`) n'est pas ce qu'un administrateur attribue : un
 * groupe actif confère le sien dès qu'il est de rang supérieur. Tant que « Personnel » était au
 * rang 50 — sous `n3beur novice` —, un personnel rattaché à un groupe (vie scolaire suivant une
 * classe, agent inscrit à un projet) se retrouvait avec un profil effectif d'élève, sans
 * `staff_plan.access` ni case cochée : « Connexion réussie, mais ce compte n'a pas encore
 * l'accès au plan des personnels », alors que sa fiche affichait bien « Personnel ». Le profil
 * attribué est la déclaration de l'administrateur sur *qui est cette personne* ; un groupe est
 * là pour élever ses capacités dans ForetMap, pas pour lui retirer sa qualité de personnel.
 *
 * Depuis le réalignement du 22/09/2026, « Personnel » est au rang 320 et n'est donc plus
 * recouvert par un groupe classe : ce repli ne devrait plus se déclencher pour lui. Il reste
 * en place — il couvre tout profil maison de rang bas porteur de `staff_plan.access`, et rien
 * n'interdit à un administrateur de rebaisser le rang.
 *
 * L'entrée par le profil attribué **n'ajoute aucune capacité** : les permissions du lecteur
 * restent les siennes (donc jamais gestionnaire de lieux par ce biais), seul le profil
 * d'audience suit ce que l'administrateur a attribué.
 *
 * @param {{ roleSlug?: string, permissions?: string[], userId?: string, userType?: string } | null} auth
 * @param {string[]} [allowedSlugs] liste déjà résolue (évite un second `getSetting`)
 * @returns {Promise<{ ok: boolean, roleSlug: string, via?: 'role' | 'assigned_role' }>}
 */
async function resolveAccountStaffPlanAccess(auth, allowedSlugs) {
  if (!auth) return { ok: false, roleSlug: '' };
  const allowed = Array.isArray(allowedSlugs) ? allowedSlugs : await resolveAllowedRoleSlugs();
  const effective = String(auth.roleSlug || '')
    .trim()
    .toLowerCase();
  if (accountMayAccessStaffPlan(auth, allowed)) {
    return { ok: true, roleSlug: effective, via: 'role' };
  }
  const assigned = await loadAssignedRoleSlug(auth.userId);
  if (assigned && assigned !== effective) {
    // Permissions du profil attribué : un profil maison ouvert par `staff_plan.access` entre
    // par cette voie comme un profil livré.
    const { buildAuthzPayloadForRoleSlug } = require('./rbac');
    const authz = await buildAuthzPayloadForRoleSlug(assigned, auth.userType);
    const asAssigned = { roleSlug: assigned, permissions: authz?.permissions || [] };
    if (accountMayAccessStaffPlan(asAssigned, allowed)) {
      return { ok: true, roleSlug: assigned, via: 'assigned_role' };
    }
  }
  return { ok: false, roleSlug: effective };
}

const staffPlanAccessGate = createSignedCookieGate({
  name: 'staff_plan_access',
  ttlSeconds: STAFF_PLAN_ACCESS_TTL_SECONDS,
  secret: () =>
    resolveCookieSecret({
      envVar: 'VISIT_COOKIE_SECRET',
      devFallback: () => JWT_SECRET || 'staff-plan-dev-secret-change-me',
    }),
});

/** Le code partagé est-il activé **et** réellement configuré ? */
async function isCodeAccessEnabled() {
  const mode = await getSettingValue('ui.staff_plan.access_mode', 'disabled');
  if (mode !== 'code') return false;
  const hash = String((await getSettingValue('security.staff_plan_access_code_hash', '')) || '');
  return !!hash;
}

/**
 * Rôle endossé par un porteur de code. Contrairement au plan public — où l'absence de code
 * configuré ouvre la porte pour ne pas enfermer les visiteurs dehors — ici un réglage vide
 * **ferme** : la surface `staff` n'a pas de version publique acceptable.
 */
async function resolveCodeRoleSlug() {
  const slug = String((await getSettingValue('ui.staff_plan.code_role_slug', 'personnel')) || '')
    .trim()
    .toLowerCase();
  return slug || 'personnel';
}

/** Vérifie un code en clair contre le hachage stocké (bcrypt, jamais de comparaison directe). */
async function verifyStaffPlanCode(code) {
  const value = String(code || '').trim();
  if (!value) return false;
  const hash = String((await getSettingValue('security.staff_plan_access_code_hash', '')) || '');
  if (!hash) return false;
  return bcrypt.compare(value, hash).catch(() => false);
}

/**
 * Lecteur du plan des personnels pour cette requête.
 *
 * @returns {Promise<{
 *   ok: true,
 *   via: 'account' | 'code',
 *   auth: object,
 *   roleSlug: string,
 * } | { ok: false, codeAvailable: boolean }>}
 *   `auth` est passé tel quel à `lib/locationAudience.js`. Pour un porteur de code, c'est un
 *   lecteur **synthétique** : un rôle, aucune permission — donc jamais gestionnaire de lieux,
 *   donc jamais l'accès complet aux métadonnées d'audience.
 */
async function resolveStaffPlanViewer(req) {
  const auth = await parseOptionalForetAuth(req, {
    jwtSecret: JWT_SECRET,
    hydrateAuthFromTokenClaims,
  });
  if (auth) {
    const access = await resolveAccountStaffPlanAccess(auth);
    if (access.ok) {
      return {
        ok: true,
        via: 'account',
        // Entré par le profil attribué : le profil d'audience suit celui-ci, les permissions
        // restent celles du lecteur (aucune capacité gagnée au passage).
        auth: access.via === 'assigned_role' ? { ...auth, roleSlug: access.roleSlug } : auth,
        roleSlug: access.roleSlug,
      };
    }
  }

  const codeAvailable = await isCodeAccessEnabled();
  if (codeAvailable && staffPlanAccessGate.read(req) === 'ok') {
    const roleSlug = await resolveCodeRoleSlug();
    return {
      ok: true,
      via: 'code',
      // Pas de `permissions` : `isLocationManager()` reste faux, et le lecteur ne reçoit ni
      // `visible_role_slugs` ni l'audience des compléments (`location_notes`).
      auth: { roleSlug, permissions: [] },
      roleSlug,
    };
  }

  return { ok: false, codeAvailable };
}

/**
 * Clé de cache d'une charge `staff`. **Non utilisée aujourd'hui** : la charge du plan des
 * personnels n'est volontairement pas mise en cache côté serveur (`routes/staff-plan.js`).
 * Elle est laissée ici, documentée, pour qu'un futur cache parte de la bonne clé plutôt que
 * de celle du plan public : le contenu dépend du lecteur, pas seulement de la carte.
 */
function staffPlanCacheKey(mapId, viewer) {
  const manager =
    hasPermission(viewer?.auth, 'zones.manage') ||
    hasPermission(viewer?.auth, 'map.manage_markers');
  return `${mapId}|${viewer?.roleSlug || ''}|${manager ? 'mgr' : 'ro'}`;
}

module.exports = {
  STAFF_PLAN_PERMISSION,
  DEFAULT_ALLOWED_ROLE_SLUGS,
  STAFF_PLAN_ACCESS_TTL_SECONDS,
  staffPlanAccessGate,
  parseAllowedRoleSlugs,
  formatAllowedRoleSlugs,
  resolveAllowedRoleSlugs,
  accountMayAccessStaffPlan,
  resolveAccountStaffPlanAccess,
  loadAssignedRoleSlug,
  isCodeAccessEnabled,
  resolveCodeRoleSlug,
  verifyStaffPlanCode,
  resolveStaffPlanViewer,
  staffPlanCacheKey,
};
