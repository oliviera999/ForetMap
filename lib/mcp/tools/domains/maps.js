'use strict';

/**
 * `foretmap_maps` — cartes et lieux (lot D3) : zones, repères, catégories, parcours, photos,
 * registre des espèces d'une carte, réglages de carte (géoréférencement, orientation,
 * échelle), inventaire des zones.
 *
 * - Lectures : par l'API (mêmes gardes que l'application : surface, périmètre de cartes,
 *   audience des lieux), sauf `inventory` (vue `v_zone_inventory`, SQL en lecture seule,
 *   permission `zones.manage`).
 * - Écritures : par le pont API — `lib/terrain/locationService.js` (validation de la
 *   géométrie, espèces, catégories, miroir de la visite, temps réel), verrou d'édition
 *   (`expected_revision` → 409), journal d'audit.
 * - Notes et liens d'un lieu sont des champs du `PUT` de la zone ou du repère.
 * - L'historique des zones (`zone_history`) n'existe plus (table retirée) : pas d'action.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');
const { writeRegistry, registryParams } = require('./species');
const { zoneInventory } = require('../../domains/maps');

const TOOL = 'foretmap_maps';

const mapId = z.string().min(1).max(32).describe('Identifiant de carte');
const kind = z.enum(['zone', 'marker']).describe('zone (polygone) ou marker (repère)');
const placeId = z.string().min(1).max(64).describe('Identifiant de la zone ou du repère');
const data = (what) => z.record(z.string(), z.unknown()).describe(what);
const placeData = data(
  'Champs du lieu (comme l’API) — zone : name, points [{ xp, yp } en %] (≥ 3 sommets), color, emoji, description ; repère : label, x_pct, y_pct, emoji, note ; communs : map_id, species_ids, category_ids, notes [{title, body}], links [{label, url}], hidden_surfaces, visible_role_slugs, visible_group_ids, search_aliases, expected_revision',
);

/**
 * Opération des actions « _write » : un seul schéma pour tout l'outil (le schéma publié est
 * commun à toutes les actions) ; chaque action vérifie les opérations qu'elle admet.
 */
const op = z.enum(['add', 'create', 'update', 'delete', 'reorder', 'image', 'georef']);
const imageData = z.string().max(15_000_000);

function assertOp(args, allowed) {
  if (!allowed.includes(args.op)) {
    throw new McpToolError(
      `op « ${args.op} » non admise ici (${allowed.join(', ')})`,
      'MCP_INVALID_ARGS',
    );
  }
}

function placeBase(k) {
  return k === 'zone' ? '/api/zones' : '/api/map/markers';
}

function compactPlace(p, k) {
  const out = { kind: k, id: p.id, map_id: p.map_id };
  out.name = k === 'zone' ? p.name : p.label;
  for (const key of ['emoji', 'edit_revision', 'category_ids', 'x_pct', 'y_pct']) {
    if (p[key] !== undefined) out[key] = p[key];
  }
  if (Array.isArray(p.species)) out.species = p.species.map((s) => s.name || s);
  else if (Array.isArray(p.living_beings)) out.species = p.living_beings;
  if (Array.isArray(p.notes)) out.notes = p.notes.length;
  if (Array.isArray(p.links)) out.links = p.links.length;
  return out;
}

async function listPlaces(ctx, k, map) {
  const res = await api(ctx, 'GET', `${placeBase(k)}${qs({ map_id: map })}`, undefined, {
    tool: TOOL,
  });
  return Array.isArray(res) ? res : res?.items || [];
}

async function getPlace(ctx, k, id, map) {
  if (k === 'zone') return api(ctx, 'GET', `/api/zones/${seg(id)}`, undefined, { tool: TOOL });
  // Pas de lecture unitaire d'un repère : recherche dans la liste de sa carte (ou de toutes).
  const maps = map
    ? [map]
    : ((await api(ctx, 'GET', '/api/maps', undefined, { tool: TOOL })) || []).map((m) => m.id);
  for (const m of maps) {
    const found = (await listPlaces(ctx, 'marker', m)).find((p) => String(p.id) === String(id));
    if (found) return found;
  }
  throw new McpToolError(`Repère ${id} introuvable`, 'MCP_NOT_FOUND');
}

