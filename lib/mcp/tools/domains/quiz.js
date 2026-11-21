'use strict';

/**
 * `foretmap_quiz` — catalogue de questions du quiz ForêtMap (lot D2).
 *
 * - Lectures : catalogue et fiches par l'API (`/api/quiz/admin/*`, `/api/quiz/categories`) ;
 *   `stats` agrège en SQL lecture seule (`lib/mcp/domains/quiz.js`) la réussite par question,
 *   catégorie et notion, sous `stats.read.all` ou `plants.manage` (les deux permissions qui
 *   ouvrent déjà ces agrégats dans l'application).
 * - Écritures : par le pont API. La route de modification (`PUT /api/quiz/admin/questions/:code`)
 *   attend la question **complète** : `update` et `retire` relisent la fiche, y fusionnent les
 *   changements, puis l'envoient (un champ omis n'est donc jamais effacé). Les notions d'une
 *   question passent par `PUT /api/curriculum/quiz-questions/:code/notions`.
 * - Rattachements : `create` et `update` acceptent `plant_ids`, `glossary_codes` et
 *   `tutorial_ids`. La route les écrit dans `resource_question_links` par le service unique
 *   des liens, dans la transaction de la question : ajout seulement, lien approuvé, non
 *   bloquant, `origin = 'manual'`, sans effet sur un lien déjà approuvé.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs, seg } = require('./factory');
const { quizStats } = require('../../domains/quiz');

const TOOL = 'foretmap_quiz';

const code = z.string().min(1).max(16).describe('Code de la question (ex. QF0042)');
const data = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs de la question (comme l’API : categorie_slug, question, choix_a…choix_e, reponse_correcte A–E, reponse_texte, niveau college|lycee, difficulte 1–3, feedback_correct, feedback_a…e, notes_pedagogiques, tags, photo_url, photo_credit, photo_licence, photo_legende, statut actif|inactif ; rattachements plant_ids, glossary_codes, tutorial_ids)',
  );
const plantIds = z
  .array(z.number().int().positive())
  .max(50)
  .describe(
    'Fiches espèce à rattacher (identifiants) : liens ajoutés, approuvés, non bloquants ; une fiche déjà liée ne change pas, aucune n’est détachée',
  );
const glossaryCodes = z
  .array(z.string().min(1).max(64))
  .max(50)
  .describe('Termes du glossaire à rattacher (codes), mêmes règles que plant_ids');
const tutorialIds = z
  .array(z.number().int().positive())
  .max(50)
  .describe('Tutoriels à rattacher (identifiants), mêmes règles que plant_ids');
const linkParams = {
  plant_ids: plantIds,
  glossary_codes: glossaryCodes,
  tutorial_ids: tutorialIds,
};
const LINK_FIELDS = Object.keys(linkParams);

/**
 * Rattachements d'un appel : le paramètre de premier niveau l'emporte sur le même champ glissé
 * dans `data`. Un champ absent des deux n'est pas envoyé (la route n'y touche pas).
 */
function linkFieldsOf(args) {
  const out = {};
  for (const field of LINK_FIELDS) {
    const value = args[field] ?? args.data?.[field];
    if (value != null) out[field] = value;
  }
  return out;
}
const notionIds = z.array(z.string().min(1).max(32)).max(50);

/** Champs que la route relit (les autres — thème, nom de catégorie, dates — sont ignorés). */
const WRITABLE = [
  'categorie_slug',
  'numero_dans_categorie',
  'question',
  'choix_a',
  'choix_b',
  'choix_c',
  'choix_d',
  'choix_e',
  'reponse_correcte',
  'reponse_texte',
  'niveau',
  'difficulte',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
  'notes_pedagogiques',
  'tags',
  'photo_url',
  'photo_credit',
  'photo_licence',
  'photo_legende',
  'statut',
];

async function getQuestion(ctx, c) {
  const r = await api(ctx, 'GET', `/api/quiz/admin/questions/${seg(c)}`, undefined, {
    tool: TOOL,
  });
  return r?.question || r;
}

