'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { requirePermission } = require('../middleware/requireTeacher');
const {
  INTERACTION_TYPES,
  EVIDENCE_LEVELS,
  POLLINATION_EFFICACIES,
  makeFoodWebStore,
} = require('../lib/shared/foodWebCore');
const { mapPresenceSubquery, zonePresenceSubquery } = require('../lib/biodiv/presenceService');
const { FOODWEB_ALWAYS_IN_SCOPE_ENTITY_KINDS } = require('../lib/shared/biodivEnums');
const { logAudit } = require('../lib/auditLog');

const router = express.Router();

/**
 * Magasin CRUD ForetMap (plantes) bâti sur le noyau partagé.
 *
 * `quality: true` : seule `species_interactions` porte les colonnes de qualité du lien
 * (migration 272). Le vocabulaire complet — 19 types — est celui de ForetMap ; GL reste aux
 * 14 types communs (cf. `routes/gl/food-web.js`).
 */
const foodWebStore = makeFoodWebStore(
  { queryOne, execute },
  {
    table: 'species_interactions',
    fromCol: 'from_plant_id',
    toCol: 'to_plant_id',
    refTable: 'plants',
    quality: true,
  },
);

/** Recharge une interaction enrichie (noms/emoji) via la vue de lecture. */
async function loadEnrichedInteraction(id) {
  return queryOne(
    `SELECT id, interaction_type, from_id, from_name, from_emoji,
            to_id, to_name, to_emoji, description,
            evidence_level, pollination_efficacy, source_ref
       FROM v_food_web WHERE id = ? LIMIT 1`,
    [id],
  );
}

/** Mappe un résultat du noyau ({ ok, status, error }) vers une réponse HTTP. */
async function respondFromStoreResult(res, result, successStatus) {
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  const enriched = result.row ? await loadEnrichedInteraction(result.row.id) : null;
  return res.status(successStatus).json({ interaction: enriched || result.row });
}

const interactionIdParamsSchema = z.unknown().superRefine((p, ctx) => {
  const id = Number(p == null ? NaN : p.id);
  if (!Number.isInteger(id) || id <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Identifiant invalide', path: [] });
  }
});

function normalizeZoneId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeMapId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

const FOOD_WEB_SELECT = `fw.id, fw.interaction_type, fw.from_id, fw.from_name, fw.from_emoji,
                fw.from_role, fw.to_id, fw.to_name, fw.to_emoji, fw.to_role, fw.description,
                fw.evidence_level, fw.pollination_efficacy, fw.source_ref`;

/**
 * Fiches toujours dans le périmètre (ressources, consortiums, groupes fonctionnels :
 * `FOODWEB_ALWAYS_IN_SCOPE_ENTITY_KINDS`) — jamais rattachées à une carte, comme l'extrémité
 * « environnement ». Sous-requête paramétrée, calculée dans la requête : la vue `v_food_web`
 * n'est pas modifiée.
 */
const ALWAYS_IN_SCOPE_SQL = `(SELECT p.id FROM plants p WHERE p.entity_kind IN (${FOODWEB_ALWAYS_IN_SCOPE_ENTITY_KINDS.map(() => '?').join(', ')}))`;

/**
 * Filtre de périmètre (zone ou carte) pour une relation.
 *
 * Une relation est retenue dès qu'**une** de ses extrémités est dans le
 * périmètre — et non plus les deux. Exiger les deux faisait disparaître toute
 * relation franchissant la limite : une espèce de la zone mangée par un
 * prédateur de la zone voisine n'apparaissait nulle part, ce qui enseigne
 * l'inverse de ce qu'un réseau trophique montre. Les colonnes
 * `from_in_scope` / `to_in_scope` disent à l'interface quelle extrémité est
 * hors périmètre, pour qu'elle la marque au lieu de la masquer.
 *
 * **Une seule notion de périmètre** (chantier collège du 22/11/2026, lot 1) : une extrémité
 * est dans le périmètre si l'espèce y est présente (service de présence), si c'est
 * l'environnement (`to_id` nul) ou si la fiche est une ressource, un consortium ou un groupe
 * fonctionnel. La rétention, elle, exige toujours une espèce présente : une ressource seule ne
 * fait pas entrer dans le réseau d'une carte les liens d'autres lieux.
 */
function scopedFoodWebQuery(inventorySubquery) {
  return `SELECT ${FOOD_WEB_SELECT},
                 (fw.from_id IN ${inventorySubquery} OR fw.from_id IN ${ALWAYS_IN_SCOPE_SQL}) AS from_in_scope,
                 (fw.to_id IS NULL OR fw.to_id IN ${inventorySubquery}
                   OR fw.to_id IN ${ALWAYS_IN_SCOPE_SQL}) AS to_in_scope
            FROM v_food_web fw
           WHERE fw.from_id IN ${inventorySubquery}
              OR fw.to_id IN ${inventorySubquery}
           ORDER BY fw.interaction_type ASC, fw.from_name ASC, fw.to_name ASC`;
}

