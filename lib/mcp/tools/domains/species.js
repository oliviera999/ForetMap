'use strict';

/**
 * `foretmap_species` — les fiches espèces du catalogue (lot D3, « vivant et lieux »).
 *
 * - Lectures : par l'API (`GET /api/plants`, catalogue complet enrichi), filtrées ensuite ;
 *   `gbif_match` et `autofill_preview` interrogent les sources externes **sans rien écrire**.
 * - Écritures : toutes par le pont API, donc avec la logique du service des fiches
 *   (`lib/biodiv/speciesService.js`) : transaction des tables liées (photos, autres noms,
 *   sosies), remise « à relire » des dangers quand ils changent, verrou d'édition
 *   (`expected_revision` → 409), caches et temps réel, journal d'audit.
 * - Photos : l'ajout depuis une URL passe par la pré-saisie (`POST …/photos/propose`, photo
 *   « à confirmer »), la confirmation par sa route ; crédits, ordre et retrait réécrivent la
 *   liste `photos` de la fiche par `PUT /api/plants/:id` (seule route qui les porte), avec la
 *   révision lue juste avant — une édition concurrente est refusée, jamais écrasée.
 * - Registre d'une carte (`registry_status`) : `PATCH /api/plants/:id/map-species/:mapId`
 *   (présence, certitude) et `PUT` du même chemin (notes de site).
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');

const TOOL = 'foretmap_species';

const plantId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]);
const mapId = z.string().min(1).max(32).describe('Identifiant de carte');
/** Texte cherché : même schéma pour toutes les actions (schéma publié commun). */
const text = z.string().max(200);
const data = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs de la fiche (comme l’API : name, emoji, scientific_name, description, trophic_role, habitat_type, life_cycle, origin_status, iucn_status, toxicity_level, hazard_exposure, health_risk, is_edible, map_ids, secondary_names, lookalikes, photos, remarks…) ; expected_revision possible',
  );

const PHOTO_KINDS = [
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];
const PRESENCE_STATUSES = [
  'resident',
  'nicheur_migrateur',
  'hivernant',
  'passage',
  'erratique',
  'introduit',
  'veille',
];
const VALIDATION_STATUSES = ['confirme_site', 'attendu', 'a_confirmer', 'documentaire'];

/** Paramètres de l'écriture au registre d'une carte (partagés avec `foretmap_maps`). */
const registryParams = {
  presence_status: z
    .union([z.enum(PRESENCE_STATUSES), z.null()])
    .describe('Statut de présence sur la carte (null pour effacer)'),
  validation_status: z.enum(VALIDATION_STATUSES).describe('Certitude de la présence'),
  site_notes: z
    .union([z.string().max(5000), z.null()])
    .describe('Notes propres au site (crée la ligne du registre si absente)'),
  allow_downgrade: z
    .boolean()
    .describe('Autorise à quitter « confirme_site » (exige plants.manage)'),
};

/**
 * Écrit au registre `map_species` : statut par la route PATCH (ligne existante), notes de
 * site par la route PUT. Renvoie l'état final de la ligne.
 */
async function writeRegistry(ctx, tool, args) {
  const path = `/api/plants/${seg(args.plant_id)}/map-species/${seg(args.map_id)}`;
  const status = {};
  for (const k of ['presence_status', 'validation_status', 'allow_downgrade']) {
    if (args[k] !== undefined) status[k] = args[k];
  }
  const touchesStatus =
    status.presence_status !== undefined || status.validation_status !== undefined;
  if (!touchesStatus && args.site_notes === undefined) {
    throw new McpToolError(
      'Rien à écrire : presence_status, validation_status ou site_notes requis',
      'MCP_INVALID_ARGS',
    );
  }
  const out = {};
  if (args.site_notes !== undefined) {
    out.site_notes = await api(ctx, 'PUT', path, { site_notes: args.site_notes }, { tool });
  }
  if (touchesStatus) out.registry = await api(ctx, 'PATCH', path, status, { tool });
  return out;
}

/** Catalogue complet (route publique, mise en cache 20 s côté serveur). */
async function loadCatalog(ctx) {
  const rows = await api(ctx, 'GET', '/api/plants', undefined, { tool: TOOL });
  return Array.isArray(rows) ? rows : [];
}

async function loadPlant(ctx, id) {
  const plant = (await loadCatalog(ctx)).find((p) => String(p.id) === String(id));
  if (!plant) throw new McpToolError(`Fiche ${id} introuvable`, 'MCP_NOT_FOUND');
  return plant;
}

