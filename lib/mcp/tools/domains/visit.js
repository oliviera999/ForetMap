'use strict';

/**
 * `foretmap_visit` — la Visite publique : contenus éditoriaux des zones et repères de visite,
 * médias, tutoriels mis en avant, couverture de la carte, packs de mascottes (lecture) — lot D3.
 *
 * Tout passe par l'API `/api/visit/*` (permission `visit.manage` pour l'écriture) : la route
 * valide le polygone, l'audience, les blocs éditoriaux, les notes réservées, invalide le cache
 * de la Visite et journalise. `coverage` compose deux lectures de l'API (options de
 * synchronisation et contenu publié) : aucune requête SQL propre.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');

const TOOL = 'foretmap_visit';

const mapId = z.string().min(1).max(32).describe('Identifiant de carte');
const kind = z.enum(['zone', 'marker']).describe('zone ou marker (repère)');
const visitData = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs de visite (comme l’API) : map_id, name / label, points ou x_pct / y_pct, emoji, subtitle, short_description, details_title, details_text, visit_editorial_blocks, sort_order, is_active, visible_role_slugs, visible_group_ids, restricted_note…',
  );

/**
 * Opération des actions « _write » : un seul schéma pour tout l'outil (le schéma publié est
 * commun à toutes les actions) ; chaque action vérifie les opérations qu'elle admet.
 */
const op = z.enum(['add', 'create', 'update', 'delete', 'reorder']);

function assertOp(args, allowed) {
  if (!allowed.includes(args.op)) {
    throw new McpToolError(
      `op « ${args.op} » non admise ici (${allowed.join(', ')})`,
      'MCP_INVALID_ARGS',
    );
  }
}

function hasText(p) {
  return [p.visit_short_description, p.visit_details_text, p.visit_subtitle].some(
    (v) => typeof v === 'string' && v.trim() !== '',
  );
}

function compactVisitPlace(p, k) {
  return {
    kind: k,
    id: p.id,
    name: k === 'zone' ? p.name : p.label,
    subtitle: p.visit_subtitle || null,
    short_description: p.visit_short_description || null,
    has_details: !!(p.visit_details_text && String(p.visit_details_text).trim()),
    media: Array.isArray(p.visit_media) ? p.visit_media.length : 0,
    sort_order: p.visit_sort_order ?? null,
  };
}

async function loadContent(ctx, map) {
  return api(ctx, 'GET', `/api/visit/content${qs({ map_id: map })}`, undefined, { tool: TOOL });
}

