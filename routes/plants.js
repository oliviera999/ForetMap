const express = require('express');
const { requirePermission, requireAuth } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { loadLearnerLevelForRequest } = require('../lib/pedago/learnerLevel');
const { z, validate } = require('../lib/validate');
const speciesService = require('../lib/biodiv/speciesService');
const { withEditRevision } = require('../lib/editRevision');

/**
 * Routes des fiches espèces (`/api/plants`) — HTTP seulement.
 *
 * Étape B3 de la piste B (audit du 25/09/2026, § 2.2) : la logique vit dans
 * `lib/biodiv/speciesService.js` (validation, revue des dangers, préremplissage, import en
 * transaction, caches) et le SQL dans `lib/biodiv/speciesRepository.js`. Chaque route
 * authentifie, lit ses paramètres, appelle le service et renvoie son `{ status, body }`.
 * Comportement inchangé : `tests/plants-species-characterization.test.js`.
 */

const router = express.Router();

// O7 — `POST /:id/acknowledge-discovery` : remplace la validation manuelle
// `if (!req.body || req.body.confirm !== true) -> 400 'Confirmation explicite requise (confirm: true)'`.
// Le refine est au niveau racine (path vide) pour que `formatZodError` renvoie exactement
// le message d'origine, sans préfixe de chemin. `passthrough()` conserve le corps tel quel et
// le refine reproduit `req.body.confirm !== true` (rejette toute valeur != true booléen).
const acknowledgeDiscoveryBodySchema = z
  .object({
    confirm: z.unknown().optional(),
    // Clé d'idempotence (migration 296) : une observation renvoyée — réponse perdue, file hors
    // ligne rejouée — n'est comptée qu'une fois.
    client_uuid: z
      .string()
      .regex(/^[A-Za-z0-9-]{8,64}$/, 'client_uuid invalide')
      .optional(),
  })
  .passthrough()
  .refine((body) => body && body.confirm === true, {
    message: 'Confirmation explicite requise (confirm: true)',
  });

/** Renvoie le `{ status, body }` d'une opération du service. */
function send(res, result) {
  return res.status(result.status).json(result.body);
}

/** Identifiant de l'utilisateur connecté, ou `null` si le profil est invalide. */
function authUserId(req) {
  const userId = req.auth?.userId;
  return userId == null || userId === '' ? null : userId;
}

