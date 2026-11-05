'use strict';

/**
 * `foretmap_learning` — conditionnement des ressources par des questions du quiz (lot D2).
 *
 * Tout passe par l'API de gestion `/api/learning-links/*` (permission `plants.manage`) :
 * politiques par ressource ou par type, liens ressource ↔ question, verrous en cours,
 * rapprochement automatique (suggestions avec indice de confiance) et revue. Les routes
 * `/api/learning/gating/*` ne décrivent que l'état de la personne connectée (côté élève) :
 * elles ne servent pas ici.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, qs } = require('./factory');
const { McpToolError } = require('../../registry');

const TOOL = 'foretmap_learning';

const resourceType = z
  .enum(['tutorial', 'plant', 'glossary'])
  .describe('Type de ressource (tutorial, plant, glossary)');
const resourceRef = z
  .string()
  .min(1)
  .max(64)
  .describe('Référence de la ressource (id du tutoriel ou de l’espèce, code du terme)');
const linkIds = z.array(z.number().int().min(1)).min(1).max(1000).describe('Identifiants de liens');
const candidates = z
  .array(
    z.strictObject({
      resource_type: resourceType,
      resource_ref: resourceRef,
      question_code: z.string().min(1).max(16),
    }),
  )
  .min(1)
  .max(200)
  .describe('Propositions (telles que renvoyées par links_suggest)');

function call(ctx, method, path, body) {
  return api(ctx, method, path, body, { tool: TOOL });
}

/** Revue : par identifiants, par ressource entière, ou création directe des couples proposés. */
async function review(args, ctx, status) {
  if (args.link_ids?.length) {
    return call(ctx, 'POST', '/api/learning-links/review', {
      action: status === 'approved' ? 'approve' : 'reject',
      ids: args.link_ids,
    });
  }
  if (args.candidates?.length) {
    const results = [];
    for (const c of args.candidates) {
      try {
        const r = await call(ctx, 'POST', '/api/learning-links', { ...c, status });
        results.push({ ...c, ok: true, link_id: r?.link?.id ?? null, warning: r?.warning });
      } catch (err) {
        results.push({ ...c, ok: false, error: err.message });
      }
    }
    return { status, created: results.filter((r) => r.ok).length, results };
  }
  if (args.resource_type && args.resource_ref) {
    return call(ctx, 'POST', '/api/learning-links/review', {
      action: status === 'approved' ? 'approve' : 'reject',
      resourceType: args.resource_type,
      resourceRef: args.resource_ref,
    });
  }
  throw new McpToolError(
    'Indiquer link_ids, candidates, ou resource_type + resource_ref',
    'MCP_INVALID_ARGS',
  );
}

const reviewParams = {
  link_ids: linkIds,
  candidates,
  resource_type: resourceType,
  resource_ref: resourceRef,
};