function compactPlant(p) {
  return {
    id: p.id,
    name: p.name,
    emoji: p.emoji || null,
    scientific_name: p.scientific_name || null,
    secondary_names: p.secondary_names || [],
    taxon_group: p.taxon_group || null,
    trophic_role: p.trophic_role || null,
    toxicity_level: p.toxicity_level || null,
    hazard_reviewed: p.hazard_reviewed == null ? null : !!Number(p.hazard_reviewed),
    map_ids: p.map_ids || [],
    photos: Array.isArray(p.photos) ? p.photos.length : 0,
  };
}

/** Photo de la fiche désignée par son identifiant ou par son lien. */
function findPhoto(photos, ref) {
  const s = String(ref);
  const found = /^\d+$/.test(s)
    ? photos.find((p) => p.id != null && String(p.id) === s)
    : photos.find((p) => p.url === s);
  if (!found) throw new McpToolError(`Photo ${s} introuvable sur la fiche`, 'MCP_NOT_FOUND');
  return found;
}

/** Ligne envoyée au `PUT` (attribution et statut « à confirmer » conservés). */
function photoForPut(p) {
  return {
    id: p.id ?? undefined,
    kind: p.kind,
    url: p.url,
    credit: p.credit ?? null,
    licence: p.licence ?? null,
    source: p.source ?? null,
    source_url: p.source_url ?? null,
    confirmed: p.confirmed !== false,
  };
}

/** Crédits, ordre, retrait : la liste complète réécrite à la révision lue. */
async function rewritePhotos(ctx, plant, transform) {
  const current = (Array.isArray(plant.photos) ? plant.photos : []).map(photoForPut);
  const next = transform(current);
  const body = { photos: next };
  if (Number.isInteger(Number(plant.edit_revision))) {
    body.expected_revision = Number(plant.edit_revision);
  }
  const updated = await api(ctx, 'PUT', `/api/plants/${seg(plant.id)}`, body, { tool: TOOL });
  return { plant_id: plant.id, photos: updated?.photos || [] };
}