async function mergeAndSave(ctx, c, changes) {
  const current = await getQuestion(ctx, c);
  const body = {};
  for (const k of WRITABLE) if (current?.[k] !== undefined) body[k] = current[k];
  // `changes` peut porter les rattachements : la fiche relue, elle, n'en contient jamais.
  Object.assign(body, changes);
  return api(ctx, 'PUT', `/api/quiz/admin/questions/${seg(c)}`, body, { tool: TOOL });
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'quiz',
  title: 'Quiz (questions, catégories, notions, réussite)',
  intro:
    'Quiz de la forêt : catalogue filtré, fiche d’une question (avec ses notions), catégories, statistiques de réussite (par question, catégorie et notion), création, modification (avec rattachement à des fiches espèce, des termes du glossaire ou des tutoriels), retrait (statut inactif) et notions d’une question (ajouts / exclusions par rapport à sa catégorie).',
  actions: {
    list: {
      summary: 'catalogue (thème, catégorie, niveau, statut actif|inactif|all, texte)',
      params: {
        theme: z.string().max(32).describe('Thème (sciences, jardinage)'),
        categorie_slug: z.string().max(64).describe('Catégorie'),
        niveau: z.enum(['college', 'lycee']).describe('Niveau'),
        statut: z.enum(['actif', 'inactif', 'all']).describe('Statut (défaut actif)'),
        q: z.string().max(200).describe('Texte cherché'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const r = await api(
          ctx,
          'GET',
          `/api/quiz/admin/questions${qs({
            theme: args.theme,
            categorieSlug: args.categorie_slug,
            niveau: args.niveau,
            statut: args.statut,
            q: args.q,
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
      summary:
        'fiche complète d’une question et ses notions (héritées, ajouts, exclusions, palier d’entrée effectif entry_palier : 1 = cycle 3, 2 = cycle 4, 3 = lycée)',
      params: { question_code: req(code) },
      run: async (args, ctx) => {
        const question = await getQuestion(ctx, args.question_code);
        const notions = await api(
          ctx,
          'GET',
          `/api/curriculum/quiz-questions/${seg(args.question_code)}/notions`,
          undefined,
          { tool: TOOL },
        );
        return { question, notions };
      },
    },
    categories: {
      summary:
        'catégories (thème, nombre de questions) ; filtres thème, niveau, notion, palier maximal (compteur au palier d’un élève de collège)',
      params: {
        theme: z.string().max(32).describe('Thème'),
        niveau: z.enum(['college', 'lycee']).describe('Niveau'),
        notion_id: z.string().max(32).describe('Notion du programme'),
        palier_max: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe('Palier d’entrée maximal des questions comptées (1 = cycle 3, 2 = cycle 4)'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'GET',
          `/api/quiz/categories${qs({
            theme: args.theme,
            niveau: args.niveau,
            notionId: args.notion_id,
            palierMax: args.palier_max,
          })}`,
          undefined,
          { tool: TOOL },
        ),
    },
    stats: {
      summary:
        'réussite par question (les plus ratées d’abord), par catégorie et par notion ; filtres catégorie, notion, période, tentatives minimales',
      permission: ['stats.read.all', 'plants.manage'],
      params: {
        categorie_slug: z.string().max(64).describe('Catégorie'),
        notion_id: z.string().max(32).describe('Notion du programme'),
        from: z.string().max(10).describe('Depuis (AAAA-MM-JJ)'),
        to: z.string().max(10).describe('Jusqu’au (AAAA-MM-JJ)'),
        min_attempts: z.number().int().min(0).max(10000).describe('Tentatives minimales'),
        limit: z.number().int().min(1).max(2000).describe('Questions listées (défaut 200)'),
      },
      run: (args) => quizStats(args),
    },
    create: {
      summary:
        'créer une question (categorie_slug, question, choix_a–c, reponse_correcte requis ; code et numéro dans la catégorie attribués s’ils manquent) ; plant_ids, glossary_codes, tutorial_ids la rattachent à des ressources',
      write: true,
      params: { data: req(data), ...linkParams },
      run: async (args, ctx) => {
        const body = { ...args.data, ...linkFieldsOf(args) };
        if (!body.question_code) {
          const next = await api(ctx, 'GET', '/api/quiz/admin/questions/next-code', undefined, {
            tool: TOOL,
          });
          body.question_code = next?.question_code;
        }
        if (!body.numero_dans_categorie && body.categorie_slug) {
          const r = await api(
            ctx,
            'GET',
            `/api/quiz/admin/questions${qs({ categorieSlug: body.categorie_slug, statut: 'all' })}`,
            undefined,
            { tool: TOOL },
          );
          const max = Math.max(
            0,
            ...(r?.items || []).map((q) => Number(q.numero_dans_categorie) || 0),
          );
          body.numero_dans_categorie = max + 1;
        }
        return api(ctx, 'POST', '/api/quiz/admin/questions', body, { tool: TOOL });
      },
    },
    update: {
      summary:
        'modifier une question (seuls les champs fournis changent) ; plant_ids, glossary_codes, tutorial_ids ajoutent des rattachements sans en retirer',
      write: true,
      params: { question_code: req(code), data: req(data), ...linkParams },
      run: (args, ctx) =>
        mergeAndSave(ctx, args.question_code, { ...args.data, ...linkFieldsOf(args) }),
    },
    retire: {
      summary: 'retirer une question (statut inactif : plus tirée, liens conservés)',
      write: true,
      params: { question_code: req(code) },
      run: (args, ctx) => mergeAndSave(ctx, args.question_code, { statut: 'inactif' }),
    },
    set_notions: {
      summary:
        'notions d’une question : ajouts et exclusions par rapport à celles héritées de sa catégorie (remplacent les précédents)',
      write: true,
      params: {
        question_code: req(code),
        ajouts: notionIds.describe('Notions ajoutées'),
        exclusions: notionIds.describe('Notions héritées retirées'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'PUT',
          `/api/curriculum/quiz-questions/${seg(args.question_code)}/notions`,
          { ajouts: args.ajouts || [], exclusions: args.exclusions || [] },
          { tool: TOOL },
        ),
    },
  },
});

module.exports = { buildQuizTool: () => tool };
