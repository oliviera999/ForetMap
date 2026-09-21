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
    const allowedSlugs = await resolveAllowedRoleSlugs();
    if (accountMayAccessStaffPlan(auth, allowedSlugs)) {
      return {
        ok: true,
        via: 'account',
        auth,
        roleSlug: String(auth.roleSlug || '').toLowerCase(),
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
  isCodeAccessEnabled,
  resolveCodeRoleSlug,
  verifyStaffPlanCode,
  resolveStaffPlanViewer,
  staffPlanCacheKey,
};
