'use strict';

/**
 * Observations d'espèces validées par un enseignant (migration 307, audit du 25/09/2026 § 3.2.4).
 *
 * HTTP seulement : validation de forme (zod), droits et périmètres, puis
 * `lib/terrain/observationService.js`, qui tient les règles métier et les invariants.
 *
 * - Auteur (compte connecté, hors profil « Visiteur ») : soumet une observation, liste les
 *   siennes, ajoute ou retire ses photos tant qu'elle est soumise, la supprime tant qu'elle
 *   n'est pas validée.
 * - Enseignant (`observations.validate`, admin et n3boss par défaut) : file d'examen par carte
 *   et statut, validation ou refus avec note, rattachement d'une preuve d'interaction.
 *
 * Périmètre : la carte de l'observation doit être dans le périmètre du compte
 * (`lib/mapAccess.js`) ; le lieu choisi doit lui être visible (`lib/locationAudience.js`).
 */

const express = require('express');
const database = require('../database');
const { requireAuth, requirePermission, hasPermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { canAccessMapId, resolveScopedMapFilter, MAP_OUT_OF_SCOPE } = require('../lib/mapAccess');
const { canViewLocation } = require('../lib/locationAudience');
const { loadCategoriesMap, attachCategoriesToEntity } = require('../lib/locationCategories');
const { isParticipationExcludedRole } = require('../lib/shared/visitorRoles');
const { emitObservationsChanged } = require('../lib/realtime');
const { logAudit } = require('../lib/auditLog');
const repo = require('../lib/terrain/observationRepository');
const service = require('../lib/terrain/observationService');
const { requirePedagoModuleOrManager } = require('../lib/pedagoModuleGate');

const router = express.Router();
const VALIDATE_PERMISSION = 'observations.validate';
const requireValidator = requirePermission(VALIDATE_PERMISSION);

// Interrupteur `ui.modules.species_observations_enabled` (décision 19 de l'audit) : éteint →
// 503 pour tous, sauf le validateur, qui garde sa file d'examen.
router.use(
  requirePedagoModuleOrManager('species_observations', 'Observations d’espèces désactivées'),
);

/** Erreur métier → réponse JSON `{ error }` ; le reste part au gestionnaire central (500). */
function handle(fn) {
  return asyncHandler(async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof service.ObservationError) {
        const body = { error: err.message };
        if (err.code) body.code = err.code;
        if (err.code === 'ACCOUNT_DELETED') body.deleted = true;
        return res.status(err.status).json(body);
      }
      throw err;
    }
  });
}

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() }).passthrough();
const photoParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    photoId: z.coerce.number().int().positive(),
  })
  .passthrough();
const photoFileParamsSchema = z.object({ photoId: z.coerce.number().int().positive() });
const evidenceParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  interactionId: z.coerce.number().int().positive(),
});

const optionalIdField = z
  .union([z.string().trim().max(64), z.number()])
  .nullish()
  .transform((v) => (v == null || v === '' ? null : String(v)));

const createBodySchema = z.object({
  client_uuid: z.string().trim().max(64).nullish(),
  map_id: z.string().trim().min(1, 'Carte requise').max(32),
  zone_id: optionalIdField,
  marker_id: optionalIdField,
  plant_id: z.coerce.number().int().positive().nullish(),
  observed_at: z.string().trim().max(32).nullish(),
  detection_mode: z
    .enum(service.DETECTION_MODES, { message: 'Mode de détection inconnu' })
    .nullish(),
  text: z
    .string()
    .max(service.OBSERVATION_TEXT_MAX, {
      message: `Observation : ${service.OBSERVATION_TEXT_MAX} caractères au plus`,
    })
    .nullish(),
  journal_article_id: z.coerce.number().int().positive().nullish(),
});

const photoBodySchema = z.object({ imageData: z.string().min(1, 'Photo manquante') });

