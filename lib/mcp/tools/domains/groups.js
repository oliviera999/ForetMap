'use strict';

/**
 * `foretmap_groups` — classes, équipes, clubs et sous-groupes (lot D2, personnes).
 *
 * - Lectures : par l'API (`GET /api/groups`, `GET /api/groups/:id`), donc avec la visibilité
 *   de la personne connectée. La liste est rendue **sans** les membres (comptés seulement) ;
 *   `class_report` lit les membres par `GET /api/groups/:id/members` (garde de périmètre)
 *   puis agrège en SQL lecture seule (`lib/mcp/domains/groups.js`), sous `stats.read.all` ou
 *   `stats.read.group`.
 * - Écritures : par le pont API. `PUT /api/groups/:id/members` remplace **à la fois** les
 *   membres et les périmètres (cartes, projets) : `set_members` relit et renvoie les
 *   périmètres actuels, `set_scopes` relit et renvoie les membres actuels — l'un ne vide
 *   jamais l'autre.
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageOf, pageParams, paged, seg } = require('./factory');
const { McpToolError } = require('../../registry');
const { classReport } = require('../../domains/groups');

const TOOL = 'foretmap_groups';

const groupId = z.string().min(1).max(64).describe('Identifiant du groupe');
const data = z
  .record(z.string(), z.unknown())
  .describe(
    'Champs du groupe (comme l’API : name, slug, description, kind class|team|unit|club, parent_group_id, default_role_id, force_default_role, curriculum_niveau, pedago_level, is_active)',
  );
const idList = z.array(z.string().min(1).max(64)).max(2000);

function getGroup(ctx, id) {
  return api(ctx, 'GET', `/api/groups/${seg(id)}`, undefined, { tool: TOOL });
}

async function getMembers(ctx, id) {
  const r = await api(ctx, 'GET', `/api/groups/${seg(id)}/members`, undefined, { tool: TOOL });
  return Array.isArray(r?.members) ? r.members : [];
}

function putMembers(ctx, id, body) {
  return api(ctx, 'PUT', `/api/groups/${seg(id)}/members`, body, { tool: TOOL });
}

function scopeIds(scopes) {
  const list = Array.isArray(scopes) ? scopes : [];
  return {
    scope_map_ids: list.map((s) => s.map_id).filter(Boolean),
    scope_project_ids: list.map((s) => s.project_id).filter(Boolean),
  };
}

function compactGroup(g) {
  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    kind: g.kind,
    parent_group_id: g.parent_group_id || null,
    is_active: g.is_active,
    curriculum_niveau: g.curriculum_niveau || null,
    curriculum_niveau_effectif: g.curriculum_niveau_effectif ?? null,
    default_role_slug: g.default_role_slug || null,
    force_default_role: !!g.force_default_role,
    members_count: Array.isArray(g.members) ? g.members.length : undefined,
    students_count: Array.isArray(g.members)
      ? g.members.filter((m) => m.user_type === 'student').length
      : undefined,
    scopes: g.scopes || [],
  };
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'groups',
  profile: 'essentiel',
  title: 'Groupes et classes (membres, périmètres, bilan de classe)',
  intro:
    'Groupes (classes, équipes, clubs, sous-groupes) : liste et fiche avec effectifs, niveau et périmètres ; création, modification, suppression ; membres et périmètres (cartes, projets) ; bilan de classe (tâches, quiz par notion, tutoriels lus, élèves inactifs) ; recalcul de la progression des élèves d’après leurs tâches validées.',
  actions: {
    list: {
      summary: 'liste des groupes visibles (effectifs, niveau, périmètres — sans noms)',
      params: {
        q: z.string().max(120).describe('Texte cherché dans le nom ou le slug'),
        kind: z.enum(['class', 'team', 'unit', 'club']).describe('Type de groupe'),
        parent_group_id: z.string().max(64).describe('Sous-groupes de ce groupe'),
        active: z.boolean().describe('true = actifs, false = inactifs'),
        ...pageParams,
      },
      run: async (args, ctx) => {
        const res = await api(ctx, 'GET', '/api/groups', undefined, { tool: TOOL });
        const needle = args.q ? String(args.q).toLowerCase() : null;
        const list = (res?.groups || []).filter((g) => {
          if (args.kind && g.kind !== args.kind) return false;
          if (args.parent_group_id && g.parent_group_id !== args.parent_group_id) return false;
          if (args.active !== undefined && !!g.is_active !== args.active) return false;
          if (needle && !`${g.name || ''} ${g.slug || ''}`.toLowerCase().includes(needle)) {
            return false;
          }
          return true;
        });
        const p = pageOf(args, ctx);
        return paged(list.slice(p.offset, p.offset + p.limit).map(compactGroup), p, {
          total: list.length,
          can_manage: !!res?.can_manage,
        });
      },
    },
    get: {
      summary: 'fiche d’un groupe (effectifs comptés, périmètres, sous-groupes, niveau effectif)',
      params: { group_id: req(groupId) },
      run: (args, ctx) => getGroup(ctx, args.group_id),
    },
    create: {
      summary: 'créer un groupe (name requis ; sous-groupe avec parent_group_id)',
      write: true,
      params: { data: req(data) },
      run: (args, ctx) => api(ctx, 'POST', '/api/groups', args.data, { tool: TOOL }),
    },
    update: {
      summary: 'modifier un groupe (seuls les champs fournis changent)',
      write: true,
      params: { group_id: req(groupId), data: req(data) },
      run: (args, ctx) =>
        api(ctx, 'PATCH', `/api/groups/${seg(args.group_id)}`, args.data, { tool: TOOL }),
    },
    delete: {
      summary: 'supprimer un groupe (membres détachés, profils recalculés, sous-groupes remontés)',
      write: true,
      params: { group_id: req(groupId) },
      run: (args, ctx) =>
        api(ctx, 'DELETE', `/api/groups/${seg(args.group_id)}`, undefined, { tool: TOOL }),
    },
    set_members: {
      summary:
        'remplacer la liste des membres (identifiants de comptes actifs) ; périmètres conservés',
      write: true,
      nominative: true,
      params: { group_id: req(groupId), member_user_ids: req(idList) },
      run: async (args, ctx) => {
        const group = await getGroup(ctx, args.group_id);
        return putMembers(ctx, args.group_id, {
          member_user_ids: args.member_user_ids,
          ...scopeIds(group?.scopes),
        });
      },
    },
    set_scopes: {
      summary: 'remplacer les périmètres (cartes, projets) ; membres conservés',
      write: true,
      params: {
        group_id: req(groupId),
        scope_map_ids: z.array(z.string().min(1).max(64)).max(200).describe('Cartes'),
        scope_project_ids: z.array(z.string().min(1).max(64)).max(500).describe('Projets'),
      },
      run: async (args, ctx) => {
        const members = await getMembers(ctx, args.group_id);
        const inactive = members.filter((m) => m.is_active === false).length;
        if (inactive) {
          throw new McpToolError(
            `${inactive} membre(s) désactivé(s) dans ce groupe : l’API refuse de réenregistrer la liste. Retirez-les ou réactivez-les d’abord.`,
            'MCP_PRECONDITION',
          );
        }
        const current = scopeIds((await getGroup(ctx, args.group_id))?.scopes);
        const res = await putMembers(ctx, args.group_id, {
          member_user_ids: members.map((m) => m.user_id),
          scope_map_ids: args.scope_map_ids ?? current.scope_map_ids,
          scope_project_ids: args.scope_project_ids ?? current.scope_project_ids,
        });
        return {
          group_id: res?.group_id,
          scopes: res?.scopes || [],
          members_count: Array.isArray(res?.members) ? res.members.length : null,
        };
      },
    },
    class_report: {
      summary:
        'bilan de classe : tâches (du groupe et des élèves), quiz par notion, tutoriels lus, élèves inactifs',
      nominative: true,
      permission: ['stats.read.all', 'stats.read.group'],
      params: {
        group_id: req(groupId),
        inactive_days: z.number().int().min(1).max(365).describe('Inactif depuis (défaut 14)'),
      },
      run: async (args, ctx) => {
        const members = await getMembers(ctx, args.group_id);
        const students = members.filter((m) => m.user_type === 'student');
        return classReport({
          groupId: args.group_id,
          students,
          inactiveDays: args.inactive_days,
        });
      },
    },
    progression_recompute: {
      summary:
        'recalculer les profils d’après les tâches validées (scope all|group|user) ; dry_run pour un aperçu',
      write: true,
      nominative: true,
      params: {
        scope: req(z.enum(['all', 'group', 'user'])),
        group_id: groupId,
        user_id: z.string().min(1).max(64).describe('Élève (scope user)'),
        allow_demotion: z.boolean().describe('Autoriser la redescente de palier'),
        dry_run: z.boolean().describe('Aperçu sans écriture'),
      },
      run: (args, ctx) =>
        api(
          ctx,
          'POST',
          '/api/rbac/progression/recompute',
          {
            scope: args.scope,
            group_id: args.group_id ?? null,
            user_id: args.user_id ?? null,
            allow_demotion: args.allow_demotion === true,
            dry_run: args.dry_run === true,
          },
          { tool: TOOL },
        ),
    },
  },
});

module.exports = { buildGroupsTool: () => tool };
