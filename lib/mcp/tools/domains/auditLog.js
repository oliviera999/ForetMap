'use strict';

/**
 * `foretmap_audit_log` — journal d'audit et journal de sécurité (lot D4, nominatif).
 *
 * - `query` : lecture filtrée d'`audit_log` (acteur, action ou préfixe `forum_*`, entité,
 *   période, canal `via` lu dans `payload_json`, issue). SQL en lecture seule
 *   (`lib/mcp/domains/auditLog.js`) : la route `GET /api/audit` ne sait pas filtrer. Exige
 *   `audit.read`, comme la route.
 * - `security_events` : `GET /api/audit/security` (`lib/securityEventsQuery.js`, permission
 *   `audit.security.read`) — adresses IP et navigateurs des événements de sécurité.
 *
 * Les deux actions sont nominatives : un journal nomme les comptes qui ont agi.
 */

const { z } = require('zod');
const { defineDomainTool, api, pageOf, pageParams, paged, qs } = require('./factory');
const { queryAuditLog } = require('../../domains/auditLog');

const TOOL = 'foretmap_audit_log';

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ')
  .describe('Jour (AAAA-MM-JJ)');
const short = (max, d) => z.string().min(1).max(max).describe(d);
// Même schéma pour les deux actions : le schéma publié est plat (un paramètre, un type).
const result = short(16, 'Issue (success, failure, denied…)');

const tool = defineDomainTool({
  name: TOOL,
  domain: 'audit_log',
  title: 'Journal d’audit et de sécurité',
  intro:
    'Qui a fait quoi sur le site : journal d’audit filtré (acteur, action, entité, période, canal via — « mcp » pour les actions faites par le connecteur —, issue) et journal de sécurité (connexions, refus, changements de droits, avec IP et navigateur).',
  actions: {
    query: {
      summary:
        'journal d’audit filtré (actor_user_id, event ou préfixe*, target_type, target_id, from, to, via, result)',
      nominative: true,
      permission: 'audit.read',
      params: {
        actor_user_id: short(64, 'Compte acteur'),
        actor_user_type: z.enum(['teacher', 'student', 'user', 'system']).describe('Type d’acteur'),
        event: short(96, 'Action journalisée exacte, ou préfixe suivi de * (ex. forum_*)'),
        target_type: short(32, 'Type d’entité (task, forum_thread, setting…)'),
        target_id: short(64, 'Identifiant de l’entité'),
        from: day,
        to: day,
        via: short(32, 'Canal (mcp…) lu dans payload_json'),
        result,
        ...pageParams,
      },
      run: async (args, ctx) => {
        const p = pageOf(args, ctx, 100);
        const { items, total } = await queryAuditLog({ ...args, action: args.event }, p);
        return paged(items, p, { total });
      },
    },
    security_events: {
      summary: 'journal de sécurité (période, acteur, action, IP, issue)',
      nominative: true,
      permission: 'audit.security.read',
      params: {
        from: day,
        to: day,
        actor_user_id: short(64, 'Compte acteur'),
        event: short(96, 'Action journalisée exacte, ou préfixe suivi de * (ex. forum_*)'),
        ip: short(64, 'Adresse IP'),
        result,
        ...pageParams,
      },
      run: async (args, ctx) => {
        const p = pageOf(args, ctx, 100);
        const limit = Math.min(200, p.limit);
        const out = await api(
          ctx,
          'GET',
          `/api/audit/security${qs({
            from: args.from,
            to: args.to,
            actorUserId: args.actor_user_id,
            action: args.event,
            ip: args.ip,
            result: args.result,
            limit,
            offset: p.offset,
          })}`,
          undefined,
          { tool: TOOL },
        );
        return out;
      },
    },
  },
});

function buildAuditLogTool() {
  return tool;
}

module.exports = { buildAuditLogTool };
