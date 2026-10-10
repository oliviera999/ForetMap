'use strict';

/**
 * API publique du plan e-nov (`/api/enov/*`, host `enov.*`, migration 315).
 *
 * Le plan e-nov **est** le Plan Lyautey (`routes/plan.js`) : même écran, même carte, même
 * construction de charge (`lib/planContent.js`). Ce routeur ne fixe que ce qui lui est
 * propre :
 *
 *   - la surface `enov` — les lieux labellisés e-nov y apparaissent, avec leur texte e-nov
 *     (`enov_description`) et le drapeau `is_enov` qui les met en avant ;
 *   - les réglages `ui.enov_plan.*`, dont la mise en avant (`lib/enovPlan.js`) ;
 *   - sa **propre** garde par code (`security.enov_plan_access_code_hash`, cookie
 *     `enov_plan_access`) : un jury e-nov peut recevoir un code qui n'ouvre que ce plan.
 *
 * Lecteur anonyme sur une surface publique, charge indépendante du lecteur : elle se met en
 * cache par carte exactement comme celle du plan public. Ni tâches, ni élèves, ni progression
 * ne sortent d'ici.
 */

const express = require('express');
const bcrypt = require('bcryptjs');

const { getDataWriteVersion } = require('../database');
const {
  ENOV_PLAN_ACCESS_CODE_HASH_KEY,
  enovPlanAccessGate,
  grantEnovPlanAccess,
  isEnovPlanAccessGranted,
} = require('../lib/planAccess');
const { authLimiter } = require('../lib/rateLimit');
const asyncHandler = require('../lib/asyncHandler');
const { createWriteVersionCache } = require('../lib/shared/writeVersionCache');
const { getSettingValue } = require('../lib/settings');
const {
  PLAN_SURFACE_SETTINGS,
  loadPlanSettings,
  resolvePlanMap,
  buildPlanContent,
} = require('../lib/planContent');
const { loadEnovHighlightSettings } = require('../lib/enovPlan');

const router = express.Router();

/** Surface servie par ce routeur (`lib/locationSurfaces.js`). */
const ENOV_SURFACE = 'enov';

/** Réglages éditoriaux de cette surface (`lib/planContent.js`). */
const ENOV_SETTINGS = PLAN_SURFACE_SETTINGS.enov;

/** Fraîcheur navigateur / service worker de la charge publique (secondes). */
const ENOV_CONTENT_MAX_AGE_S = 60;

const enovContentCache = createWriteVersionCache({
  writeVersion: getDataWriteVersion,
  name: 'enovContentCache',
});

async function readAccessCodeHash() {
  return String((await getSettingValue(ENOV_PLAN_ACCESS_CODE_HASH_KEY, '')) || '');
}

/** Même limiteur que le plan public pour le code porté en query (`?code=`, QR). */
function limitInlineAccessCode(req, res, next) {
  if (String(req.query?.code || '').trim()) {
    return authLimiter(req, res, next);
  }
  return next();
}

/** Charge gardée : jamais `public` — un cache partagé servirait sans cookie. */
function enovContentCacheControl(settings) {
  const visibility = settings.access_mode === 'code' ? 'private' : 'public';
  return `${visibility}, max-age=${ENOV_CONTENT_MAX_AGE_S}`;
}

/** Saisie du code de diffusion : pose le laissez-passer si le code est bon (bcrypt). */
router.post(
  '/access',
  authLimiter,
  express.json({ limit: '4kb' }),
  asyncHandler(async (req, res) => {
    const settings = await loadPlanSettings(ENOV_SETTINGS);
    if (settings.access_mode !== 'code') return res.json({ ok: true, required: false });
    const hash = await readAccessCodeHash();
    if (!hash) return res.json({ ok: true, required: false });
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Code requis' });
    const valid = await bcrypt.compare(code, hash).catch(() => false);
    if (!valid) return res.status(401).json({ error: 'Code incorrect' });
    await grantEnovPlanAccess(res, hash);
    res.json({ ok: true, required: true });
  }),
);

/** Déconnexion : oublie le laissez-passer (toujours `200`, comme le plan public). */
router.post('/logout', (req, res) => {
  enovPlanAccessGate.clear(res);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true });
});

/** Réglages publics seuls (coquille : titre, message d'accueil, mode d'accès, mise en avant). */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const [settings, enov] = await Promise.all([
      loadPlanSettings(ENOV_SETTINGS),
      loadEnovHighlightSettings(),
    ]);
    const { map_id: _mapId, selectable_map_ids: _selectable, ...publicSettings } = settings;
    res.set('Cache-Control', `public, max-age=${ENOV_CONTENT_MAX_AGE_S}`);
    res.json({ ...publicSettings, enov });
  }),
);

/** Charge publique agrégée : carte, réglages, catégories, lieux (e-nov mis en avant). */
router.get(
  '/content',
  limitInlineAccessCode,
  asyncHandler(async (req, res) => {
    const settings = await loadPlanSettings(ENOV_SETTINGS);
    const inlineCode = String(req.query.code || '').trim();
    let grantedInline = false;
    if (settings.access_mode === 'code' && inlineCode) {
      const hash = await readAccessCodeHash();
      if (hash && (await bcrypt.compare(inlineCode, hash).catch(() => false))) {
        await grantEnovPlanAccess(res, hash);
        grantedInline = true;
      }
    }
    const granted =
      grantedInline || (await isEnovPlanAccessGranted(req, { accessMode: settings.access_mode }));
    if (!granted) {
      res.set('Cache-Control', 'no-store');
      return res.status(401).json({ error: 'Code d’accès requis', access_required: true });
    }
    const resolved = await resolvePlanMap(req.query.map_id, settings);
    if (!resolved.map) {
      const status = resolved.error === 'Carte introuvable' ? 400 : 404;
      return res.status(status).json({ error: resolved.error });
    }
    const mapId = String(resolved.map.id);
    res.set('Cache-Control', enovContentCacheControl(settings));
    const cached = enovContentCache.get(mapId);
    if (cached) return res.json(cached);
    const enov = await loadEnovHighlightSettings();
    const payload = await buildPlanContent(resolved.map, settings, {
      surface: ENOV_SURFACE,
      enov,
    });
    enovContentCache.set(mapId, payload);
    res.json(payload);
  }),
);

module.exports = router;
module.exports.enovContentCache = enovContentCache;
module.exports.ENOV_CONTENT_MAX_AGE_S = ENOV_CONTENT_MAX_AGE_S;
