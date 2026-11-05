'use strict';

/**
 * `foretmap_glossary` — glossaire de la forêt (lot D2).
 *
 * Le site n'a **aucune route d'écriture** des termes (ils viennent des migrations et des
 * imports) et il est décidé de ne pas en créer : l'outil lit (`GET /api/glossary/terms…`) et
 * ne règle que les **notions** d'un terme (`PUT /api/curriculum/glossary-terms/:code/notions`).
 * Pour corriger un terme : `foretmap_plan_content_change` (migration relue).
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');

const TOOL = 'foretmap_glossary';

const code = z.string().min(1).max(16).describe('Code du terme (ex. FM0042)');
const notionIds = z.array(z.string().min(1).max(32)).max(50);

const tool = defineDomainTool({
  name: TOOL,
  domain: 'glossary',
  title: 'Glossaire (termes, notions)',
  intro:
    'Glossaire de la forêt : liste filtrée (texte, catégorie, niveau, notion du programme), fiche d’un terme (définitions, termes liés, espèces, tutoriels, questions, notions héritées / ajoutées / exclues) et réglage des notions d’un terme. Les termes eux-mêmes ne se modifient pas par cet outil (aucune route d’écriture : passer par foretmap_plan_content_change).',
  actions: {
    list: {
      summary: 'termes actifs (filtres texte, catégorie, niveau, notion, niveau de notion)',
      params: {
        q: z.string().max(120).describe('Texte cherché (terme, variantes)'),
        categorie: z.string().max(64).describe('Catégorie'),
        niveau: z.enum(['base', 'approfondissement', 'avance']).describe('Profondeur du terme'),
        notion_id: z.string().max(32).describe('Notion du programme'),
        notion_niveau: z
          .string()
          .max(64)
          .describe('Niveau scolaire des notions (cycle4, seconde…, college, lycee)'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const r = await api(
          ctx,
          'GET',
          `/api/glossary/terms${qs({
            q: args.q,
            categorie: args.categorie,
            niveau: args.niveau,
            notionId: args.notion_id,
            notionNiveau: args.notion_niveau,
          })}`,
          undefined,
          { tool: TOOL },
        );
        const list = r?.items || [];
        const p = pageOf(args, ctx);
        return paged(list.slice(p.offset, p.offset + p.limit), p, { total: list.length });
      },
    },
    get: {
      summary: 'fiche d’un terme et décomposition de ses notions',
      params: { glossary_code: req(code) },
      run: async (args, ctx) => {
        const term = await api(
          ctx,
          'GET',
          `/api/glossary/terms/${seg(args.glossary_code)}`,
          undefined,
          {
            tool: TOOL,
          },
        );
        const notions = await api(
          ctx,
          'GET',
          `/api/curriculum/glossary-terms/${seg(args.glossary_code)}/notions`,
          undefined,
          { tool: TOOL },
        );
        return { ...term, notions_detail: notions };
      },
    },
    set_notions: {
      summary:
        'notions d’un terme : ajouts et exclusions par rapport à celles héritées de sa catégorie (remplacent les précédents)',
      write: true,
      params: {
        glossary_code: req(code),
        ajouts: notionIds.describe('Notions ajoutées'),
        exclusions: notionIds.describe('Notions héritées retirées'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'PUT',
          `/api/curriculum/glossary-terms/${seg(args.glossary_code)}/notions`,
          { ajouts: args.ajouts || [], exclusions: args.exclusions || [] },
          { tool: TOOL },
        ),
    },
  },
});

module.exports = { buildGlossaryTool: () => tool };