const decisionBodySchema = z.object({
  decision: z.enum(service.DECISIONS, { message: 'Décision attendue : validee ou refusee' }),
  plant_id: z.coerce.number().int().positive().nullish(),
  note: z
    .string()
    .max(service.DECISION_NOTE_MAX, {
      message: `Note : ${service.DECISION_NOTE_MAX} caractères au plus`,
    })
    .nullish(),
});

const evidenceBodySchema = z.object({ interaction_id: z.coerce.number().int().positive() });

const reviewQuerySchema = z
  .object({
    map_id: z.unknown().optional(),
    status: z.unknown().optional(),
    limit: z.unknown().optional(),
  })
  .transform((q) => {
    const status = String(q.status || 'soumise').trim();
    const limit = Number.parseInt(String(q.limit || ''), 10);
    return {
      mapId: String(q.map_id || '').trim() || null,
      status: status === 'all' ? null : status,
      limit: Number.isFinite(limit) ? limit : 100,
    };
  });

function authUserId(req) {
  const id = String(req.auth?.userId || '').trim();
  return id || null;
}

function isValidator(req) {
  return hasPermission(req.auth, VALIDATE_PERMISSION);
}

function isOwner(req, observation) {
  const uid = authUserId(req);
  return !!uid && String(observation?.observer_user_id || '') === uid;
}

/** Lieu visible par ce compte (audience propre ou héritée de ses catégories). */
async function isPlaceVisible(auth, kind, id) {
  const row =
    kind === 'zone' ? await repo.getZone(database, id) : await repo.getMarker(database, id);
  if (!row) return false;
  const categories = await loadCategoriesMap(database, kind, [row.id]);
  const entity = attachCategoriesToEntity(row, categories.get(String(row.id)) || []);
  return canViewLocation(entity, auth);
}

/**
 * Charge l'observation et vérifie que l'appelant peut y accéder : son auteur, ou un
 * enseignant validateur dont le périmètre couvre la carte. Répond soi-même en cas de refus.
 * @returns {Promise<object|null>}
 */
async function loadAccessibleObservation(req, res, id) {
  const observation = await service.getObservation(id);
  if (!observation) {
    res.status(404).json({ error: 'Observation introuvable' });
    return null;
  }
  if (isOwner(req, observation)) return observation;
  if (isValidator(req) && (await canAccessMapId(req.auth, observation.map_id))) return observation;
  res.status(404).json({ error: 'Observation introuvable' });
  return null;
}

function emitChanged(reason, observation) {
  if (!observation) return;
  emitObservationsChanged({
    reason,
    observationId: observation.id,
    mapId: observation.map_id,
    status: observation.status,
  });
}

// --- Auteur -------------------------------------------------------------------------------

/** POST /api/species-observations — soumettre une observation (idempotent avec client_uuid). */
router.post(
  '/',
  requireAuth,
  validate({ body: createBodySchema }),
  handle(async (req, res) => {
    if (isParticipationExcludedRole(req.auth)) {
      return res.status(403).json({ error: 'Profil sans droit de signalement' });
    }
    const body = req.body;
    if (!(await canAccessMapId(req.auth, body.map_id))) {
      return res.status(403).json(MAP_OUT_OF_SCOPE);
    }
    if (body.zone_id && !(await isPlaceVisible(req.auth, 'zone', body.zone_id))) {
      return res.status(400).json({ error: 'Zone introuvable sur cette carte' });
    }
    if (body.marker_id && !(await isPlaceVisible(req.auth, 'marker', body.marker_id))) {
      return res.status(400).json({ error: 'Repère introuvable sur cette carte' });
    }
    const { observation, replayed } = await service.recordObservation({
      observerId: authUserId(req),
      mapId: body.map_id,
      zoneId: body.zone_id,
      markerId: body.marker_id,
      plantId: body.plant_id ?? null,
      observedAt: body.observed_at ?? null,
      detectionMode: body.detection_mode ?? null,
      text: body.text ?? null,
      journalArticleId: body.journal_article_id ?? null,
      clientUuid: body.client_uuid ?? null,
    });
    if (replayed) return res.status(200).json({ observation, replayed: true });
    emitChanged('species_observation_created', observation);
    return res.status(201).json({ observation, replayed: false });
  }),
);

