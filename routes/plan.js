'use strict';

/**
 * API publique du Plan Lyautey (`/api/plan/*`, lot 4 du plan de convergence —
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8, `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §6).
 *
 * Le plan est un produit **sans session** : une seule carte, des lieux à trouver, aucune
 * validation de visite. La construction de la charge vit dans `lib/planContent.js`, partagée
 * avec le plan des personnels (`routes/staff-plan.js`) : mêmes tables que la carte de travail
 * ForetMap et la Visite (`zones`, `map_markers`, `location_categories`, textes `visit_*`,
 * photos de carte) — pas de copie des lieux. Ce routeur ne fixe que ce qui lui est propre :
 * la surface `plan`, un lecteur **anonyme** sur une surface publique, et la garde par code.
 * Ni tâches, ni élèves, ni progression ne sortent d'ici.
 *
 * Charge utile agrégée et mise en cache par carte (`lib/shared/writeVersionCache.js`) :
 * périmée à la première écriture, avec TTL garde-fou, plus `Cache-Control` court pour le
 * navigateur et le service worker. Le cache est sûr ici, et seulement ici : la charge du plan
 * public ne dépend pas du lecteur.
 */

const express = require('express');
const bcrypt = require('bcryptjs');

const { getDataWriteVersion } = require('../database');
const {
  planAccessGate,
  grantPlanAccess,
  isPlanAccessGranted,
  resolvePublicPlanSecret,
} = require('../lib/planAccess');
const { accessSecretKindForMode, accessSecretWording } = require('../lib/accessSecret');
const { authLimiter } = require('../lib/rateLimit');
const { logCodeAccessAttempt, CODE_ACCESS_REFUSAL_REASONS } = require('../lib/codeAccessJournal');
const asyncHandler = require('../lib/asyncHandler');
const { createWriteVersionCache } = require('../lib/shared/writeVersionCache');
const { getSettingValue } = require('../lib/settings');
const { applyClearSiteData, normalizeLogoutClearSiteDataScope } = require('../lib/clearSiteData');
const { loadPlanSettings, resolvePlanMap, buildPlanContent } = require('../lib/planContent');

const router = express.Router();

/** Surface servie par ce routeur (`lib/locationSurfaces.js`). */
const PLAN_SURFACE = 'plan';

/** Préfixe des réglages éditoriaux de cette surface (`lib/planContent.js`). */
const PLAN_SETTINGS_PREFIX = 'ui.plan.';

/** Fraîcheur navigateur / service worker de la charge publique (secondes). */
const PLAN_CONTENT_MAX_AGE_S = 60;

const planContentCache = createWriteVersionCache({
  writeVersion: getDataWriteVersion,
  name: 'planContentCache',
});

/** Refus d'un mot de passe présenté par un lien (`?code=`, QR) : un mot de passe se saisit. */
const PASSWORD_LINK_REFUSED = 'Ce plan est protégé par un mot de passe : saisissez-le.';

/** Le visiteur a-t-il le droit d'obtenir la charge du plan ? */
async function checkPlanAccess(req, settings) {
  return { ok: await isPlanAccessGranted(req, { accessMode: settings.access_mode }) };
}

/**
 * Le code en query (`?code=`, QR interne) est le même secret court que `POST /access`.
 * Sans ce limiteur, on pouvait tâtonner via GET hors du plafond d'authentification
 * (20 / 15 min) — seul le plafond général (1200 / min) s'appliquait.
 */
function limitInlineAccessCode(req, res, next) {
  if (String(req.query?.code || '').trim()) {
    return authLimiter(req, res, next);
  }
  return next();
}

/** Charge gated : jamais `public` — un cache partagé (CDN, proxy) servirait sans cookie. */
function planContentCacheControl(settings) {
  const visibility = accessSecretKindForMode(settings.access_mode) ? 'private' : 'public';
  return `${visibility}, max-age=${PLAN_CONTENT_MAX_AGE_S}`;
}

/**
 * Saisie du code d'accès ou du mot de passe (`ui.plan.access_mode` = `code` | `password`) :
 * pose le laissez-passer si le secret est bon. Limité en fréquence (`authLimiter`) — le
 * secret doit résister au tâtonnement. La comparaison passe par bcrypt : le secret n'est
 * stocké que haché (`lib/accessSecret.js`).
 *
 * `via: 'link'` signale un code porté par un lien que le plan échange (`?code=`, QR code) :
 * accepté pour un code d'accès, refusé (**403**) pour un mot de passe.
 */
