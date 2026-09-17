'use strict';

/**
 * API du plan des personnels (`/api/staff-plan/*`, proflyautey — surface `staff`).
 *
 * Même carte et même écran que le Plan Lyautey public, mais servis à un lecteur **identifié** :
 * la charge est construite par le noyau partagé `lib/planContent.js` avec `surface: 'staff'` et
 * le lecteur réel, si bien que `lib/locationAudience.js` lui laisse les lieux réservés à son
 * rôle et les compléments confidentiels (`restricted_note`) — exactement ce que le plan public
 * retire à son visiteur anonyme.
 *
 * Aucun cache côté serveur, contrairement au plan public, et c'est délibéré : là-bas la charge
 * est la même pour tout le monde, ici elle dépend du rôle du lecteur. Un cache mémoïsé par
 * carte — le réflexe naturel en copiant `routes/plan.js` — servirait la charge d'un
 * administrateur au porteur de code suivant. L'audience se compte en dizaines de personnes :
 * le cache n'achèterait rien en face de ce risque. Si la charge devait un jour être mémoïsée,
 * partir de `staffPlanCacheKey()` (`lib/staffPlanAccess.js`), qui intègre rôle et droits.
 */

const express = require('express');

const { authLimiter } = require('../lib/rateLimit');
const asyncHandler = require('../lib/asyncHandler');
const { logAudit } = require('../lib/auditLog');
const { loadPlanSettings, resolvePlanMap, buildPlanContent } = require('../lib/planContent');
const { resolveOAuthPublicOrigin } = require('../lib/oauthPublicUrl');
const {
  staffPlanAccessGate,
  isCodeAccessEnabled,
  resolveCodeRoleSlug,
  verifyStaffPlanCode,
  resolveStaffPlanViewer,
} = require('../lib/staffPlanAccess');

const router = express.Router();

/** Surface servie par ce routeur (`lib/locationSurfaces.js`). */
const STAFF_SURFACE = 'staff';

/** Préfixe des réglages éditoriaux de cette surface (`lib/planContent.js`). */
const STAFF_SETTINGS_PREFIX = 'ui.staff_plan.';

/** Modes acceptés pour `ui.staff_plan.access_mode` ; le premier est le repli. */
const STAFF_ACCESS_MODES = Object.freeze(['disabled', 'code']);

function loadStaffPlanSettings() {
  return loadPlanSettings({
    prefix: STAFF_SETTINGS_PREFIX,
    accessModes: STAFF_ACCESS_MODES,
  });
}

/**
 * Origine publique de la console ForetMap. `FRONTEND_ORIGIN` quand elle est configurée (cas
 * d'un déploiement multi-hôtes), sinon rien : mieux vaut pas de lien qu'un lien vers
 * `proflyautey.*`, où la console n'est pas servie.
 */
function resolveConsoleBaseUrl(req) {
  const configured = resolveOAuthPublicOrigin(req, process.env.FRONTEND_ORIGIN);
  const current = resolveOAuthPublicOrigin(req);
  return configured && configured !== current ? configured : '';
}

/** Rien de cette surface ne doit être mis en cache par un intermédiaire, ni indexé. */
function setPrivateHeaders(res) {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
}

/**
 * Coquille d'accueil : ce que le front a le droit de savoir **avant** d'être entré — le titre,
 * le message d'accueil, et si la saisie d'un code est proposée à côté du bouton de connexion.
 * Volontairement pauvre : elle est servie à un visiteur qui n'a encore rien prouvé.
 */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await loadStaffPlanSettings();
    setPrivateHeaders(res);
    res.json({
      title: settings.title,
      welcome_hint: settings.welcome_hint,
      attribution: settings.attribution,
      code_enabled: await isCodeAccessEnabled(),
    });
  }),
);

/**
 * Saisie du code partagé : pose le laissez-passer si le code est bon. Sous `authLimiter` —
 * c'est un secret court, il doit résister au tâtonnement — et journalisé : un code partagé ne
 * dit pas qui entre, le journal dit au moins quand et depuis où.
 */
router.post(
  '/access',
  authLimiter,
  express.json({ limit: '4kb' }),
  asyncHandler(async (req, res) => {
    setPrivateHeaders(res);
    if (!(await isCodeAccessEnabled())) {
      return res.status(403).json({ error: 'Entrée par code désactivée' });
    }
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Code requis' });
    if (!(await verifyStaffPlanCode(code))) {
      await logAudit('staff_plan.access.code_refused', 'staff_plan', null, 'Code refusé', {
        payload: { ip: req.ip, requestId: req.requestId },
      });
      return res.status(401).json({ error: 'Code incorrect' });
    }
    staffPlanAccessGate.set(res, 'ok');
    const roleSlug = await resolveCodeRoleSlug();
    await logAudit('staff_plan.access.code_granted', 'staff_plan', null, 'Entrée par code', {
      payload: { ip: req.ip, requestId: req.requestId, roleSlug },
    });
    res.json({ ok: true, role_slug: roleSlug });
  }),
);

/**
 * Charge agrégée de la surface personnels : carte, réglages, catégories, lieux et parcours,
 * filtrés pour le lecteur. Refus explicite (401) plutôt que charge appauvrie : le front doit
 * pouvoir proposer la connexion, et éventuellement le code.
 */
router.get(
  '/content',
  asyncHandler(async (req, res) => {
    setPrivateHeaders(res);
    const viewer = await resolveStaffPlanViewer(req);
    if (!viewer.ok) {
      return res.status(401).json({
        error: 'Connexion requise',
        auth_required: true,
        code_available: viewer.codeAvailable,
      });
    }
    const settings = await loadStaffPlanSettings();
    const resolved = await resolvePlanMap(req.query.map_id, settings);
    if (!resolved.map) {
      const status = resolved.error === 'Carte introuvable' ? 400 : 404;
      return res.status(status).json({ error: resolved.error });
    }
    const payload = await buildPlanContent(resolved.map, settings, {
      surface: STAFF_SURFACE,
      auth: viewer.auth,
    });
    // Le front n'affiche le lien retour vers la console que pour qui peut réellement éditer le
    // lieu : une invitation à cliquer sur une porte fermée n'aide personne.
    const canEditLocations =
      viewer.via === 'account' &&
      (viewer.auth?.permissions || []).some(
        (p) => p === 'zones.manage' || p === 'map.manage_markers',
      );
    res.json({
      ...payload,
      viewer: {
        via: viewer.via,
        role_slug: viewer.roleSlug,
        can_edit_locations: canEditLocations,
        // Origine de la console ForetMap, calculée ici plutôt que devinée côté navigateur :
        // `proflyautey.*` ne permet pas de retrouver l'hôte de ForetMap par simple découpage.
        // Vide si le serveur ne la connaît pas — le front n'affiche alors aucun lien.
        console_base_url: canEditLocations ? resolveConsoleBaseUrl(req) : '',
        // Proposer / signaler passe par les commentaires de contexte, qui exigent un compte.
        can_report: viewer.via === 'account',
      },
    });
  }),
);

module.exports = router;
module.exports.STAFF_SURFACE = STAFF_SURFACE;
module.exports.STAFF_SETTINGS_PREFIX = STAFF_SETTINGS_PREFIX;