function need(args, keys, op) {
  for (const k of keys) {
    if (args[k] === undefined) throw new McpToolError(`${k} requis pour ${op}`, 'MCP_INVALID_ARGS');
  }
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'maps',
  profile: 'essentiel',
  title: 'Cartes et lieux (zones, repères, catégories, parcours, registre)',
  intro:
    'Cartes et lieux : liste des cartes, zones et repères (création, modification de la géométrie et des coordonnées, notes, liens, photos, suppression), catégories de lieux, parcours, registre des espèces d’une carte, réglages de carte (création, image, géoréférencement, orientation boussole, échelle) et inventaire des espèces par zone.',
  actions: {
    list_maps: {
      summary: 'cartes visibles (avec géoréférencement et réglages)',
      run: (args, ctx) => api(ctx, 'GET', '/api/maps', undefined, { tool: TOOL }),
    },
    places: {
      summary: 'zones et repères d’une carte (forme compacte ; kind pour n’en garder qu’un type)',
      params: { map_id: req(mapId), kind },
      run: async (args, ctx) => {
        const kinds = args.kind ? [args.kind] : ['zone', 'marker'];
        const out = {};
        for (const k of kinds) {
          out[k === 'zone' ? 'zones' : 'markers'] = (await listPlaces(ctx, k, args.map_id)).map(
            (p) => compactPlace(p, k),
          );
        }
        return { map_id: args.map_id, ...out };
      },
    },
    place_get: {
      summary: 'fiche complète d’une zone ou d’un repère (géométrie, espèces, notes, liens…)',
      params: { kind: req(kind), place_id: req(placeId), map_id: mapId },
      run: (args, ctx) => getPlace(ctx, args.kind, args.place_id, args.map_id),
    },
    place_create: {
      summary: 'créer une zone (points) ou un repère (x_pct, y_pct)',
      write: true,
      params: { kind: req(kind), data: req(placeData) },
      run: (args, ctx) => api(ctx, 'POST', placeBase(args.kind), args.data, { tool: TOOL }),
    },
    place_update: {
      summary:
        'modifier une zone ou un repère : géométrie (points) ou coordonnées (x_pct, y_pct), nom, espèces, catégories, notes, liens…',
      write: true,
      params: { kind: req(kind), place_id: req(placeId), data: req(placeData) },
      run: (args, ctx) =>
        api(ctx, 'PUT', `${placeBase(args.kind)}/${seg(args.place_id)}`, args.data, {
          tool: TOOL,
        }),
    },
    place_delete: {
      summary: 'supprimer une zone ou un repère',
      write: true,
      params: { kind: req(kind), place_id: req(placeId) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `${placeBase(args.kind)}/${seg(args.place_id)}`, undefined, {
          tool: TOOL,
        }),
    },
    place_notes: {
      summary: 'remplacer les notes (compléments) et / ou les liens d’un lieu (null pour vider)',
      write: true,
      params: {
        kind: req(kind),
        place_id: req(placeId),
        notes: z
          .union([
            z
              .array(
                z.object({
                  title: z.string().max(200).optional(),
                  body: z.string().min(1).max(5000),
                }),
              )
              .max(30),
            z.null(),
          ])
          .describe('Compléments [{ title, body }]'),
        links: z
          .union([
            z
              .array(z.object({ label: z.string().min(1).max(200), url: z.string().max(2048) }))
              .max(30),
            z.null(),
          ])
          .describe('Liens [{ label, url }]'),
      },
      run: (args, ctx) => {
        const body = {};
        if (args.notes !== undefined) body.notes = args.notes;
        if (args.links !== undefined) body.links = args.links;
        if (!Object.keys(body).length) {
          throw new McpToolError('notes ou links requis', 'MCP_INVALID_ARGS');
        }
        return api(ctx, 'PUT', `${placeBase(args.kind)}/${seg(args.place_id)}`, body, {
          tool: TOOL,
        });
      },
    },
    place_photos: {
      summary: 'photos d’une zone ou d’un repère',
      params: { kind: req(kind), place_id: req(placeId) },
      run: (args, ctx) =>
        api(ctx, 'GET', `${placeBase(args.kind)}/${seg(args.place_id)}/photos`, undefined, {
          tool: TOOL,
        }),
    },
    place_photo_write: {
      summary:
        'photos d’un lieu : op=add (image data URL, légende), delete (photo_id), reorder (photo_ids complets)',
      write: true,
      params: {
        kind: req(kind),
        place_id: req(placeId),
        op: req(op),
        image_data: imageData.describe(
          'Image en data URL (add ; image de fond pour settings_write op=image)',
        ),
        caption: z.string().max(500).describe('Légende (add)'),
        photo_id: z.number().int().positive().describe('Photo (delete)'),
        photo_ids: z
          .array(z.number().int().positive())
          .max(200)
          .describe('Ordre complet (reorder)'),
      },
      run: (args, ctx) => {
        assertOp(args, ['add', 'delete', 'reorder']);
        const base = `${placeBase(args.kind)}/${seg(args.place_id)}/photos`;
        if (args.op === 'add') {
          need(args, ['image_data'], 'add');
          return api(
            ctx,
            'POST',
            base,
            { image_data: args.image_data, caption: args.caption || '' },
            { tool: TOOL },
          );
        }
        if (args.op === 'delete') {
          need(args, ['photo_id'], 'delete');
          return api(ctx, 'DELETE', `${base}/${seg(args.photo_id)}`, undefined, { tool: TOOL });
        }
        need(args, ['photo_ids'], 'reorder');
        return api(ctx, 'PUT', `${base}/reorder`, { photo_ids: args.photo_ids }, { tool: TOOL });
      },
    },
    categories: {
      summary: 'catégories de lieux (désactivées comprises), filtrables par carte',
      params: { map_id: mapId },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/map-categories/manage${qs({ map_id: args.map_id })}`, undefined, {
          tool: TOOL,
        }),
    },
    category_write: {
      summary:
        'catégories : op=create (data), update (category_id + data), delete, reorder (category_ids complets)',
      write: true,
      params: {
        op: req(op),
        category_id: z.union([z.string().max(64), z.number().int()]).describe('Catégorie'),
        data: data(
          'Champs (label, map_id, applies_to, color, emoji, description, slug, sort_order, surfaces, is_infrastructure, is_active, zoom_only, is_distinction, audience…)',
        ),
        category_ids: z
          .array(z.union([z.string().max(64), z.number().int()]))
          .max(500)
          .describe('Ordre complet (reorder)'),
      },
      run: (args, ctx) => {
        assertOp(args, ['create', 'update', 'delete', 'reorder']);
        const base = '/api/map-categories';
        if (args.op === 'reorder') {
          need(args, ['category_ids'], 'reorder');
          return api(
            ctx,
            'PUT',
            `${base}/reorder`,
            { category_ids: args.category_ids },
            { tool: TOOL },
          );
        }
        if (args.op === 'create') {
          need(args, ['data'], 'create');
          return api(ctx, 'POST', base, args.data, { tool: TOOL });
        }
        need(args, ['category_id'], args.op);
        const path = `${base}/${seg(args.category_id)}`;
        if (args.op === 'delete') return api(ctx, 'DELETE', path, undefined, { tool: TOOL });
        need(args, ['data'], 'update');
        return api(ctx, 'PUT', path, args.data, { tool: TOOL });
      },
    },
    routes: {
      summary: 'parcours (brouillons compris), filtrables par carte',
      params: { map_id: mapId },
      run: (args, ctx) =>
        api(ctx, 'GET', `/api/map-routes/manage${qs({ map_id: args.map_id })}`, undefined, {
          tool: TOOL,
        }),
    },
    route_write: {
      summary: 'parcours : op=create (data), update (route_id + data), delete',
      write: true,
      params: {
        op: req(op),
        route_id: z.union([z.string().max(64), z.number().int()]).describe('Parcours'),
        data: data(
          'Champs (title, map_id, slug, description, surfaces, steps [{ target_type: zone|marker, target_id, step_title, step_text }], is_published…)',
        ),
      },
      run: (args, ctx) => {
        assertOp(args, ['create', 'update', 'delete']);
        if (args.op === 'create') {
          need(args, ['data'], 'create');
          return api(ctx, 'POST', '/api/map-routes', args.data, { tool: TOOL });
        }
        need(args, ['route_id'], args.op);
        const path = `/api/map-routes/${seg(args.route_id)}`;
        if (args.op === 'delete') return api(ctx, 'DELETE', path, undefined, { tool: TOOL });
        need(args, ['data'], 'update');
        return api(ctx, 'PUT', path, args.data, { tool: TOOL });
      },
    },
    registry: {
      summary: 'espèces présentes sur la carte, avec leur provenance (registre, zones, repères)',
      params: {
        map_id: req(mapId),
        sources: z.string().max(60).describe('Canaux : registre,zone,repere (défaut tous)'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/maps/${seg(args.map_id)}/species${qs({ sources: args.sources })}`,
          undefined,
          { tool: TOOL },
        ),
    },
    registry_write: {
      summary: 'statut d’une espèce au registre de la carte : présence, certitude, notes de site',
      write: true,
      params: {
        map_id: req(mapId),
        plant_id: req(z.number().int().positive()),
        ...registryParams,
      },
      run: (args, ctx) => writeRegistry(ctx, TOOL, args),
    },
    settings_write: {
      summary:
        'réglages de carte : op=create (data), update (libellé, ordre, marge, active, niveau, catégories par défaut), image (image_data), georef (anchors 3 points, gps_enabled, heading_up_enabled = orientation, scale_compass_enabled = échelle)',
      write: true,
      params: {
        op: req(op),
        map_id: mapId,
        data: data('Champs de la carte (create / update)'),
        image_data: imageData.describe('Image de fond en data URL (op=image)'),
        anchors: z
          .union([
            z
              .array(z.object({ xp: z.number(), yp: z.number(), lat: z.number(), lng: z.number() }))
              .max(3),
            z.null(),
          ])
          .describe('Calage GPS : 3 points { xp, yp (en %), lat, lng } ; [] ou null efface'),
        gps_enabled: z.boolean().describe('Suivi GPS'),
        heading_up_enabled: z.boolean().describe('Orientation boussole (carte tournée)'),
        scale_compass_enabled: z.boolean().describe('Échelle et boussole affichées'),
      },
      run: (args, ctx) => {
        assertOp(args, ['create', 'update', 'image', 'georef']);
        const base = '/api/settings/admin/maps';
        if (args.op === 'create') {
          need(args, ['data'], 'create');
          return api(ctx, 'POST', base, args.data, { tool: TOOL });
        }
        need(args, ['map_id'], args.op);
        const path = `${base}/${seg(args.map_id)}`;
        if (args.op === 'update') {
          need(args, ['data'], 'update');
          return api(ctx, 'PUT', path, args.data, { tool: TOOL });
        }
        if (args.op === 'image') {
          need(args, ['image_data'], 'image');
          return api(ctx, 'POST', `${path}/image`, { image_data: args.image_data }, { tool: TOOL });
        }
        const body = {};
        for (const k of ['anchors', 'gps_enabled', 'heading_up_enabled', 'scale_compass_enabled']) {
          if (args[k] !== undefined) body[k] = args[k];
        }
        return api(ctx, 'PUT', `${path}/georef`, body, { tool: TOOL });
      },
    },
    inventory: {
      summary: 'inventaire des espèces par zone (vue v_zone_inventory)',
      permission: 'zones.manage',
      params: {
        map_id: mapId,
        zone_id: z.string().max(64).describe('Zone'),
        plant_id: z.number().int().positive().describe('Espèce'),
      },
      run: (args) => zoneInventory(args),
    },
  },
});

module.exports = { buildMapsTool: () => tool, compactPlace };