router.post(
  '/access',
  authLimiter,
  express.json({ limit: '4kb' }),
  asyncHandler(async (req, res) => {
    const settings = await loadPlanSettings({ prefix: PLAN_SETTINGS_PREFIX });
    const secret = await resolvePublicPlanSecret(PLAN_SURFACE, settings.access_mode);
    if (!secret) return res.json({ ok: true, required: false });
    const { kind } = secret;
    const wording = accessSecretWording(kind);
    const via = req.body?.via === 'link' ? 'link' : 'form';
    if (via === 'link' && kind === 'password') {
      await logCodeAccessAttempt(req, PLAN_SURFACE, {
        granted: false,
        reason: CODE_ACCESS_REFUSAL_REASONS.linkDisabled,
        via,
        kind,
      });
      return res.status(403).json({ error: PASSWORD_LINK_REFUSED, access_kind: kind });
    }
    const code = String(req.body?.code || '').trim();
    if (!code) {
      await logCodeAccessAttempt(req, PLAN_SURFACE, {
        granted: false,
        reason: CODE_ACCESS_REFUSAL_REASONS.missing,
        via,
        kind,
      });
      return res.status(400).json({ error: wording.missing, access_kind: kind });
    }
    const valid = await bcrypt.compare(code, secret.hash).catch(() => false);
    if (!valid) {
      await logCodeAccessAttempt(req, PLAN_SURFACE, {
        granted: false,
        reason: CODE_ACCESS_REFUSAL_REASONS.invalid,
        via,
        kind,
      });
      return res.status(401).json({ error: wording.invalid, access_kind: kind });
    }
    await grantPlanAccess(res, secret.hash);
    await logCodeAccessAttempt(req, PLAN_SURFACE, { granted: true, via, kind });
    res.json({ ok: true, required: true });
  }),
);

/**
 * Déconnexion : oublie le laissez-passer posé par `POST /access`.
 *
 * Le plan public n'a ni compte ni session — il n'a qu'un cookie de laissez-passer quand
 * l'établissement le ferme par un code. « Se déconnecter » ne peut donc vouloir dire qu'une
 * chose ici : rendre l'appareil à l'écran de saisie du code, par exemple sur un poste
 * partagé ou une borne. Toujours `200`, même sans cookie : une déconnexion n'a pas à dire si
 * quelqu'un était entré.
 */
router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    planAccessGate.clear(res);
    const scope = normalizeLogoutClearSiteDataScope(
      await getSettingValue('privacy.logout_clear_site_data_scope', 'cache'),
    );
    applyClearSiteData(res, scope);
    res.json({ ok: true });
  }),
);

/** Réglages publics seuls (coquille : titre, message d'accueil, mode d'accès). */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await loadPlanSettings({ prefix: PLAN_SETTINGS_PREFIX });
    res.set('Cache-Control', `public, max-age=${PLAN_CONTENT_MAX_AGE_S}`);
    res.json(settings);
  }),
);

/** Charge publique agrégée : carte, réglages, catégories, lieux visibles sur le plan. */
router.get(
  '/content',
  limitInlineAccessCode,
  asyncHandler(async (req, res) => {
    const settings = await loadPlanSettings({ prefix: PLAN_SETTINGS_PREFIX });
    // Lien profond porteur du code (`?code=`) : les QR codes internes fonctionnent sans
    // saisie, et le laissez-passer est posé au passage. Un mot de passe, lui, ne s'ouvre
    // jamais par un lien.
    const inlineCode = String(req.query.code || '').trim();
    let grantedInline = false;
    if (inlineCode) {
      const secret = await resolvePublicPlanSecret(PLAN_SURFACE, settings.access_mode);
      if (
        secret?.kind === 'code' &&
        (await bcrypt.compare(inlineCode, secret.hash).catch(() => false))
      ) {
        await grantPlanAccess(res, secret.hash);
        // Le cookie vient d'être posé sur la réponse : il n'est pas encore dans la requête,
        // et cette requête-ci doit déjà être servie.
        grantedInline = true;
        await logCodeAccessAttempt(req, PLAN_SURFACE, { granted: true, via: 'link' });
      } else if (secret) {
        await logCodeAccessAttempt(req, PLAN_SURFACE, {
          granted: false,
          reason:
            secret.kind === 'password'
              ? CODE_ACCESS_REFUSAL_REASONS.linkDisabled
              : CODE_ACCESS_REFUSAL_REASONS.invalid,
          via: 'link',
          kind: secret.kind,
        });
      }
    }
    const access = grantedInline ? { ok: true } : await checkPlanAccess(req, settings);
    if (!access.ok) {
      // Refus : le plan est fermé par un secret ; `access_kind` dit lequel demander.
      const kind = accessSecretKindForMode(settings.access_mode) || 'code';
      res.set('Cache-Control', 'no-store');
      return res.status(401).json({
        error: accessSecretWording(kind).required,
        access_required: true,
        access_kind: kind,
      });
    }
    const resolved = await resolvePlanMap(req.query.map_id, settings);
    if (!resolved.map) {
      const status = resolved.error === 'Carte introuvable' ? 400 : 404;
      return res.status(status).json({ error: resolved.error });
    }
    const mapId = String(resolved.map.id);
    res.set('Cache-Control', planContentCacheControl(settings));
    const cached = planContentCache.get(mapId);
    if (cached) return res.json(cached);
    const payload = await buildPlanContent(resolved.map, settings, { surface: PLAN_SURFACE });
    planContentCache.set(mapId, payload);
    res.json(payload);
  }),
);

module.exports = router;
module.exports.planContentCache = planContentCache;
module.exports.planAccessGate = planAccessGate;
module.exports.PLAN_CONTENT_MAX_AGE_S = PLAN_CONTENT_MAX_AGE_S;