/** GET /api/species-observations/me — mes observations (200 au plus, les plus récentes). */
router.get(
  '/me',
  requireAuth,
  handle(async (req, res) => {
    const items = await service.listObservationsForObserver(authUserId(req));
    return res.json({ items });
  }),
);

// --- Enseignant : file d'examen -----------------------------------------------------------

/** GET /api/species-observations/review?map_id=&status=soumise|validee|refusee|all&limit= */
router.get(
  '/review',
  requireValidator,
  validate({ query: reviewQuerySchema }),
  handle(async (req, res) => {
    const { mapId, status, limit } = req.validatedQuery;
    const scope = await resolveScopedMapFilter(req.auth, mapId);
    if (scope.forbidden) return res.status(403).json(MAP_OUT_OF_SCOPE);
    const out = await service.listObservationsForReview({ mapIds: scope.mapIds, status, limit });
    return res.json(out);
  }),
);

// --- Photos -------------------------------------------------------------------------------

/** GET /api/species-observations/photos/:photoId/file — fichier (auteur ou validateur). */
router.get(
  '/photos/:photoId/file',
  requireAuth,
  validate({ params: photoFileParamsSchema }),
  handle(async (req, res) => {
    const photo = await service.getPhotoFile(req.validatedParams.photoId);
    if (!photo) return res.status(404).json({ error: 'Photo introuvable' });
    const observation = await loadAccessibleObservation(req, res, photo.observationId);
    if (!observation) return undefined;
    res.set('Cache-Control', 'private, max-age=300');
    return res.sendFile(photo.absolutePath, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  }),
);

/** POST /api/species-observations/:id/photos — { imageData } (auteur tant que soumise, ou validateur). */
router.post(
  '/:id/photos',
  requireAuth,
  validate({ params: idParamsSchema, body: photoBodySchema }),
  handle(async (req, res) => {
    const observation = await loadAccessibleObservation(req, res, req.validatedParams.id);
    if (!observation) return undefined;
    if (!isValidator(req) && observation.status !== service.OBSERVATION_STATUS.SUBMITTED) {
      return res
        .status(409)
        .json({ error: 'Observation déjà examinée : photos figées', code: 'ALREADY_DECIDED' });
    }
    const photo = await service.addObservationPhoto(observation.id, req.body.imageData);
    emitChanged('species_observation_photo_added', observation);
    return res.status(201).json({ photo });
  }),
);

/** DELETE /api/species-observations/:id/photos/:photoId — fichier et ligne ensemble. */
router.delete(
  '/:id/photos/:photoId',
  requireAuth,
  validate({ params: photoParamsSchema }),
  handle(async (req, res) => {
    const { id, photoId } = req.validatedParams;
    const observation = await loadAccessibleObservation(req, res, id);
    if (!observation) return undefined;
    if (!isValidator(req) && observation.status !== service.OBSERVATION_STATUS.SUBMITTED) {
      return res
        .status(409)
        .json({ error: 'Observation déjà examinée : photos figées', code: 'ALREADY_DECIDED' });
    }
    await service.deleteObservationPhoto(observation.id, photoId);
    emitChanged('species_observation_photo_deleted', observation);
    return res.json({ success: true });
  }),
);

// --- Enseignant : décision et preuves -----------------------------------------------------

/** POST /api/species-observations/:id/decision — { decision, plant_id?, note? } (transaction). */
router.post(
  '/:id/decision',
  requireValidator,
  validate({ params: idParamsSchema, body: decisionBodySchema }),
  handle(async (req, res) => {
    const current = await service.getObservation(req.validatedParams.id);
    if (!current) return res.status(404).json({ error: 'Observation introuvable' });
    if (!(await canAccessMapId(req.auth, current.map_id))) {
      return res.status(403).json(MAP_OUT_OF_SCOPE);
    }
    const result = await service.validateObservation(
      current.id,
      {
        teacherId: authUserId(req),
        decision: req.body.decision,
        plantId: req.body.plant_id ?? null,
        note: req.body.note ?? null,
      },
      { audit: { req } },
    );
    if (!result.alreadyDecided) emitChanged('species_observation_decided', result.observation);
    return res.json({
      observation: result.observation,
      already_decided: result.alreadyDecided,
      map_species: result.mapSpecies,
      interactions_upgraded: result.interactionsUpgraded,
    });
  }),
);

/** GET /api/species-observations/:id/interactions — relations candidates (espèce observée). */
router.get(
  '/:id/interactions',
  requireValidator,
  validate({ params: idParamsSchema }),
  handle(async (req, res) => {
    const observation = await loadAccessibleObservation(req, res, req.validatedParams.id);
    if (!observation) return undefined;
    const { items } = await service.listInteractionCandidates(observation.id);
    return res.json({ items });
  }),
);

/** POST /api/species-observations/:id/interaction-evidence — { interaction_id }. */
router.post(
  '/:id/interaction-evidence',
  requireValidator,
  validate({ params: idParamsSchema, body: evidenceBodySchema }),
  handle(async (req, res) => {
    const observation = await loadAccessibleObservation(req, res, req.validatedParams.id);
    if (!observation) return undefined;
    const out = await service.attachInteractionEvidence(req.body.interaction_id, observation.id, {
      actorId: authUserId(req),
      audit: { req },
    });
    return res.status(out.attached ? 201 : 200).json({
      attached: out.attached,
      evidence_level: out.evidenceLevel,
      upgraded: out.upgraded,
    });
  }),
);

/** DELETE /api/species-observations/:id/interaction-evidence/:interactionId — tant que non validée. */
router.delete(
  '/:id/interaction-evidence/:interactionId',
  requireValidator,
  validate({ params: evidenceParamsSchema }),
  handle(async (req, res) => {
    const { id, interactionId } = req.validatedParams;
    const observation = await loadAccessibleObservation(req, res, id);
    if (!observation) return undefined;
    const out = await service.detachInteractionEvidence(interactionId, observation.id, {
      actorId: authUserId(req),
      audit: { req },
    });
    return res.json(out);
  }),
);

// --- Lecture et suppression d'une observation --------------------------------------------

/** GET /api/species-observations/:id — auteur ou validateur. */
router.get(
  '/:id',
  requireAuth,
  validate({ params: idParamsSchema }),
  handle(async (req, res) => {
    const observation = await loadAccessibleObservation(req, res, req.validatedParams.id);
    if (!observation) return undefined;
    return res.json({ observation });
  }),
);

/** DELETE /api/species-observations/:id — non validée ; auteur ou validateur. */
router.delete(
  '/:id',
  requireAuth,
  validate({ params: idParamsSchema }),
  handle(async (req, res) => {
    const observation = await loadAccessibleObservation(req, res, req.validatedParams.id);
    if (!observation) return undefined;
    await service.deleteObservation(observation.id);
    emitChanged('species_observation_deleted', observation);
    if (!isOwner(req, observation)) {
      await logAudit(
        'delete_species_observation',
        'species_observation',
        observation.id,
        `Suppression de l’observation ${observation.id}`,
        {
          req,
          payload: { observer_user_id: observation.observer_user_id, status: observation.status },
        },
      );
    }
    return res.json({ success: true });
  }),
);

module.exports = router;
module.exports.reviewQuerySchema = reviewQuerySchema;
module.exports.createBodySchema = createBodySchema;
