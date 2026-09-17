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
const { planAccessGate, isPlanAccessGranted } = require('../lib/planAccess');
const { authLimiter } = require('../lib/rateLimit');
const asyncHandler = require('../lib/asyncHandler');
const { createWriteVersionCache } = require('../lib/shared/writeVersionCache');
const { getSettingValue } = require('../lib/settings');
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
  const visibility = settings.access_mode === 'code' ? 'private' : 'public';
  return `${visibility}, max-age=${PLAN_CONTENT_MAX_AGE_S}`;
}

/**
 * Saisie du code d'accès : pose le laissez-passer si le code est bon. Limité en fréquence
 * (`authLimiter`) — c'est un secret court, il doit résister au tâtonnement. La comparaison
 * passe par bcrypt : le code n'est stocké que haché (`security.plan_access_code_hash`).
 */
router.post(
  '/access',
  authLimiter,
  express.json({ limit: '4kb' }),
  asyncHandler(async (req, res) => {
    const settings = await loadPlanSettings({ prefix: PLAN_SETTINGS_PREFIX });
    if (settings.access_mode !== 'code') return res.json({ ok: true, required: false });
    const hash = String((await getSettingValue('security.plan_access_code_hash', '')) || '');
    if (!hash) return res.json({ ok: true, required: false });
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Code requis' });
    const valid = await bcrypt.compare(code, hash).catch(() => false);
    if (!valid) return res.status(401).json({ error: 'Code incorrect' });
    planAccessGate.set(res, 'ok');
    res.json({ ok: true, required: true });
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
    // saisie, et le laissez-passer est posé au passage.
    const inlineCode = String(req.query.code || '').trim();
    let grantedInline = false;
    if (settings.access_mode === 'code' && inlineCode) {
      const hash = String((await getSettingValue('security.plan_access_code_hash', '')) || '');
      if (hash && (await bcrypt.compare(inlineCode, hash).catch(() => false))) {
        planAccessGate.set(res, 'ok');
        // Le cookie vient d'être posé sur la réponse : il n'est pas encore dans la requête,
        // et cette requête-ci doit déjà être servie.
        grantedInline = true;
      }
    }
    const access = grantedInline ? { ok: true } : await checkPlanAccess(req, settings);
    if (!access.ok) {
      res.set('Cache-Control', 'no-store');
      return res.status(401).json({ error: 'Code d’accès requis', access_required: true });
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
