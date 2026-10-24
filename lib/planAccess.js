'use strict';

/**
 * Garde d'accès du Plan Lyautey (lot 8, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.7), extraite
 * de `routes/plan.js` pour être partagée : la charge du plan **et** le catalogue public des
 * parcours (`routes/map-routes.js`) répondent à la même règle. Avant cette extraction, un
 * établissement en `access_mode = 'code'` fermait `/api/plan/content` mais laissait
 * `/api/map-routes` ouvert — la garde ne couvrait qu'une partie du plan
 * (`docs/AUDIT_PARCOURS_2026-09.md` §2.2).
 *
 * Mécanique identique à la progression anonyme de la Visite (`lib/accessGate.js`) : cookie
 * signé HMAC, HttpOnly, SameSite=Lax, Secure en production.
 */

const { codePassValue, createSignedCookieGate, resolveCookieSecret } = require('./accessGate');
const { getSettingValue } = require('./settings');
const { JWT_SECRET } = require('../middleware/requireTeacher');

/**
 * Durée par défaut du laissez-passer (30 jours) : un visiteur régulier ne resaisit pas le code.
 * Réglable par l'administrateur (`security.plan_access_pass_days`, `lib/settings/plan.js`).
 */
const PLAN_ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60;

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Durée réglée d'un laissez-passer, en secondes. Un réglage absent ou illisible retombe sur la
 * durée par défaut : le registre a déjà borné la valeur à l'écriture.
 * @param {string} key réglage en jours (`security.*_access_pass_days`)
 * @param {number} fallbackSeconds
 */
async function resolvePassTtlSeconds(key, fallbackSeconds) {
  const days = Math.floor(Number(await getSettingValue(key, 0)));
  return Number.isFinite(days) && days > 0 ? days * SECONDS_PER_DAY : fallbackSeconds;
}

/**
 * Laissez-passer **à échéance signée** (`expiring`) : la date d'expiration est dans la valeur et
 * sous la signature, le serveur la contrôle. Les laissez-passer émis avant cette échéance
 * (format `code-….<signature>`) sont refusés : ils ne portaient aucune limite vérifiable, et le
 * visiteur n'a qu'à ressaisir le code (ou rescanner le QR code) une fois.
 */
const planAccessGate = createSignedCookieGate({
  name: 'plan_access',
  ttlSeconds: PLAN_ACCESS_TTL_SECONDS,
  bindName: true,
  expiring: true,
  secret: () =>
    resolveCookieSecret({
      envVar: 'VISIT_COOKIE_SECRET',
      devFallback: () => JWT_SECRET || 'plan-dev-secret-change-me',
    }),
});

/** Pose le laissez-passer du plan, lié au code en vigueur (`hash`), pour la durée réglée. */
async function grantPlanAccess(res, hash) {
  const ttlSeconds = await resolvePassTtlSeconds(
    'security.plan_access_pass_days',
    PLAN_ACCESS_TTL_SECONDS,
  );
  planAccessGate.set(res, codePassValue(hash), { ttlSeconds });
}

/**
 * Le visiteur a-t-il le droit de lire une charge publique du plan ?
 *
 * @param {object} req requête Express (le laissez-passer est un cookie).
 * @param {{ accessMode?: string }} [options] `accessMode` évite une relecture du réglage
 *   quand l'appelant l'a déjà chargé (`routes/plan.js`).
 * @returns {Promise<boolean>}
 */
async function isPlanAccessGranted(req, { accessMode } = {}) {
  const mode =
    accessMode === undefined ? await getSettingValue('ui.plan.access_mode', 'public') : accessMode;
  if (mode !== 'code') return true;
  const hash = String((await getSettingValue('security.plan_access_code_hash', '')) || '');
  // Mode `code` sans code configuré : on n'enferme pas les visiteurs dehors par accident.
  if (!hash) return true;
  return planAccessGate.read(req) === codePassValue(hash);
}

/**
 * Plan e-nov (`enov.*`, migration 315) : même mécanique que le Plan Lyautey, avec **son
 * propre** code et **son propre** cookie. Les deux plans sont publics et peuvent être fermés
 * indépendamment : le code donné à un jury e-nov n'ouvre pas le plan de l'établissement, et
 * inversement.
 */
const enovPlanAccessGate = createSignedCookieGate({
  name: 'enov_plan_access',
  ttlSeconds: PLAN_ACCESS_TTL_SECONDS,
  bindName: true,
  expiring: true,
  secret: () =>
    resolveCookieSecret({
      envVar: 'VISIT_COOKIE_SECRET',
      devFallback: () => JWT_SECRET || 'plan-dev-secret-change-me',
    }),
});

/** Réglage portant l'empreinte bcrypt du code du plan e-nov. */
const ENOV_PLAN_ACCESS_CODE_HASH_KEY = 'security.enov_plan_access_code_hash';

/** Pose le laissez-passer du plan e-nov, lié au code en vigueur (`hash`), pour la durée réglée. */
async function grantEnovPlanAccess(res, hash) {
  const ttlSeconds = await resolvePassTtlSeconds(
    'security.enov_plan_access_pass_days',
    PLAN_ACCESS_TTL_SECONDS,
  );
  enovPlanAccessGate.set(res, codePassValue(hash), { ttlSeconds });
}

/**
 * Le visiteur a-t-il le droit de lire la charge du plan e-nov ?
 * @param {object} req
 * @param {{ accessMode?: string }} [options]
 */
async function isEnovPlanAccessGranted(req, { accessMode } = {}) {
  const mode =
    accessMode === undefined
      ? await getSettingValue('ui.enov_plan.access_mode', 'public')
      : accessMode;
  if (mode !== 'code') return true;
  const hash = String((await getSettingValue(ENOV_PLAN_ACCESS_CODE_HASH_KEY, '')) || '');
  // Mode `code` sans code configuré : on n'enferme pas les visiteurs dehors par accident.
  if (!hash) return true;
  return enovPlanAccessGate.read(req) === codePassValue(hash);
}

/** Middleware : 401 `access_required` quand le plan est fermé et le laissez-passer absent. */
function requirePlanAccess(req, res, next) {
  isPlanAccessGranted(req)
    .then((granted) => {
      if (granted) return next();
      return res.status(401).json({ error: 'Code d’accès requis', access_required: true });
    })
    .catch(next);
}

module.exports = {
  PLAN_ACCESS_TTL_SECONDS,
  resolvePassTtlSeconds,
  planAccessGate,
  grantPlanAccess,
  isPlanAccessGranted,
  requirePlanAccess,
  ENOV_PLAN_ACCESS_CODE_HASH_KEY,
  enovPlanAccessGate,
  grantEnovPlanAccess,
  isEnovPlanAccessGranted,
};