function coverageOf(mapPlaces, visitPlaces, published, label) {
  const visitIds = new Set(visitPlaces.map((p) => String(p.id)));
  const publishedById = new Map(published.map((p) => [String(p.id), p]));
  const missing = mapPlaces.filter((p) => !visitIds.has(String(p.id)));
  const withoutText = visitPlaces.filter((p) => {
    const pub = publishedById.get(String(p.id));
    return !pub || !hasText(pub);
  });
  return {
    map_total: mapPlaces.length,
    in_visit: visitPlaces.length,
    published_with_text: published.filter(hasText).length,
    with_media: published.filter((p) => (p.visit_media || []).length > 0).length,
    coverage_percent: mapPlaces.length
      ? Math.round((published.filter(hasText).length * 1000) / mapPlaces.length) / 10
      : null,
    missing_from_visit: missing.map((p) => ({ id: p.id, name: p[label] })),
    without_text: withoutText.map((p) => ({ id: p.id, name: p[label] })),
  };
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'visit',
  title: 'Visite publique (contenus, médias, couverture, mascottes)',
  intro:
    'Visite publique d’une carte : contenu publié (zones, repères, médias, tutoriels, parcours), couverture éditoriale (lieux sans fiche de visite ou sans texte), statistiques de fréquentation agrégées, édition des fiches de visite et de leurs médias, tutoriels mis en avant, packs de mascottes en lecture.',
  actions: {
    content: {
      summary: 'contenu publié de la Visite (forme compacte, ou complet avec full=true)',
      params: { map_id: mapId, full: z.boolean().describe('Contenu complet de l’API') },
      run: async (args, ctx) => {
        const c = await loadContent(ctx, args.map_id);
        if (args.full) return c;
        return {
          map_id: c?.map_id,
          zones: (c?.zones || []).map((p) => compactVisitPlace(p, 'zone')),
          markers: (c?.markers || []).map((p) => compactVisitPlace(p, 'marker')),
          tutorials: (c?.tutorials || []).map((t) => ({ id: t.id, title: t.title })),
          routes: (c?.routes || []).map((r) => ({ id: r.id, title: r.title, slug: r.slug })),
          mascot_packs: (c?.mascot_packs || []).map((m) => ({
            catalog_id: m.catalog_id,
            label: m.label,
          })),
          site_species_summary: c?.site_species_summary ?? null,
        };
      },
    },
    coverage: {
      summary: 'couverture : lieux de la carte sans fiche de visite, fiches sans texte, médias',
      params: { map_id: req(mapId) },
      run: async (args, ctx) => {
        const opts = await api(
          ctx,
          'GET',
          `/api/visit/sync/options${qs({ map_id: args.map_id })}`,
          undefined,
          { tool: TOOL },
        );
        const content = await loadContent(ctx, args.map_id);
        const src = opts?.source || {};
        return {
          map_id: opts?.map_id || args.map_id,
          zones: coverageOf(
            src.map?.zones || [],
            src.visit?.zones || [],
            content?.zones || [],
            'name',
          ),
          markers: coverageOf(
            src.map?.markers || [],
            src.visit?.markers || [],
            content?.markers || [],
            'label',
          ),
        };
      },
    },
    stats: {
      summary: 'fréquentation agrégée de la Visite (sessions, lieux vus, visites complètes)',
      permission: 'stats.read.all',
      run: (args, ctx) => api(ctx, 'GET', '/api/visit/stats', undefined, { tool: TOOL }),
    },
    place_write: {
      summary:
        'fiche de visite d’une zone ou d’un repère : op=create (data), update (id + data), delete',
      write: true,
      params: {
        kind: req(kind),
        op: req(op),
        place_id: z.string().max(64).describe('Identifiant (celui du lieu de la carte)'),
        data: visitData,
      },
      run: (args, ctx) => {
        assertOp(args, ['create', 'update', 'delete']);
        const base = args.kind === 'zone' ? '/api/visit/zones' : '/api/visit/markers';
        if (args.op === 'create') {
          if (!args.data) throw new McpToolError('data requis pour create', 'MCP_INVALID_ARGS');
          return api(ctx, 'POST', base, args.data, { tool: TOOL });
        }
        if (!args.place_id) {
          throw new McpToolError(`place_id requis pour ${args.op}`, 'MCP_INVALID_ARGS');
        }
        const path = `${base}/${seg(args.place_id)}`;
        if (args.op === 'delete') return api(ctx, 'DELETE', path, undefined, { tool: TOOL });
        if (!args.data) throw new McpToolError('data requis pour update', 'MCP_INVALID_ARGS');
        return api(ctx, 'PUT', path, args.data, { tool: TOOL });
      },
    },
    media_write: {
      summary:
        'médias de visite : op=add (cible + image_url ou image_data, légende), update (media_id), delete, reorder (ordered_ids complets de la cible)',
      write: true,
      params: {
        op: req(op),
        target_type: kind,
        target_id: z.string().max(64).describe('Zone ou repère de visite'),
        media_id: z.number().int().positive().describe('Média (update, delete)'),
        image_url: z.string().max(2048).describe('Lien d’image (add)'),
        image_data: z.string().max(8_000_000).describe('Image en data URL (add, update)'),
        caption: z.string().max(500).describe('Légende'),
        sort_order: z.number().int().min(0).max(10_000).describe('Ordre (update)'),
        ordered_ids: z.array(z.number().int().positive()).max(200).describe('Ordre (reorder)'),
      },
      run: (args, ctx) => {
        assertOp(args, ['add', 'update', 'delete', 'reorder']);
        const pick = (keys) => {
          const out = {};
          for (const k of keys) if (args[k] !== undefined) out[k] = args[k];
          return out;
        };
        if (args.op === 'add' || args.op === 'reorder') {
          if (!args.target_type || !args.target_id) {
            throw new McpToolError('target_type et target_id requis', 'MCP_INVALID_ARGS');
          }
        }
        if (args.op === 'add') {
          return api(
            ctx,
            'POST',
            '/api/visit/media',
            pick(['target_type', 'target_id', 'image_url', 'image_data', 'caption']),
            { tool: TOOL },
          );
        }
        if (args.op === 'reorder') {
          return api(
            ctx,
            'PUT',
            '/api/visit/media/reorder',
            pick(['target_type', 'target_id', 'ordered_ids']),
            { tool: TOOL },
          );
        }
        if (!args.media_id) {
          throw new McpToolError(`media_id requis pour ${args.op}`, 'MCP_INVALID_ARGS');
        }
        const path = `/api/visit/media/${seg(args.media_id)}`;
        if (args.op === 'delete') return api(ctx, 'DELETE', path, undefined, { tool: TOOL });
        return api(ctx, 'PUT', path, pick(['caption', 'sort_order', 'image_data']), {
          tool: TOOL,
        });
      },
    },
    tutorials_write: {
      summary: 'tutoriels mis en avant dans la Visite d’une carte (liste ordonnée, remplace)',
      write: true,
      params: {
        map_id: req(mapId),
        tutorial_ids: req(z.array(z.number().int().positive()).max(100)),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'PUT',
          '/api/visit/tutorials',
          { map_id: args.map_id, tutorial_ids: args.tutorial_ids },
          { tool: TOOL },
        ),
    },
    mascot_packs: {
      summary: 'packs de mascottes (brouillons compris) ; pack complet si pack_id',
      params: { pack_id: z.string().min(1).max(64).describe('Identifiant (UUID) du pack') },
      run: async (args, ctx) => {
        if (args.pack_id) {
          return api(ctx, 'GET', `/api/visit/mascot-packs/${seg(args.pack_id)}`, undefined, {
            tool: TOOL,
          });
        }
        const res = await api(ctx, 'GET', '/api/visit/mascot-packs', undefined, { tool: TOOL });
        return {
          packs: (res?.packs || []).map((p) => ({
            id: p.id,
            catalog_id: p.catalog_id,
            label: p.label,
            is_published: p.is_published,
            origin: p.origin,
            updated_at: p.updated_at,
          })),
          allowed_catalog_ids: res?.allowed_catalog_ids || [],
        };
      },
    },
  },
});

module.exports = { buildVisitTool: () => tool, coverageOf };
