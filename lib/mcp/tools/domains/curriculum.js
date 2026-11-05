'use strict';

/**
 * `foretmap_curriculum` — notions des programmes officiels et leur couverture (lot D2).
 *
 * - `notions` : référentiel par l'API (`GET /api/curriculum/notions…`, lecture publique).
 * - `coverage` : SQL lecture seule (`lib/mcp/domains/curriculum.js`) qui croise questions,
 *   termes, tutoriels, tâches et séances avec la **règle d'héritage de l'application** ;
 *   sous `plants.manage` (gestion du référentiel) ou `stats.read.all`.
 * - `set_links` : par les routes `PUT /api/curriculum/…` (catégories de quiz et de
 *   glossaire : liste complète remplacée ; question ou terme : ajouts / exclusions).
 */

const { z } = require('zod');
const { defineDomainTool, req, api, qs, seg } = require('./factory');
const { McpToolError } = require('../../registry');
const { curriculumCoverage } = require('../../domains/curriculum');

const TOOL = 'foretmap_curriculum';

const NIVEAUX = [
  'cycle3',
  'cycle4',
  'seconde',
  'premiere_spe',
  'terminale_spe',
  'es_premiere',
  'es_terminale',
];
const notionIds = z.array(z.string().min(1).max(32)).max(50);

const TARGETS = Object.freeze({
  quiz_category: { path: 'quiz-categories', mode: 'replace' },
  glossary_category: { path: 'glossary-categories', mode: 'replace' },
  quiz_question: { path: 'quiz-questions', mode: 'exceptions' },
  glossary_term: { path: 'glossary-terms', mode: 'exceptions' },
});

const tool = defineDomainTool({
  name: TOOL,
  domain: 'curriculum',
  title: 'Programme (notions, couverture)',
  intro:
    'Notions des programmes officiels (cycle 3 → terminale) : référentiel avec effectifs, couverture de chaque notion par les contenus du site (questions, termes, tutoriels, tâches, séances ; notions orphelines), et rattachement des notions aux catégories de quiz et de glossaire, aux questions et aux termes.',
  actions: {
    notions: {
      summary: 'référentiel (filtre niveau ; une notion avec ses catégories si notion_id)',
      params: {
        niveau: z
          .string()
          .max(120)
          .describe(
            'Niveau(x) : cycle3…es_terminale, college, lycee, ou liste séparée par des virgules',
          ),
        notion_id: z.string().max(32).describe('Une notion précise'),
      },
      run: (args, ctx) =>
        args.notion_id
          ? api(ctx, 'GET', `/api/curriculum/notions/${seg(args.notion_id)}`, undefined, {
              tool: TOOL,
            })
          : api(ctx, 'GET', `/api/curriculum/notions${qs({ niveau: args.niveau })}`, undefined, {
              tool: TOOL,
            }),
    },
    coverage: {
      summary:
        'couverture : par notion, nombre de questions, termes, tutoriels, tâches, séances ; notions orphelines ou partielles',
      permission: ['plants.manage', 'stats.read.all'],
      params: { niveau: z.enum(NIVEAUX).describe('Restreindre à un niveau') },
      run: (args) => curriculumCoverage(args),
    },
    set_links: {
      summary:
        'rattacher des notions : catégorie de quiz ou de glossaire (notion_ids, liste remplacée) ; question ou terme (ajouts / exclusions)',
      write: true,
      params: {
        target_type: req(
          z
            .enum(['quiz_category', 'glossary_category', 'quiz_question', 'glossary_term'])
            .describe('Cible'),
        ),
        target_id: req(
          z.string().min(1).max(64).describe('Slug de catégorie, nom de catégorie, ou code'),
        ),
        notion_ids: notionIds.describe('Notions de la catégorie (remplacent les précédentes)'),
        ajouts: notionIds.describe('Notions ajoutées (question, terme)'),
        exclusions: notionIds.describe('Notions héritées retirées (question, terme)'),
      },
      run: (args, ctx) => {
        const target = TARGETS[args.target_type];
        let body;
        if (target.mode === 'replace') {
          if (!args.notion_ids) {
            throw new McpToolError('notion_ids requis pour une catégorie', 'MCP_INVALID_ARGS');
          }
          body = { notion_ids: args.notion_ids };
        } else {
          if (args.notion_ids) {
            throw new McpToolError(
              'Question ou terme : utiliser ajouts / exclusions, pas notion_ids',
              'MCP_INVALID_ARGS',
            );
          }
          body = { ajouts: args.ajouts || [], exclusions: args.exclusions || [] };
        }
        return api(
          ctx,
          'PUT',
          `/api/curriculum/${target.path}/${seg(args.target_id)}/notions`,
          body,
          { tool: TOOL },
        );
      },
    },
  },
});

module.exports = { buildCurriculumTool: () => tool };
