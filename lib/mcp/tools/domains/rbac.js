'use strict';

/**
 * `foretmap_rbac` — profils et permissions (lot D4).
 *
 * Tout passe par les routes `/api/rbac/*` (permissions `admin.roles.manage` et
 * `admin.users.assign_roles`), donc avec leurs gardes : seul un administrateur modifie le
 * profil admin, un délégué ne touche pas un profil de rang égal ou supérieur, ne peut accorder
 * une permission qu'il ne détient pas, et `admin` / `prof` ne perdent jamais `teacher.access`.
 *
 * `grant` / `revoke` : la route remplace l'ensemble des permissions d'un profil ; l'outil lit
 * donc l'ensemble courant, l'ajuste, puis le réécrit (`PUT /api/rbac/profiles/:id/permissions`).
 */

const { z } = require('zod');
const { defineDomainTool, req, api, pageParams, pageOf, paged } = require('./factory');
const { McpToolError } = require('../../registry');
const { withReadOnly } = require('../../readDb');

const TRUSTED = { astValidated: true };

const TOOL = 'foretmap_rbac';

const roleParam = z
  .union([z.number().int().positive(), z.string().min(1).max(64)])
  .describe('Profil : identifiant numérique ou slug (admin, prof, eleve_novice…)');
const permissionKeys = z
  .array(z.string().min(1).max(96))
  .min(1)
  .max(200)
  .describe('Clés de permission (ex. forum.group.moderate)');

async function loadProfiles(ctx) {
  return api(ctx, 'GET', '/api/rbac/profiles', undefined, { tool: TOOL });
}

function findRole(roles, ref) {
  const wanted = String(ref).trim().toLowerCase();
  const role = roles.find(
    (r) => String(r.id) === wanted || String(r.slug || '').toLowerCase() === wanted,
  );
  if (!role) throw new McpToolError(`Profil introuvable : ${ref}`, 'MCP_NOT_FOUND');
  return role;
}

function roleSummary(r) {
  return {
    id: r.id,
    slug: r.slug,
    display_name: r.display_name,
    emoji: r.emoji || null,
    rank: r.rank,
    is_system: !!Number(r.is_system),
    min_done_tasks: r.min_done_tasks ?? null,
    forum_participate: !!Number(r.forum_participate),
    context_comment_participate: !!Number(r.context_comment_participate),
    max_concurrent_tasks: r.max_concurrent_tasks ?? null,
    permissions_count: (r.permissions || []).length,
  };
}

/** Lit l'ensemble courant, applique `mutate`, réécrit l'ensemble complet. */
async function rewritePermissions(args, ctx, mutate) {
  const data = await loadProfiles(ctx);
  const roles = data?.roles || [];
  const role = findRole(roles, args.role);
  const catalog = new Set((roles[0]?.catalog || []).map((p) => p.key));
  const unknown = args.permissions.filter((k) => !catalog.has(k));
  if (unknown.length) {
    throw new McpToolError(`Permission(s) inconnue(s) : ${unknown.join(', ')}`, 'MCP_INVALID_ARGS');
  }
  const before = new Set((role.permissions || []).map((p) => p.key));
  const after = mutate(new Set(before), args.permissions);
  const added = [...after].filter((k) => !before.has(k)).sort();
  const removed = [...before].filter((k) => !after.has(k)).sort();
  if (!added.length && !removed.length) {
    return { ok: true, role: role.slug, unchanged: true, permissions_count: before.size };
  }
  await api(
    ctx,
    'PUT',
    `/api/rbac/profiles/${encodeURIComponent(String(role.id))}/permissions`,
    { permissions: [...after].sort().map((key) => ({ key })) },
    { tool: TOOL },
  );
  return { ok: true, role: role.slug, added, removed, permissions_count: after.size };
}

/**
 * Niveau de contenu des comptes non élèves (demande du 22/11/2026, migration 387) : choix
 * enregistré (`users.pedago_content_level`, NULL = aucun) et niveau résolu par le serveur
 * (`lib/pedago/learnerLevel.js`, hors aperçu et hors séance), avec son origine
 * (`profil`, `vue_complete`, `classe` = groupes du compte, `defaut` = cycle 3). Lecture seule.
 */
