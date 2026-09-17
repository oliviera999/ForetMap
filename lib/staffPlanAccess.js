'use strict';

/**
 * Porte d'entrée du plan des personnels (proflyautey, surface `staff`).
 *
 * Deux voies, dans cet ordre :
 *
 *  1. **Compte ForetMap** (Google ou mot de passe) portant la permission `staff_plan.access`.
 *     C'est l'entrée normale, toujours ouverte, et la seule qui donne un rôle réel : les lieux
 *     réservés à un rôle précis et les compléments confidentiels sont filtrés par
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

/** Permission RBAC ouvrant le plan des personnels (`lib/rbac.js`). */
const STAFF_PLAN_PERMISSION = 'staff_plan.access';

/**
 * Durée du laissez-passer de code : 7 jours, contre 30 pour le plan public. Le plan public ne
 * protège qu'une diffusion ; ici le code ouvre des informations internes, et un secret partagé
 * qu'on ne peut pas révoquer individuellement doit expirer plus vite.
 */
const STAFF_PLAN_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;

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
  if (auth && hasPermission(auth, STAFF_PLAN_PERMISSION)) {
    return {
      ok: true,
      via: 'account',
      auth,
      roleSlug: String(auth.roleSlug || '').toLowerCase(),
    };
  }

  const codeAvailable = await isCodeAccessEnabled();
  if (codeAvailable && staffPlanAccessGate.read(req) === 'ok') {
    const roleSlug = await resolveCodeRoleSlug();
    return {
      ok: true,
      via: 'code',
      // Pas de `permissions` : `isLocationManager()` reste faux, et le lecteur ne reçoit ni
      // `visible_role_slugs` ni `restricted_note_role_slugs`.
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
  STAFF_PLAN_ACCESS_TTL_SECONDS,
  staffPlanAccessGate,
  isCodeAccessEnabled,
  resolveCodeRoleSlug,
  verifyStaffPlanCode,
  resolveStaffPlanViewer,
  staffPlanCacheKey,
};