async function photosAction(args, ctx) {
  const id = args.plant_id;
  switch (args.op) {
    case 'add_url': {
      if (!args.photos?.length)
        throw new McpToolError('photos requis pour add_url', 'MCP_INVALID_ARGS');
      const res = await api(
        ctx,
        'POST',
        `/api/plants/${seg(id)}/photos/propose`,
        { photos: args.photos },
        { tool: TOOL },
      );
      return { inserted: res?.inserted ?? 0, photos: res?.photos || [] };
    }
    case 'upload': {
      if (!args.image_data || !args.kind) {
        throw new McpToolError('kind et image_data requis pour upload', 'MCP_INVALID_ARGS');
      }
      const res = await api(
        ctx,
        'POST',
        `/api/plants/${seg(id)}/photo-upload`,
        { field: args.kind, imageData: args.image_data, position: args.position || 'append' },
        { tool: TOOL },
      );
      return { url: res?.url, photos: res?.photos || [] };
    }
    case 'confirm': {
      const plant = await loadPlant(ctx, id);
      const photo = findPhoto(plant.photos || [], args.photo_id);
      if (photo.id == null) {
        throw new McpToolError(
          'Photo sans identifiant : confirmation impossible',
          'MCP_INVALID_ARGS',
        );
      }
      const res = await api(
        ctx,
        'POST',
        `/api/plants/${seg(id)}/photos/${seg(photo.id)}/confirm`,
        {},
        { tool: TOOL },
      );
      return { photo: res?.photo, photos: res?.photos || [] };
    }
    case 'set_credit': {
      const plant = await loadPlant(ctx, id);
      const target = findPhoto(plant.photos || [], args.photo_id);
      return rewritePhotos(ctx, plant, (list) =>
        list.map((p) =>
          p.kind === target.kind && p.url === target.url
            ? {
                ...p,
                credit: args.credit !== undefined ? args.credit : p.credit,
                licence: args.licence !== undefined ? args.licence : p.licence,
                source_url: args.source_url !== undefined ? args.source_url : p.source_url,
              }
            : p,
        ),
      );
    }
    case 'reorder': {
      if (!args.kind || !args.photo_ids?.length) {
        throw new McpToolError('kind et photo_ids requis pour reorder', 'MCP_INVALID_ARGS');
      }
      const plant = await loadPlant(ctx, id);
      const ofKind = (plant.photos || []).filter((p) => p.kind === args.kind);
      const ordered = args.photo_ids.map((ref) => findPhoto(ofKind, ref));
      if (new Set(ordered.map((p) => p.url)).size !== ofKind.length) {
        throw new McpToolError(
          `photo_ids doit lister exactement les ${ofKind.length} photo(s) de « ${args.kind} »`,
          'MCP_INVALID_ARGS',
        );
      }
      return rewritePhotos(ctx, plant, (list) => [
        ...list.filter((p) => p.kind !== args.kind),
        ...ordered.map(photoForPut),
      ]);
    }
    case 'remove': {
      const plant = await loadPlant(ctx, id);
      const target = findPhoto(plant.photos || [], args.photo_id);
      return rewritePhotos(ctx, plant, (list) =>
        list.filter((p) => !(p.kind === target.kind && p.url === target.url)),
      );
    }
    default:
      throw new McpToolError(`Opération photo inconnue : ${args.op}`, 'MCP_INVALID_ARGS');
  }
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'species',
  profile: 'essentiel',
  title: 'Fiches espèces (catalogue, photos, dangers, registre des cartes)',
  intro:
    'Catalogue des espèces (plantes, animaux, champignons) : liste filtrée, fiche complète, création, modification, suppression, autres noms, sosies, photos (ajout par lien, téléversement, confirmation, crédits, ordre, retrait), relecture des dangers, correspondance GBIF, pré-saisie externe sans écriture, et statut de l’espèce au registre d’une carte.',
  actions: {
    list: {
      summary: 'liste filtrée (texte, carte, rôle trophique, dangers non relus)',
      params: {
        q: text.describe('Texte cherché (nom, nom scientifique, autres noms)'),
        map_id: mapId,
        trophic_role: z.string().max(32).describe('Rôle trophique'),
        hazard_unreviewed: z.boolean().describe('Seulement les fiches à danger non relu'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const q = args.q ? args.q.toLowerCase() : null;
        const rows = (await loadCatalog(ctx)).filter((p) => {
          if (args.map_id && !(p.map_ids || []).map(String).includes(args.map_id)) return false;
          if (args.trophic_role && p.trophic_role !== args.trophic_role) return false;
          if (args.hazard_unreviewed) {
            const hazardous = p.toxicity_level && p.toxicity_level !== 'aucune';
            if (!hazardous || Number(p.hazard_reviewed)) return false;
          }
          if (q) {
            const hay = [p.name, p.scientific_name, ...(p.secondary_names || [])]
              .join(' ')
              .toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        const p = pageOf(args, ctx);
        return paged(rows.slice(p.offset, p.offset + p.limit).map(compactPlant), p, {
          total: rows.length,
        });
      },
    },
    get: {
      summary: 'fiche complète (photos, autres noms, sosies, cartes, notes de site, révision)',
      params: { plant_id: req(plantId) },
      run: (args, ctx) => loadPlant(ctx, args.plant_id),
    },
    create: {
      summary: 'créer une fiche (map_ids pour la rattacher aux cartes)',
      write: true,
      params: { data: req(data) },
      run: (args, ctx) => api(ctx, 'POST', '/api/plants', args.data, { tool: TOOL }),
    },
    update: {
      summary: 'modifier une fiche (champs absents conservés ; danger modifié → à relire)',
      write: true,
      params: { plant_id: req(plantId), data: req(data) },
      run: (args, ctx) =>
        api(ctx, 'PUT', `/api/plants/${seg(args.plant_id)}`, args.data, { tool: TOOL }),
    },
    delete: {
      summary: 'supprimer une fiche (liens, registre et photos téléversées compris)',
      write: true,
      params: { plant_id: req(plantId) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/plants/${seg(args.plant_id)}`, undefined, { tool: TOOL }),
    },
    aliases: {
      summary: 'remplacer les autres noms (noms vernaculaires, synonymes)',
      write: true,
      params: {
        plant_id: req(plantId),
        names: req(z.array(z.string().min(1).max(255)).max(50).describe('Autres noms')),
      },
      run: async (args, ctx) => {
        const res = await api(
          ctx,
          'PUT',
          `/api/plants/${seg(args.plant_id)}`,
          { secondary_names: args.names },
          { tool: TOOL },
        );
        return {
          plant_id: res?.id,
          secondary_names: res?.secondary_names || [],
          conflicts: res?.secondary_name_conflicts || [],
        };
      },
    },
    lookalikes: {
      summary: 'remplacer les sosies (« ne pas confondre avec », fiche à fiche, avec le critère)',
      write: true,
      params: {
        plant_id: req(plantId),
        lookalikes: req(
          z
            .array(z.object({ plant_id: plantId, note: z.string().max(500).optional() }))
            .max(20)
            .describe('Sosies [{ plant_id, note }] (liste vide pour tout retirer)'),
        ),
      },
      run: async (args, ctx) => {
        const res = await api(
          ctx,
          'PUT',
          `/api/plants/${seg(args.plant_id)}`,
          { lookalikes: args.lookalikes },
          { tool: TOOL },
        );
        return { plant_id: res?.id, lookalikes: res?.lookalikes || [] };
      },
    },
    photos: {
      summary:
        'photos : op=add_url (lien HTTPS, « à confirmer »), upload (data URL), confirm, set_credit (auteur, licence, page source), reorder (ordre d’un emplacement), remove',
      write: true,
      params: {
        plant_id: req(plantId),
        op: req(z.enum(['add_url', 'upload', 'confirm', 'set_credit', 'reorder', 'remove'])),
        photos: z
          .array(
            z.object({
              kind: z.enum(PHOTO_KINDS),
              url: z.string().url().max(1024),
              credit: z.string().max(255).optional(),
              licence: z.string().max(64).optional(),
              source_url: z.string().url().max(1024).optional(),
            }),
          )
          .max(20)
          .describe('Photos à ajouter par lien (add_url)'),
        kind: z.enum(PHOTO_KINDS).describe('Emplacement photo (upload, reorder)'),
        image_data: z.string().max(8_000_000).describe('Image en data URL (upload)'),
        position: z.enum(['append', 'prepend']).describe('Position du téléversement'),
        photo_id: z
          .union([z.number().int().positive(), z.string().max(1024)])
          .describe('Photo visée : identifiant ou lien (confirm, set_credit, remove)'),
        photo_ids: z
          .array(z.union([z.number().int().positive(), z.string().max(1024)]))
          .max(60)
          .describe('Nouvel ordre complet des photos de l’emplacement (reorder)'),
        credit: z.union([z.string().max(255), z.null()]).describe('Auteur (set_credit)'),
        licence: z.union([z.string().max(64), z.null()]).describe('Licence (set_credit)'),
        source_url: z.union([z.string().max(1024), z.null()]).describe('Page source HTTPS'),
      },
      run: photosAction,
    },
    hazard_review: {
      summary: 'valider (ou retirer, reviewed=false) la relecture des dangers',
      write: true,
      permission: 'plants.hazards.validate',
      params: { plant_id: req(plantId), reviewed: z.boolean().describe('Défaut true') },
      run: async (args, ctx) => {
        const res = await api(
          ctx,
          'POST',
          `/api/plants/${seg(args.plant_id)}/validate-hazard`,
          { reviewed: args.reviewed !== false },
          { tool: TOOL },
        );
        return {
          plant_id: res?.id,
          toxicity_level: res?.toxicity_level ?? null,
          hazard_reviewed: !!Number(res?.hazard_reviewed),
          hazard_reviewed_at: res?.hazard_reviewed_at ?? null,
        };
      },
    },
    gbif_match: {
      summary: 'proposition de correspondance GBIF pour un nom (lecture seule)',
      params: { q: req(text.describe('Nom à rapprocher (2 à 120 caractères)')) },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/plants/gbif-match${qs({ q: args.q })}`, undefined, { tool: TOOL }),
    },
    autofill_preview: {
      summary: 'pré-saisie multi-sources d’une fiche (aperçu, rien n’est écrit)',
      params: {
        q: req(text.describe('Nom cherché (2 à 120 caractères)')),
        hint_scientific: z.string().max(120).describe('Nom scientifique connu'),
        hint_name: z.string().max(120).describe('Nom commun connu'),
        sources: z.string().max(200).describe('Sources autorisées, séparées par des virgules'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/plants/autofill${qs({
            q: args.q,
            hint_scientific: args.hint_scientific,
            hint_name: args.hint_name,
            sources: args.sources,
          })}`,
          undefined,
          { tool: TOOL },
        ),
    },
    registry_status: {
      summary:
        'statut de l’espèce au registre d’une carte : présence, certitude (ligne existante), notes de site',
      write: true,
      params: { plant_id: req(plantId), map_id: req(mapId), ...registryParams },
      run: (args, ctx) => writeRegistry(ctx, TOOL, args),
    },
  },
});

module.exports = { buildSpeciesTool: () => tool, writeRegistry, registryParams, compactPlant };