async function staffContentLevels(args, ctx) {
  const pageArgs = pageOf(args, ctx, 100);
  const rows = await withReadOnly((db) => {
    const params = [];
    let where = "u.user_type <> 'student'";
    if (args.user_id) {
      where += ' AND u.id = ?';
      params.push(String(args.user_id));
    }
    if (args.active !== false) where += ' AND u.is_active = 1';
    params.push(pageArgs.limit, pageArgs.offset);
    return db.raw(
      `SELECT u.id, u.display_name, u.is_active, u.pedago_content_level
         FROM users u
        WHERE ${where}
        ORDER BY u.display_name ASC, u.id ASC
        LIMIT ? OFFSET ?`,
      params,
      TRUSTED,
    );
  });
  const { loadLearnerLevel } = require('../../../pedago/learnerLevel');
  const items = [];
  for (const row of rows) {
    const level = await loadLearnerLevel(row.id);
    items.push({
      user_id: row.id,
      display_name: row.display_name,
      is_active: !!Number(row.is_active),
      choix: row.pedago_content_level || null,
      niveau: level?.niveau ?? null,
      etape: level?.etape ?? null,
      max_palier: level?.maxPalier ?? null,
      source: level?.sources?.niveau ?? null,
    });
  }
  if (args.user_id && items.length === 0) {
    throw new McpToolError(`Compte non élève introuvable : ${args.user_id}`, 'MCP_NOT_FOUND');
  }
  return paged(items, pageArgs, {
    order: 'aperçu (session) > séance > choix du profil > groupes du compte > cycle 3',
  });
}

const tool = defineDomainTool({
  name: TOOL,
  domain: 'rbac',
  title: 'Profils et permissions (RBAC)',
  intro:
    'Profils (rôles) et permissions du site : liste des profils, catalogue des permissions et droits d’un profil, accorder ou retirer des permissions à un profil, attribuer un profil à un compte, niveau de contenu pédagogique des comptes non élèves (lecture). Les gardes de l’administration s’appliquent (profil admin réservé à un administrateur, rang, pas de permission qu’on ne détient pas, teacher.access verrouillé sur admin et prof).',
  actions: {
    roles: {
      summary: 'profils (rang, paliers, participation, nombre de permissions)',
      run: async (_args, ctx) => {
        const data = await loadProfiles(ctx);
        return {
          roles: (data?.roles || []).map(roleSummary),
          progression_by_validated_tasks: !!data?.progressionByValidatedTasksEnabled,
        };
      },
    },
    permissions: {
      summary: 'catalogue des permissions ; avec role : permissions de ce profil',
      params: { role: roleParam },
      run: async (args, ctx) => {
        const data = await loadProfiles(ctx);
        const roles = data?.roles || [];
        const catalog = roles[0]?.catalog || [];
        if (args.role === undefined) {
          return {
            catalog,
            by_role: Object.fromEntries(
              roles.map((r) => [r.slug, (r.permissions || []).map((p) => p.key)]),
            ),
          };
        }
        const role = findRole(roles, args.role);
        const granted = new Set((role.permissions || []).map((p) => p.key));
        return {
          role: roleSummary(role),
          granted: [...granted].sort(),
          not_granted: catalog.map((p) => p.key).filter((k) => !granted.has(k)),
        };
      },
    },
    grant: {
      summary: 'accorder des permissions à un profil (lecture puis réécriture de l’ensemble)',
      write: true,
      params: { role: req(roleParam), permissions: req(permissionKeys) },
      run: (args, ctx) =>
        rewritePermissions(args, ctx, (set, keys) => {
          for (const k of keys) set.add(k);
          return set;
        }),
    },
    revoke: {
      summary: 'retirer des permissions à un profil (lecture puis réécriture de l’ensemble)',
      write: true,
      params: { role: req(roleParam), permissions: req(permissionKeys) },
      run: (args, ctx) =>
        rewritePermissions(args, ctx, (set, keys) => {
          for (const k of keys) set.delete(k);
          return set;
        }),
    },
    content_levels: {
      summary:
        'niveau de contenu des comptes non élèves : choix du profil (NULL = aucun), niveau résolu et origine (profil, vue_complete, classe = groupes, defaut = cycle 3)',
      permission: ['admin.users.assign_roles', 'admin.roles.manage'],
      params: {
        user_id: z.string().min(1).max(64).describe('Un compte non élève précis'),
        active: z.boolean().describe('Comptes actifs seulement (défaut : oui)'),
        ...pageParams,
      },
      run: (args, ctx) => staffContentLevels(args, ctx),
    },
    set_user_role: {
      summary: 'attribuer un profil principal à un compte (garde anti-escalade)',
      write: true,
      params: {
        user_type: req(z.enum(['teacher', 'student', 'user']).describe('Type de compte')),
        user_id: req(z.string().min(1).max(64).describe('Compte')),
        role: req(roleParam),
      },
      run: async (args, ctx) => {
        let roleId = args.role;
        if (typeof roleId !== 'number' && !/^\d+$/.test(String(roleId))) {
          const data = await loadProfiles(ctx);
          roleId = findRole(data?.roles || [], args.role).id;
        }
        return api(
          ctx,
          'PUT',
          `/api/rbac/users/${encodeURIComponent(args.user_type)}/${encodeURIComponent(args.user_id)}/role`,
          { role_id: Number(roleId) },
          { tool: TOOL },
        );
      },
    },
  },
});

function buildRbacTool() {
  return tool;
}

module.exports = { buildRbacTool };
