'use strict';

/**
 * API du plan des personnels (`/api/staff-plan/*`, proflyautey — surface `staff`).
 *
 * Même carte et même écran que le Plan Lyautey public, mais servis à un lecteur **identifié** :
 * la charge est construite par le noyau partagé `lib/planContent.js` avec `surface: 'staff'` et
 * le lecteur réel, si bien que `lib/locationAudience.js` lui laisse les lieux réservés à son
 * rôle et les compléments confidentiels (`location_notes`) — exactement ce que le plan public
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
const {
  loadPlanSettings,
  resolvePlanMap,
  buildPlanContent,
  findPlanPlace,
} = require('../lib/planContent');
const { emitContextCommentsChanged } = require('../lib/realtime');
const { isModuleEnabled } = require('../lib/shared/moduleGate');
const { getActor, createCooldownChecker } = require('../lib/shared/participationGuards');
const {
  CONTEXT_COMMENT_LIMITS,
  insertContextComment,
} = require('../lib/shared/contextCommentsCore');
const { listMyPlaceReports } = require('../lib/placeMessages');
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

/** Bornes du message de « Signaler ou proposer » : celles d'un commentaire de contexte. */
const { MIN_BODY: MIN_REPORT_BODY, MAX_BODY: MAX_REPORT_BODY } = CONTEXT_COMMENT_LIMITS;

/** Anti-rafale, aligné sur les commentaires de contexte de la console. */
const REPORT_COOLDOWN_MS = 3_000;
const checkReportCooldown = createCooldownChecker();

/**
 * Le « Signaler ou proposer » d'une fiche de lieu écrit dans les commentaires de contexte du
 * lieu. Le module doit donc être actif : sinon le message partirait dans une table que plus
 * aucun écran ne lit, ce qui revient à le jeter en promettant le contraire.
 */
function isPlaceReportModuleEnabled() {
  return isModuleEnabled('foret', 'context_comments');
}

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
    // Proposer / signaler exige un compte (le message est signé) **et** le module de
    // commentaires actif (c'est là que le message atterrit). Calculé ici plutôt que deviné
    // par le front : un bouton qui mène à un 403 est pire que pas de bouton.
    const canReport = viewer.via === 'account' && (await isPlaceReportModuleEnabled());
    // Ce que ce lecteur a déjà signalé, avec l'état de traitement. Servi avec la charge plutôt
    // que par un appel à l'ouverture de chaque fiche : c'est une liste courte (ce qu'une seule
    // personne a écrit), et le plan doit rester utilisable hors ligne une fois chargé.
    const myReports = canReport
      ? (await listMyPlaceReports({ actor: getActor(viewer.auth), limit: 50 })).items
      : [];
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
        can_report: canReport,
      },
      my_reports: myReports,
    });
  }),
);

/**
 * « Signaler un problème ou proposer une correction » depuis la fiche d'un lieu.
 *
 * Le message devient un **commentaire de contexte du lieu** (`context_comments`, `zone` ou
 * `marker`) : il arrive là où un administrateur le retrouve avec son contexte, et hérite de la
 * modération, des photos et du signalement déjà en place. Il ressort aussi dans la vue
 * « Messages reçus sur les lieux » de la console (`GET /api/context-comments/recent`).
 *
 * Pourquoi une route ici plutôt qu'un appel direct à `POST /api/context-comments` : ce
 * routeur-là refuse les profils en lecture seule — `visiteur` **et `personnel`** — alors que
 * `personnel` est précisément le public de cette surface. Un agent voyait donc le bouton et
 * recevait un 403 en l'utilisant. Plutôt que d'ouvrir les commentaires de la console à un
 * profil qui n'y a rien à faire, l'écriture passe par la porte de cette surface, avec sa
 * propre garde : un compte autorisé sur le plan des personnels, et un lieu réellement visible
 * par ce lecteur sur le plan des personnels.
 */
router.post(
  '/report',
  express.json({ limit: '16kb' }),
  asyncHandler(async (req, res) => {
    setPrivateHeaders(res);
    const viewer = await resolveStaffPlanViewer(req);
    if (!viewer.ok) {
      return res.status(401).json({ error: 'Connexion requise', auth_required: true });
    }
    if (viewer.via !== 'account') {
      return res.status(403).json({
        error: 'Réservé aux comptes : un porteur de code n’a pas d’identité à associer au message.',
      });
    }
    if (!(await isPlaceReportModuleEnabled())) {
      return res.status(503).json({ error: 'Commentaires de contexte désactivés' });
    }
    const actor = getActor(viewer.auth);
    if (!actor) return res.status(401).json({ error: 'Session invalide' });

    const contextType = String(req.body?.contextType || '')
      .trim()
      .toLowerCase();
    const contextId = String(req.body?.contextId || '').trim();
    const body = String(req.body?.body ?? '').trim();
    if (contextType !== 'zone' && contextType !== 'marker') {
      return res.status(400).json({ error: 'contextType invalide (zone|marker)' });
    }
    if (!contextId) return res.status(400).json({ error: 'contextId requis' });
    if (body.length < MIN_REPORT_BODY || body.length > MAX_REPORT_BODY) {
      return res
        .status(400)
        .json({ error: `Message invalide (${MIN_REPORT_BODY}-${MAX_REPORT_BODY} caractères)` });
    }

    const settings = await loadStaffPlanSettings();
    const resolved = await resolvePlanMap('', settings);
    if (!resolved.map)
      return res.status(404).json({ error: resolved.error || 'Carte introuvable' });
    const place = await findPlanPlace({
      mapId: resolved.map.id,
      kind: contextType,
      id: contextId,
      surface: STAFF_SURFACE,
      auth: viewer.auth,
    });
    if (!place) return res.status(404).json({ error: 'Lieu introuvable' });

    if (!checkReportCooldown(actor, 'staff_plan_report', REPORT_COOLDOWN_MS)) {
      return res
        .status(429)
        .json({ error: 'Action trop rapide, réessayez dans quelques secondes' });
    }

    const created = await insertContextComment({
      contextType: place.kind,
      contextId: place.id,
      body,
      actor,
    });
    await logAudit(
      'context_comment_create',
      'context_comment',
      created.id,
      `Signalement plan personnels ${place.kind}:${place.id}`,
      {
        req,
        actorUserType: actor.userType,
        actorUserId: actor.userId,
        payload: {
          context_type: place.kind,
          context_id: place.id,
          images_count: 0,
          // Origine du message : le journal est le seul endroit qui distingue un signalement
          // déposé depuis proflyautey d'un commentaire écrit dans la console.
          source: 'staff_plan',
        },
      },
    );
    emitContextCommentsChanged({
      reason: 'comment_created',
      contextType: place.kind,
      contextId: place.id,
      commentId: created.id,
    });
    return res.status(201).json({
      ok: true,
      id: created.id,
      place_label: place.label,
      // Forme d'un élément de `my_reports` : le front l'ajoute à sa liste sans recharger
      // toute la charge du plan.
      report: {
        id: String(created.id),
        context_type: place.kind,
        context_id: place.id,
        body,
        created_at: created.created_at,
        place_status: '',
        place_status_at: null,
        place_label: place.label,
      },
    });
  }),
);

module.exports = router;
module.exports.STAFF_SURFACE = STAFF_SURFACE;
module.exports.STAFF_SETTINGS_PREFIX = STAFF_SETTINGS_PREFIX;