/** Identifiants des fiches biodiversité pour lesquelles l’utilisateur connecté a au moins une observation enregistrée. */
router.get('/me/discovered-ids', requireAuth, async (req, res) => {
  try {
    const userId = authUserId(req);
    if (userId == null) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    res.json({ plant_ids: await speciesService.listObservedPlantIds(userId) });
  } catch (e) {
    logRouteError(e, req, 'Liste découvertes biodiversité en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Compteurs d’observations par fiche (moi + tout le site) pour une liste d’identifiants.
 * Query : plant_ids=1,2,3 (max 200, entiers positifs).
 */
router.get('/me/observation-counts', requireAuth, async (req, res) => {
  try {
    const userId = authUserId(req);
    if (userId == null) return res.status(403).json({ error: 'Profil utilisateur invalide' });
    res.json({ counts: await speciesService.observationCounts(userId, req.query.plant_ids) });
  } catch (e) {
    logRouteError(e, req, 'Compteurs observations biodiversité en échec');
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Enregistre une observation (engagement terrain + lecture de fiche) pour une entrée du catalogue plants.
 * Corps JSON : { "confirm": true } (obligatoire), `client_uuid` facultatif (clé d'idempotence :
 * un renvoi de la même clé rejoue la réponse, `replayed: true`, sans nouvelle ligne). Chaque
 * confirmation nouvelle ajoute une ligne (compteur incrémenté).
 */
router.post(
  '/:id/acknowledge-discovery',
  requireAuth,
  validate({ body: acknowledgeDiscoveryBodySchema }),
  async (req, res) => {
    try {
      const userId = authUserId(req);
      if (userId == null) return res.status(403).json({ error: 'Profil utilisateur invalide' });
      const result = await speciesService.recordObservation({
        userId,
        rawPlantId: req.params.id,
        clientUuid: req.body?.client_uuid ? String(req.body.client_uuid) : null,
        loadLearnerLevel: () => loadLearnerLevelForRequest(req),
      });
      send(res, result);
    } catch (e) {
      logRouteError(e, req, 'Accusé découverte espèce en échec');
      if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
        return res.status(503).json({
          error:
            'Observations espèce indisponibles : la base doit être migrée (table user_plant_observation_events). Contactez l’administrateur.',
        });
      }
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },
);

router.post(
  '/:id/photo-upload',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    send(res, await speciesService.uploadPlantPhoto(req.params.id, req.body || {}));
  }),
);

router.post(
  '/import',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    send(res, await speciesService.importPlants(req.body || {}));
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Audit §2.4/§3.7 : SELECT * conservé volontairement. Le front ne refait PAS de GET /plants/:id
    // pour la fiche : la fiche complète, le formulaire d'édition (PlantEditForm) et les vues biodiv
    // (PlantMetaSections, FoodWebView…) sont rendus depuis les lignes de cette liste — toutes les
    // colonnes du catalogue (photos, remarques, écologie…) sont donc consommées. Table sans donnée sensible.
    res.json(await speciesService.listCatalog());
  }),
);

router.get(
  '/:id/interactions',
  asyncHandler(async (req, res) => {
    send(res, await speciesService.getPlantInteractions(req.params.id));
  }),
);

router.get(
  '/:id/glossary-terms',
  asyncHandler(async (req, res) => {
    send(res, await speciesService.getPlantGlossaryTerms(req.params.id));
  }),
);

router.get(
  '/:id/quiz-questions',
  asyncHandler(async (req, res) => {
    send(res, await speciesService.getPlantQuizQuestions(req.params.id));
  }),
);

router.get('/autofill', requirePermission('plants.manage'), async (req, res) => {
  try {
    send(res, await speciesService.autofill(req.query || {}));
  } catch (e) {
    logRouteError(e, req, 'Pré-saisie biodiversité externe en échec');
    res.status(502).json({ error: 'Impossible de récupérer une pré-saisie pour le moment' });
  }
});

/**
 * Identification d’espèce via Pl@ntNet (images) — proxy serveur, clé jamais exposée au client.
 * Corps JSON : { images: [{ organ, imageData }], project?, nbResults?, lang? }
 */
router.post('/plantnet-identify', requirePermission('plants.manage'), async (req, res) => {
  try {
    send(res, await speciesService.plantnetIdentify(req.body));
  } catch (e) {
    logRouteError(e, req, 'Identification Pl@ntNet en échec');
    res.status(502).json({ error: 'Identification Pl@ntNet temporairement indisponible' });
  }
});

/**
 * Proposition GBIF (lecture seule) — le client applique via PUT /api/plants/:id après confirmation.
 */
router.get('/gbif-match', requirePermission('plants.manage'), async (req, res) => {
  try {
    send(res, await speciesService.gbifMatch(req.query?.q));
  } catch (e) {
    logRouteError(e, req, 'Correspondance GBIF en échec');
    res.status(502).json({ error: 'Impossible d’interroger GBIF pour le moment' });
  }
});

router.put(
  '/:id/map-species/:mapId',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    send(
      res,
      await speciesService.updateMapSiteNotes(req.params.id, req.params.mapId, req.body || {}),
    );
  }),
);

/**
 * Valide la relecture des dangers d'une fiche (`hazard_reviewed` + qui, + quand).
 *
 * Permission dédiée `plants.hazards.validate`, distincte de `plants.manage` : renseigner un
 * danger et certifier qu'il a été relu ne sont pas le même geste, et le pré-remplissage
 * bibliographique de la migration 251 arrive précisément non relu. Accordée à l'admin et au
 * prof, pas au prof de classe.
 *
 * Corps optionnel `{ "reviewed": false }` pour retirer la validation (une relecture peut
 * conclure que la fiche est à revoir).
 */
router.post(
  '/:id/validate-hazard',
  requirePermission('plants.hazards.validate'),
  asyncHandler(async (req, res) => {
    const result = await speciesService.validateHazardReview(
      req.params.id,
      {
        reviewed: req.body?.reviewed !== false,
        reviewerId: String(req.auth?.userId || '') || null,
      },
      { req },
    );
    send(res, result);
  }),
);

router.post(
  '/',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    send(res, await speciesService.createPlant(req.body || {}, { req }));
  }),
);

router.put(
  '/:id',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    send(
      res,
      await withEditRevision('plants', req.params.id, req.body || {}, (body) =>
        speciesService.updatePlant(req.params.id, body, { req }),
      ),
    );
  }),
);

router.delete(
  '/:id',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    send(res, await speciesService.deletePlant(req.params.id, { req }));
  }),
);

module.exports = router;
// Exporté pour le test no-DB du contrat de validation O7.
module.exports.acknowledgeDiscoveryBodySchema = acknowledgeDiscoveryBodySchema;