/**
 * Paramètres de la requête de périmètre, dans l'ordre d'apparition des sous-requêtes :
 * présence puis natures (deux fois, colonnes de périmètre), puis présence (deux fois, filtre).
 */
function scopedFoodWebParams(presence) {
  const kinds = [...FOODWEB_ALWAYS_IN_SCOPE_ENTITY_KINDS];
  return [
    ...presence.params,
    ...kinds,
    ...presence.params,
    ...kinds,
    ...presence.params,
    ...presence.params,
  ];
}

/** `from_in_scope` / `to_in_scope` : 1/0 de MySQL ; l'absence de colonne vaut « dans le périmètre ». */
function readInScope(value) {
  return value == null ? true : Boolean(Number(value));
}

/**
 * Cartes où vivent les espèces données (même définition que le service de présence : registre,
 * zones, repères), en **une** requête — pas de N+1 sur un gros réseau (dayat, ~790 liens).
 * Seules les cartes actives sont citées. Chaque canal joint `maps` : l'union porte sur des
 * colonnes de la même table (aucune collation mêlée).
 *
 * @param {number[]} plantIds
 * @returns {Promise<Map<number, { id: string, label: string }[]>>}
 */
async function loadSpeciesMaps(plantIds) {
  const ids = [...new Set(plantIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const out = new Map();
  if (ids.length === 0) return out;
  const ph = ids.map(() => '?').join(', ');
  const rows = await queryAll(
    `SELECT pr.plant_id, pr.map_id, pr.map_label, pr.sort_order FROM (
        SELECT ms.plant_id, mp.id AS map_id, mp.label AS map_label, mp.sort_order
          FROM map_species ms JOIN maps mp ON mp.id = ms.map_id
         WHERE ms.plant_id IN (${ph}) AND mp.is_active = 1
        UNION
        SELECT zs.plant_id, mp.id, mp.label, mp.sort_order
          FROM zone_species zs JOIN zones z ON z.id = zs.zone_id JOIN maps mp ON mp.id = z.map_id
         WHERE zs.plant_id IN (${ph}) AND mp.is_active = 1
        UNION
        SELECT mk.plant_id, mp.id, mp.label, mp.sort_order
          FROM marker_species mk JOIN map_markers m ON m.id = mk.marker_id
          JOIN maps mp ON mp.id = m.map_id
         WHERE mk.plant_id IN (${ph}) AND mp.is_active = 1
      ) pr
      ORDER BY pr.plant_id ASC, pr.sort_order ASC, pr.map_label ASC`,
    [...ids, ...ids, ...ids],
  );
  for (const row of rows) {
    const key = Number(row.plant_id);
    if (!out.has(key)) out.set(key, []);
    const list = out.get(key);
    if (!list.some((m) => m.id === String(row.map_id))) {
      list.push({
        id: String(row.map_id),
        label: row.map_label == null ? '' : String(row.map_label),
      });
    }
  }
  return out;
}

/**
 * Ajoute `from_elsewhere` / `to_elsewhere` à chaque ligne d'un réseau cadré : pour une
 * extrémité hors périmètre, les cartes (id, libellé) où l'espèce est présente — liste vide si
 * elle n'est rattachée à aucune carte ; pour une extrémité dans le périmètre, liste vide.
 * L'interface en tire la mention « vit ailleurs : … » du nœud grisé.
 */
async function attachElsewhere(items) {
  const outside = [];
  for (const row of items) {
    if (!readInScope(row.from_in_scope)) outside.push(row.from_id);
    if (row.to_id != null && !readInScope(row.to_in_scope)) outside.push(row.to_id);
  }
  const byPlant = await loadSpeciesMaps(outside);
  const mapsOf = (id, inScope) => (inScope ? [] : byPlant.get(Number(id)) || []);
  return items.map((row) => ({
    ...row,
    from_elsewhere: mapsOf(row.from_id, readInScope(row.from_in_scope)),
    to_elsewhere: row.to_id == null ? [] : mapsOf(row.to_id, readInScope(row.to_in_scope)),
  }));
}

/** GET /api/food-web?mapId=&zoneId= */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const zoneId = normalizeZoneId(req.query?.zoneId);
    const mapId = normalizeMapId(req.query?.mapId);

    if (zoneId) {
      const zone = await queryOne('SELECT id FROM zones WHERE id = ? LIMIT 1', [zoneId]);
      if (!zone) return res.status(404).json({ error: 'Zone introuvable' });

      // Espèces de la zone : même définition que le service de présence (jonction de zone),
      // identique à la vue historique `v_zone_inventory`.
      const inv = zonePresenceSubquery(zoneId);
      const rows = await queryAll(scopedFoodWebQuery(inv.sql), scopedFoodWebParams(inv));
      return res.json({ zoneId, items: await attachElsewhere(rows) });
    }

    if (mapId) {
      const map = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
      if (!map) return res.status(404).json({ error: 'Carte introuvable' });

      // Espèces présentes sur la carte : définition commune (registre, zones, repères —
      // `lib/biodiv/presenceService.js`), la même que le catalogue et les groupes emboîtés.
      const inv = mapPresenceSubquery(mapId);
      const rows = await queryAll(scopedFoodWebQuery(inv.sql), scopedFoodWebParams(inv));
      return res.json({ mapId, items: await attachElsewhere(rows) });
    }

    const items = await queryAll(
      `SELECT id, interaction_type, from_id, from_name, from_emoji, from_role,
              to_id, to_name, to_emoji, to_role, description,
              evidence_level, pollination_efficacy, source_ref
         FROM v_food_web
        ORDER BY interaction_type ASC, from_name ASC, to_name ASC`,
    );
    return res.json({ items });
  }),
);