const tool = defineDomainTool({
  name: TOOL,
  domain: 'learning',
  title: 'Conditionnement par le quiz (politiques, liens, verrous)',
  intro:
    'Conditionnement « lu et compris » par des questions du quiz : politiques (par ressource ou par type, réglages du site), liens ressource ↔ question, verrous d’élèves en cours (et levée), rapprochement automatique avec indice de confiance, acceptation ou rejet des propositions. Écritures sous la permission plants.manage.',
  actions: {
    gating_get: {
      summary:
        'politique effective : d’une ressource (avec liens et progression agrégée), d’un type, ou réglages du site',
      params: { resource_type: resourceType, resource_ref: resourceRef },
      run: async (args, ctx) => {
        const config = await call(ctx, 'GET', '/api/learning-links/config');
        if (!args.resource_type) return { site: config };
        if (!args.resource_ref) {
          const typePolicy = await call(
            ctx,
            'GET',
            `/api/learning-links/type-policy${qs({ resourceType: args.resource_type })}`,
          );
          return { site: config, type_policy: typePolicy };
        }
        const q = qs({ resourceType: args.resource_type, resourceRef: args.resource_ref });
        const policy = await call(ctx, 'GET', `/api/learning-links/policy${q}`);
        const links = await call(ctx, 'GET', `/api/learning-links${q}`);
        const progress = await call(ctx, 'GET', `/api/learning-links/progress${q}`);
        return { site: config, policy, links: links?.links || [], progress };
      },
    },
    gating_set: {
      summary:
        'régler la politique (policy : mode off|any|all|threshold, required_correct, enabled, allowed_wrong_attempts, max_questions_per_session, retry_cooldown_hours, cooldown_scope, lock_mode, granularity) d’une ressource ou d’un type (sans resource_ref) ; et/ou rendre des liens bloquants (is_gating + link_ids, ou tous les liens approuvés de la ressource)',
      write: true,
      params: {
        resource_type: req(resourceType),
        resource_ref: resourceRef,
        policy: z
          .record(z.string(), z.unknown())
          .describe('Champs de politique à changer (les autres sont conservés)'),
        is_gating: z.boolean().describe('Rendre bloquants (true) ou non (false) des liens'),
        link_ids: linkIds,
      },
      run: async (args, ctx) => {
        if (!args.policy && args.is_gating === undefined) {
          throw new McpToolError('Indiquer policy et/ou is_gating', 'MCP_INVALID_ARGS');
        }
        const out = {};
        if (args.policy) {
          const body = { ...args.policy, resource_type: args.resource_type };
          out.policy = args.resource_ref
            ? await call(ctx, 'PUT', '/api/learning-links/policy', {
                ...body,
                resource_ref: args.resource_ref,
              })
            : await call(ctx, 'PUT', '/api/learning-links/type-policy', body);
        }
        if (args.is_gating !== undefined) {
          if (!args.link_ids?.length && !args.resource_ref) {
            throw new McpToolError(
              'is_gating : indiquer link_ids ou resource_ref',
              'MCP_INVALID_ARGS',
            );
          }
          out.links = await call(ctx, 'POST', '/api/learning-links/gating', {
            is_gating: args.is_gating,
            ...(args.link_ids?.length
              ? { ids: args.link_ids }
              : { resourceType: args.resource_type, resourceRef: args.resource_ref }),
          });
        }
        return out;
      },
    },
    links_list: {
      summary: 'liens ressource ↔ question (filtres type, ressource, question, statut)',
      params: {
        resource_type: resourceType,
        resource_ref: resourceRef,
        question_code: z.string().max(16).describe('Code de question'),
        status: z.enum(['suggested', 'approved', 'rejected']).describe('Statut du lien'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const r = await call(
          ctx,
          'GET',
          `/api/learning-links${qs({
            resourceType: args.resource_type,
            resourceRef: args.resource_ref,
            questionCode: args.question_code,
            status: args.status,
          })}`,
        );
        const list = r?.links || [];
        const p = pageOf(args, ctx);
        return paged(list.slice(p.offset, p.offset + p.limit), p, {
          total: r?.total ?? list.length,
          truncated: !!r?.truncated,
        });
      },
    },
    overrides: {
      summary: 'verrous en cours (élèves bloqués sur une ressource après trop d’erreurs)',
      nominative: true,
      params: {
        resource_type: resourceType,
        include_expired: z.boolean().describe('Inclure les verrous expirés'),
      },
      run: (args, ctx) =>
        call(
          ctx,
          'GET',
          `/api/learning-links/locks${qs({
            resourceType: args.resource_type,
            includeExpired: args.include_expired ? '1' : undefined,
          })}`,
        ),
    },
    override_release: {
      summary: 'lever le verrou d’un élève sur une ressource',
      write: true,
      nominative: true,
      params: {
        user_id: req(z.string().min(1).max(64)),
        resource_type: req(resourceType),
        resource_ref: req(resourceRef),
        question_code: z.string().max(16).describe('Question du verrou (facultatif)'),
      },
      run: (args, ctx) =>
        call(ctx, 'DELETE', '/api/learning-links/locks', {
          user_id: args.user_id,
          resource_type: args.resource_type,
          resource_ref: args.resource_ref,
          ...(args.question_code ? { question_code: args.question_code } : {}),
        }),
    },
    links_suggest: {
      summary:
        'rapprochement automatique questions ↔ ressources (simulation : rien n’est écrit) ; confiance en %',
      params: {
        resource_types: z.array(resourceType).max(3).describe('Types visés (défaut : tous)'),
        resource_refs: z.array(resourceRef).max(500).describe('Ressources visées'),
        question_codes: z.array(z.string().min(1).max(16)).max(1000).describe('Questions visées'),
        min_confidence: z.number().min(0).max(1).describe('Confiance minimale (0–1, défaut 0.5)'),
        max_per_question: z.number().int().min(1).max(10).describe('Propositions par question'),
        limit: z.number().int().min(1).max(2000).describe('Nombre maximal de propositions'),
      },
      run: async (args, ctx) => {
        const r = await call(ctx, 'POST', '/api/learning-links/suggest', {
          apply: false,
          ...(args.resource_types ? { resourceTypes: args.resource_types } : {}),
          ...(args.resource_refs ? { resourceRefs: args.resource_refs } : {}),
          ...(args.question_codes ? { questionCodes: args.question_codes } : {}),
          ...(args.min_confidence !== undefined ? { minConfidence: args.min_confidence } : {}),
          ...(args.max_per_question ? { maxPerQuestion: args.max_per_question } : {}),
        });
        const all = (r?.candidates || []).map((c) => ({
          ...c,
          confidence_percent:
            c.confidence == null ? null : Math.round(Number(c.confidence) * 1000) / 10,
        }));
        const limit = args.limit || 200;
        return {
          stats: r?.stats,
          total: all.length,
          truncated: !!r?.truncated || all.length > limit,
          candidates: all.slice(0, limit),
          suite:
            'links_accept ou links_reject avec candidates (resource_type, resource_ref, question_code)',
        };
      },
    },
    links_accept: {
      summary:
        'accepter des propositions : liens « suggested » (link_ids ou ressource entière) ou couples proposés (candidates, créés approuvés, non bloquants)',
      write: true,
      params: reviewParams,
      run: (args, ctx) => review(args, ctx, 'approved'),
    },
    links_reject: {
      summary:
        'rejeter des propositions (link_ids, ressource entière, ou candidates enregistrés rejetés pour ne plus être reproposés)',
      write: true,
      params: reviewParams,
      run: (args, ctx) => review(args, ctx, 'rejected'),
    },
  },
});

module.exports = { buildLearningTool: () => tool };
