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

const { createSignedCookieGate, resolveCookieSecret } = require('./accessGate');
const { getSettingValue } = require('./settings');
const { JWT_SECRET } = require('../middleware/requireTeacher');

/** Durée du laissez-passer (30 jours) : un visiteur régulier ne resaisit pas le code. */
const PLAN_ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60;

const planAccessGate = createSignedCookieGate({
  name: 'plan_access',
  ttlSeconds: PLAN_ACCESS_TTL_SECONDS,
  secret: () =>
    resolveCookieSecret({
      envVar: 'VISIT_COOKIE_SECRET',
      devFallback: () => JWT_SECRET || 'plan-dev-secret-change-me',
    }),
});

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
  return planAccessGate.read(req) === 'ok';
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
  planAccessGate,
  isPlanAccessGranted,
  requirePlanAccess,
};