const plantIdParamsSchema = z.unknown().superRefine((p, ctx) => {
  const id = Number(p == null ? NaN : p.id);
  if (!Number.isInteger(id) || id <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Identifiant invalide', path: [] });
  }
});

/**
 * GET /api/food-web/species/:id/maps — cartes actives où l'espèce est présente (registre,
 * zones, repères). Sert à « Voir le réseau trophique » depuis une fiche : ouvrir une carte où
 * l'espèce vit (chantier collège du 22/11/2026, lot 3).
 */
router.get(
  '/species/:id/maps',
  validate({ params: plantIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const plantId = Number(req.params.id);
    const plant = await queryOne('SELECT id FROM plants WHERE id = ? LIMIT 1', [plantId]);
    if (!plant) return res.status(404).json({ error: 'Espèce introuvable' });
    const byPlant = await loadSpeciesMaps([plantId]);
    return res.json({ plantId, maps: byPlant.get(plantId) || [] });
  }),
);

/** GET /api/food-web/interactions/:id/glossary */
router.get(
  '/interactions/:id/glossary',
  validate({ params: interactionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const interactionId = Number(req.params.id);
    if (!Number.isInteger(interactionId) || interactionId <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }

    const interaction = await queryOne('SELECT id FROM species_interactions WHERE id = ? LIMIT 1', [
      interactionId,
    ]);
    if (!interaction) return res.status(404).json({ error: 'Interaction introuvable' });

    const terms = await queryAll(
      `SELECT g.glossary_code, g.terme, g.variantes, g.categorie, g.niveau, g.definition_courte
         FROM glossary_term_interactions gti
         JOIN glossary_terms g ON g.glossary_code = gti.glossary_code
        WHERE gti.interaction_id = ? AND g.statut = 'actif'
        ORDER BY g.terme ASC`,
      [interactionId],
    );

    return res.json({ interactionId, terms });
  }),
);

/**
 * GET /api/food-web/interaction-types — vocabulaire de l'éditeur.
 * Les listes de qualité du lien voyagent avec les types : l'éditeur a besoin des trois.
 */
router.get('/interaction-types', (req, res) => {
  res.json({
    types: INTERACTION_TYPES,
    evidenceLevels: EVIDENCE_LEVELS,
    pollinationEfficacies: POLLINATION_EFFICACIES,
  });
});

/** POST /api/food-web/interactions — créer une interaction (admin biodiversité). */
router.post(
  '/interactions',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.create(req.body || {});
    if (result.ok && result.row?.id) {
      await logAudit(
        'food_web_create',
        'species_interaction',
        result.row.id,
        result.row.interaction_type || 'interaction',
        { req, payload: { from_id: result.row.from_id, to_id: result.row.to_id } },
      );
    }
    return respondFromStoreResult(res, result, 201);
  }),
);

/** PUT /api/food-web/interactions/:id — modifier une interaction. */
router.put(
  '/interactions/:id',
  requirePermission('plants.manage'),
  validate({ params: interactionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.update(Number(req.params.id), req.body || {});
    if (result.ok) {
      await logAudit(
        'food_web_update',
        'species_interaction',
        Number(req.params.id),
        result.row?.interaction_type || 'interaction',
        { req },
      );
    }
    return respondFromStoreResult(res, result, 200);
  }),
);

/** DELETE /api/food-web/interactions/:id — supprimer une interaction. */
router.delete(
  '/interactions/:id',
  requirePermission('plants.manage'),
  validate({ params: interactionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.remove(Number(req.params.id));
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    await logAudit(
      'food_web_delete',
      'species_interaction',
      Number(req.params.id),
      'Suppression interaction trophique',
      { req },
    );
    return res.json({ success: true });
  }),
);

module.exports = router;
