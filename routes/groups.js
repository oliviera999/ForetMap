const express = require('express');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { rethrowSlugConflict } = require('../lib/slugConflict');
const {
  normalizeId,
  canReadGroups,
  canManageGroups,
  canBypassGroupScope,
  isGroupInManageScope,
  getAllGroups,
  getUserAccessibleGroupIds,
} = require('../lib/groupScope');
const { z, validate } = require('../lib/validate');
const { recomputeGroupMembersRoles, recomputeUsersRoles } = require('../lib/effectiveRole');
const { addUserToGroup, removeUserFromGroup } = require('../lib/groupMembers');
const {
  canManageGroupDefaultRole,
  validateGroupDefaultRole,
} = require('../lib/groupDefaultRolePolicy');
const { logAudit } = require('../lib/auditLog');
const { slugify } = require('../lib/shared/slug');

const router = express.Router();

// O7 — Garde d'autorisation extraite en middleware pour POST / : reproduit à l'identique la garde
// `if (!canManageGroups(req.auth)) return res.status(403)...` qui ouvrait le handler, mais en amont
// du middleware `validate`. Indispensable pour conserver l'ordre 403-avant-400 d'origine (un
// non-manager au corps invalide reçoit toujours 403, jamais 400). Même message, même code.
function requireGroupManagement(req, res, next) {
  if (!canManageGroups(req.auth)) {
    return res.status(403).json({ error: 'Permission insuffisante' });
  }
  return next();
}

function normalizeKind(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'class';
  if (['class', 'team', 'unit', 'club'].includes(raw)) return raw;
  return null;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

/**
 * Imposer le profil d'un groupe (`force_default_role`) suppose d'avoir choisi ce profil :
 * « imposer la règle automatique » n'aurait pas de sens. Refusé à l'écriture plutôt que
 * silencieusement sans effet — un réglage coché qui ne fait rien est pire qu'un refus.
 */
function forceDefaultRoleError(forceDefaultRole, defaultRoleId) {
  if (!forceDefaultRole || defaultRoleId) return null;
  return 'force_default_role exige un profil par défaut (default_role_id)';
}

/**
 * Enrichit un lot de groupes en 2 requêtes batch (rôle par défaut, classe GL) —
 * remplace le « 2 queryOne par groupe » de la liste (N+1).
 */
async function enrichGroupRows(rows) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return [];
  const roleIds = [...new Set(list.map((r) => r.default_role_id).filter(Boolean))];
  const groupIds = list.map((r) => r.id);
  const [roleRows, glClassRows] = await Promise.all([
    roleIds.length
      ? queryAll(
          `SELECT id, slug, display_name, \`rank\` FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`,
          roleIds,
        )
      : [],
    queryAll(
      `SELECT id, name, foretmap_group_id FROM gl_classes
        WHERE foretmap_group_id IN (${groupIds.map(() => '?').join(',')})`,
      groupIds,
    ),
  ]);
  const roleById = new Map(roleRows.map((r) => [String(r.id), r]));
  // Reproduit le LIMIT 1 par groupe : première classe rencontrée pour un groupe.
  const glClassByGroupId = new Map();
  for (const c of glClassRows) {
    const key = String(c.foretmap_group_id);
    if (!glClassByGroupId.has(key)) glClassByGroupId.set(key, c);
  }
  return list.map((row) => {
    const role = row.default_role_id ? roleById.get(String(row.default_role_id)) || null : null;
    const glClass = glClassByGroupId.get(String(row.id)) || null;
    return {
      ...row,
      default_role_slug: role?.slug ?? row.default_role_slug ?? null,
      default_role_display_name: role?.display_name ?? row.default_role_display_name ?? null,
      default_role_rank: role?.rank != null ? Number(role.rank) : null,
      force_default_role: Number(row.force_default_role) !== 0,
      gl_class_id: glClass?.id ?? row.gl_class_id ?? null,
      gl_class_name: glClass?.name ?? null,
    };
  });
}

async function enrichGroupRow(row) {
  if (!row) return row;
  const [enriched] = await enrichGroupRows([row]);
  return enriched;
}

// O7 — Schéma zod du corps de POST / (création de groupe). Reproduit exactement la validation
// manuelle : normalisation permissive de chaque champ (`slugify(slug || name)`, `name` trimé,
// `description`/`parent_group_id` via `normalizeId`, `kind` via `normalizeKind`), puis les gardes 400
// dans l'ordre d'origine — `!slug || !name` → 'slug et name requis', sinon `!kind` →
// 'kind invalide (class|team|unit|club)'. Les messages restent au niveau racine (path vide) pour que
// `formatZodError` les renvoie tels quels. La vérification d'existence du parent (dépendante de la
// base) reste dans le handler, qui lit les champs normalisés depuis `req.body`.
const createGroupBodySchema = z
  .object({})
  .loose()
  .transform((b) => ({
    slug: slugify(b.slug || b.name),
    name: String(b.name || '').trim(),
    description: normalizeId(b.description),
    kind: normalizeKind(b.kind),
    parent_group_id: normalizeId(b.parent_group_id),
    default_role_id:
      b.default_role_id === undefined || b.default_role_id === null || b.default_role_id === ''
        ? null
        : b.default_role_id,
    force_default_role: b.force_default_role,
  }))
  .superRefine((d, ctx) => {
    if (!d.slug || !d.name)
      ctx.addIssue({ code: 'custom', message: 'slug et name requis', path: [] });
    else if (!d.kind)
      ctx.addIssue({ code: 'custom', message: 'kind invalide (class|team|unit|club)', path: [] });
  });

async function fetchGroupMembers(groupIds) {
  if (!groupIds.length) return new Map();
  const rows = await queryAll(
    `SELECT gm.group_id, gm.user_id, gm.user_type, u.is_active,
            r.slug AS role_slug, r.display_name AS role_display_name,
            COALESCE(NULLIF(u.display_name, ''), NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''), u.pseudo, u.email, u.id) AS user_label
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = u.user_type AND ur.is_primary = 1
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE gm.group_id IN (${groupIds.map(() => '?').join(',')})
      ORDER BY gm.group_id ASC, gm.user_type DESC, user_label ASC`,
    groupIds,
  );
  const byGroup = new Map();
  for (const row of rows) {
    if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, []);
    byGroup.get(row.group_id).push({
      user_id: row.user_id,
      user_type: row.user_type,
      user_label: row.user_label,
      is_active: Number(row.is_active) !== 0,
      role_slug: row.role_slug ?? null,
      role_display_name: row.role_display_name ?? null,
    });
  }
  return byGroup;
}

async function fetchGroupScopes(groupIds) {
  if (!groupIds.length) return new Map();
  const rows = await queryAll(
    `SELECT group_id, map_id, project_id
       FROM group_scopes
      WHERE group_id IN (${groupIds.map(() => '?').join(',')})
      ORDER BY group_id ASC, map_id ASC, project_id ASC`,
    groupIds,
  );
  const byGroup = new Map();
  for (const row of rows) {
    if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, []);
    byGroup.get(row.group_id).push({
      map_id: row.map_id || null,
      project_id: row.project_id || null,
    });
  }
  return byGroup;
}

function buildTree(rows) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (row.parent_group_id && byId.has(row.parent_group_id)) {
      byId.get(row.parent_group_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

router.use(requireAuth);

router.get(
  '/options',
  asyncHandler(async (req, res) => {
    const scopeGroupIds = await getUserAccessibleGroupIds(req.auth, { includeDescendants: true });
    const bypass = canBypassGroupScope(req.auth);
    if (!canReadGroups(req.auth) && scopeGroupIds.length === 0) {
      return res.json({ groups: [] });
    }
    const rows = await getAllGroups();
    const scoped = (
      bypass ? rows : rows.filter((r) => scopeGroupIds.includes(String(r.id)))
    ).filter((r) => Number(r.is_active) !== 0);
    res.json({
      groups: scoped.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        kind: g.kind,
        parent_group_id: g.parent_group_id || null,
        default_role_id: g.default_role_id ?? null,
        force_default_role: Number(g.force_default_role) !== 0,
      })),
    });
  }),
);

/**
 * F2-B — comptes « en attente de rattachement » : élèves actifs dont le rôle primaire est
 * encore `visiteur` **et qui n'appartiennent à aucun groupe actif**.
 *
 * Le rôle seul ne suffit pas à dire « en attente ». Un visiteur peut très bien être rattaché
 * — à une classe sans accès n3beur, à un club, à un groupe de visite — et rester visiteur
 * parce que c'est le profil voulu : il n'y a alors rien à rattacher, et il gonflait pourtant
 * la pastille d'alerte. Ce qui reste à traiter, c'est le compte qui s'est inscrit seul et
 * n'a encore **aucun** groupe.
 */
router.get(
  '/pending-visitors',
  requireGroupManagement,
  asyncHandler(async (req, res) => {
    const rows = await queryAll(
      `SELECT u.id, u.first_name, u.last_name, u.pseudo, u.email, u.created_at
         FROM users u
         JOIN user_roles ur ON ur.user_type = 'student' AND ur.user_id = u.id AND ur.is_primary = 1
         JOIN roles r ON r.id = ur.role_id AND r.slug = 'visiteur'
        WHERE u.user_type = 'student' AND u.is_active = 1
          AND NOT EXISTS (
            SELECT 1
              FROM group_members gm
              INNER JOIN \`groups\` g ON g.id = gm.group_id
             WHERE gm.user_id = u.id
               AND gm.user_type = 'student'
               AND g.is_active = 1
          )
        ORDER BY u.created_at DESC
        LIMIT 500`,
    );
    res.json(rows);
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const canRead = canReadGroups(req.auth);
    const canManage = canManageGroups(req.auth);
    const scopeGroupIds = await getUserAccessibleGroupIds(req.auth, { includeDescendants: true });
    const bypass = canBypassGroupScope(req.auth);
    if (!canRead && scopeGroupIds.length === 0) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }

    const rows = await getAllGroups();
    const visibleRows = bypass
      ? rows
      : rows.filter((row) => scopeGroupIds.includes(String(row.id)));
    const ids = visibleRows.map((row) => String(row.id));
    const [membersByGroup, scopesByGroup] = await Promise.all([
      fetchGroupMembers(ids),
      fetchGroupScopes(ids),
    ]);

    const enrichedRows = await enrichGroupRows(visibleRows);
    const list = enrichedRows.map((enriched, i) => ({
      ...enriched,
      parent_group_id: enriched.parent_group_id || null,
      is_active: Number(enriched.is_active) !== 0,
      members: membersByGroup.get(visibleRows[i].id) || [],
      scopes: scopesByGroup.get(visibleRows[i].id) || [],
    }));
    res.json({
      can_manage: canManage,
      // Seuls l'administrateur et le n3boss règlent le profil par défaut / l'imposition.
      can_manage_default_role: canManage && canManageGroupDefaultRole(req.auth),
      groups: list,
      tree: buildTree(list),
    });
  }),
);

router.post(
  '/',
  requireGroupManagement,
  validate({ body: createGroupBodySchema }),
  asyncHandler(async (req, res) => {
    const { slug, name, description, kind, parent_group_id: parentGroupId } = req.body;
    const roleCheck = await validateGroupDefaultRole(req.auth, req.body?.default_role_id);
    if (!roleCheck.ok) return res.status(roleCheck.status).json({ error: roleCheck.error });
    const defaultRoleId = roleCheck.roleId;
    const forceDefaultRole = parseBooleanFlag(req.body?.force_default_role, false);
    if (forceDefaultRole && !canManageGroupDefaultRole(req.auth)) {
      return res
        .status(403)
        .json({ error: 'Seuls un administrateur ou un n3boss imposent un profil' });
    }
    const forceError = forceDefaultRoleError(forceDefaultRole, defaultRoleId);
    if (forceError) return res.status(400).json({ error: forceError });
    if (parentGroupId) {
      const parent = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [
        parentGroupId,
      ]);
      if (!parent) return res.status(400).json({ error: 'parent_group_id introuvable' });
      if (!(await isGroupInManageScope(req.auth, parentGroupId))) {
        return res.status(403).json({ error: 'Groupe hors périmètre' });
      }
    } else if (!canBypassGroupScope(req.auth)) {
      return res.status(403).json({
        error:
          'Sans vue globale, créez uniquement un sous-groupe d’une classe déjà dans votre périmètre',
      });
    }
    const id = crypto.randomUUID();
    try {
      await execute(
        `INSERT INTO \`groups\` (id, slug, name, description, kind, parent_group_id, default_role_id, force_default_role, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          id,
          slug,
          name,
          description,
          kind,
          parentGroupId,
          defaultRoleId,
          forceDefaultRole ? 1 : 0,
          normalizeId(req.auth?.userId),
        ],
      );
    } catch (err) {
      rethrowSlugConflict(err);
    }
    const created = await enrichGroupRow(
      await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]),
    );
    res.status(201).json(created);
  }),
);

router.get(
  '/import/template',
  requireGroupManagement,
  asyncHandler(async (req, res) => {
    const {
      GROUP_TEMPLATE_COLUMNS,
      buildGroupTemplateWorkbookRows,
      csvEscape,
    } = require('../lib/groupImport');
    const { buildWorkbookBuffer, jsonRowsToAoa } = require('../lib/spreadsheet');
    const format = String(req.query?.format || 'csv')
      .trim()
      .toLowerCase();
    const rows = buildGroupTemplateWorkbookRows();
    if (format === 'xlsx') {
      const aoa = jsonRowsToAoa(rows, GROUP_TEMPLATE_COLUMNS);
      const buffer = await buildWorkbookBuffer([{ name: 'groupes', aoa }]);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-groupes.xlsx"');
      return res.send(buffer);
    }
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Format invalide (csv ou xlsx)' });
    }
    const BOM = '\uFEFF';
    const header = GROUP_TEMPLATE_COLUMNS.map(csvEscape).join(';');
    const lines = rows.map((row) =>
      GROUP_TEMPLATE_COLUMNS.map((col) => csvEscape(row[col])).join(';'),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-groupes.csv"');
    res.send(`${BOM}${header}\r\n${lines.join('\r\n')}\r\n`);
  }),
);

router.post(
  '/import',
  requireGroupManagement,
  asyncHandler(async (req, res) => {
    const { resolveImportRowsFromBody, importGroupsFromRows } = require('../lib/groupImport');
    const dryRun = !!req.body?.dryRun;
    let rawRows;
    try {
      rawRows = await resolveImportRowsFromBody(req.body || {});
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Fichier invalide' });
    }
    try {
      const report = await importGroupsFromRows(req.auth, rawRows, { dryRun });
      if (!dryRun && report.totals.created > 0) {
        logAudit('groups_import', 'group', null, `Import de ${report.totals.created} groupe(s)`, {
          req,
          payload: { report: report.totals },
        });
      }
      res.json({ report });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Import impossible' });
    }
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const id = normalizeId(req.params.id);
    const group = await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!(await isGroupInManageScope(req.auth, id))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }

    const slug = req.body?.slug !== undefined ? slugify(req.body.slug) : group.slug;
    const name = req.body?.name !== undefined ? String(req.body.name || '').trim() : group.name;
    const description =
      req.body?.description !== undefined ? normalizeId(req.body.description) : group.description;
    const kind = req.body?.kind !== undefined ? normalizeKind(req.body.kind) : group.kind;
    const parentGroupId =
      req.body?.parent_group_id !== undefined
        ? normalizeId(req.body.parent_group_id)
        : group.parent_group_id;
    const isActive =
      req.body?.is_active !== undefined
        ? req.body.is_active
          ? 1
          : 0
        : Number(group.is_active) !== 0
          ? 1
          : 0;
    let defaultRoleId = group.default_role_id ?? null;
    const roleRequested =
      req.body?.default_role_id !== undefined &&
      String(req.body.default_role_id ?? '') !== String(group.default_role_id ?? '');
    if (roleRequested) {
      const roleCheck = await validateGroupDefaultRole(req.auth, req.body.default_role_id);
      if (!roleCheck.ok) return res.status(roleCheck.status).json({ error: roleCheck.error });
      defaultRoleId = roleCheck.roleId;
      if (defaultRoleId == null && !canManageGroupDefaultRole(req.auth)) {
        return res.status(403).json({
          error: 'Seuls un administrateur ou un n3boss règlent le profil par défaut d’un groupe',
        });
      }
    }
    const forceDefaultRole =
      req.body?.force_default_role !== undefined
        ? parseBooleanFlag(req.body.force_default_role, false)
        : Number(group.force_default_role) !== 0;
    if (
      forceDefaultRole !== (Number(group.force_default_role) !== 0) &&
      !canManageGroupDefaultRole(req.auth)
    ) {
      return res
        .status(403)
        .json({ error: 'Seuls un administrateur ou un n3boss imposent un profil' });
    }
    const forceError = forceDefaultRoleError(forceDefaultRole, defaultRoleId);
    if (forceError) return res.status(400).json({ error: forceError });
    if (!slug || !name) return res.status(400).json({ error: 'slug et name requis' });
    if (!kind) return res.status(400).json({ error: 'kind invalide (class|team|unit|club)' });
    if (parentGroupId && parentGroupId === id)
      return res.status(400).json({ error: 'Un groupe ne peut pas être son propre parent' });
    if (parentGroupId) {
      const parent = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [
        parentGroupId,
      ]);
      if (!parent) return res.status(400).json({ error: 'parent_group_id introuvable' });
      // Comme à la création : on ne rattache un groupe qu'à un parent de son périmètre.
      if (
        String(parentGroupId) !== String(group.parent_group_id || '') &&
        !(await isGroupInManageScope(req.auth, parentGroupId))
      ) {
        return res.status(403).json({ error: 'Groupe parent hors périmètre' });
      }
      // Refuser les cycles : si `id` figure dans la chaîne d'ancêtres du nouveau parent,
      // le groupe deviendrait son propre ancêtre (les deux sortiraient de l'arbre
      // et chacun élargirait le périmètre de l'autre).
      const visited = new Set();
      let cursor = parentGroupId;
      while (cursor) {
        if (cursor === id) {
          return res
            .status(400)
            .json({ error: 'Parenté circulaire interdite (le groupe serait son propre ancêtre)' });
        }
        if (visited.has(cursor)) break;
        visited.add(cursor);
        const row = await queryOne('SELECT parent_group_id FROM `groups` WHERE id = ? LIMIT 1', [
          cursor,
        ]);
        cursor = row?.parent_group_id ? normalizeId(row.parent_group_id) : null;
      }
    }

    try {
      await execute(
        `UPDATE \`groups\`
          SET slug = ?, name = ?, description = ?, kind = ?, parent_group_id = ?,
              default_role_id = ?, force_default_role = ?,
              is_active = ?, updated_at = NOW()
        WHERE id = ?`,
        [
          slug,
          name,
          description,
          kind,
          parentGroupId,
          defaultRoleId,
          forceDefaultRole ? 1 : 0,
          isActive,
          id,
        ],
      );
    } catch (err) {
      rethrowSlugConflict(err);
    }

    // Profil par défaut, imposition ou activité modifiés : le profil effectif des membres est
    // recalculé tout de suite (« le plus élevé l'emporte »), sans attendre leur prochain
    // `GET /api/auth/me`. Plus de bouton « Appliquer à tous les membres » : le réglage suffit.
    const membersAffected =
      String(group.default_role_id ?? '') !== String(defaultRoleId ?? '') ||
      (Number(group.force_default_role) !== 0) !== forceDefaultRole ||
      (Number(group.is_active) !== 0 ? 1 : 0) !== isActive;
    const applied = membersAffected
      ? (await recomputeGroupMembersRoles(id)).filter((r) => r.changed).length
      : 0;

    const updated = await enrichGroupRow(
      await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]),
    );
    res.json(membersAffected ? { ...updated, roles_recomputed: applied } : updated);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const id = normalizeId(req.params.id);
    const group = await queryOne('SELECT id, name FROM `groups` WHERE id = ? LIMIT 1', [id]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!(await isGroupInManageScope(req.auth, id))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    // Membres relevés AVANT la suppression (cascade group_members) pour recalculer leur
    // profil effectif ensuite ; sinon un membre garde un profil issu du groupe supprimé
    // jusqu'à sa prochaine requête /api/auth/me.
    const studentMembers = await queryAll(
      `SELECT DISTINCT gm.user_id FROM group_members gm WHERE gm.group_id = ?`,
      [id],
    );
    // Suppression atomique + détachement des références sans FK. `tasks.group_id`,
    // `forum_threads.group_id` et `observation_logs.group_id` ne portent aucune contrainte
    // vers `groups` : sans ce NULLage, ils restaient rattachés à un groupe fantôme après la
    // suppression (effets de filtrage/visibilité). Le tout dans une transaction : le
    // détachement des sous-groupes et la suppression ne peuvent plus diverger.
    await withTransaction(async (tx) => {
      await tx.execute('UPDATE tasks SET group_id = NULL WHERE group_id = ?', [id]);
      await tx.execute('UPDATE forum_threads SET group_id = NULL WHERE group_id = ?', [id]);
      await tx.execute('UPDATE observation_logs SET group_id = NULL WHERE group_id = ?', [id]);
      await tx.execute('UPDATE `groups` SET parent_group_id = NULL WHERE parent_group_id = ?', [
        id,
      ]);
      await tx.execute('DELETE FROM `groups` WHERE id = ?', [id]);
    });
    await recomputeUsersRoles(studentMembers.map((row) => row.user_id));
    await logAudit('delete_group', 'group', id, `Suppression groupe ${group.name || id}`, {
      req,
      payload: { name: group.name || null, student_members: studentMembers.length },
    });
    res.json({ ok: true });
  }),
);

router.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const groupId = normalizeId(req.params.id);
    if (!(await isGroupInManageScope(req.auth, groupId))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const membersByGroup = await fetchGroupMembers([groupId]);
    res.json({ members: membersByGroup.get(groupId) || [] });
  }),
);

router.put(
  '/:id/members',
  asyncHandler(async (req, res) => {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const groupId = normalizeId(req.params.id);
    const group = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [groupId]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!(await isGroupInManageScope(req.auth, groupId))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }

    // `manager_user_ids` (ancien « responsable ») est encore accepté et fusionné : le rôle de
    // membre n'a plus d'existence, le périmètre d'un enseignant est son appartenance.
    const memberUserIds = uniqueStrings([
      ...(req.body?.member_user_ids || []),
      ...(req.body?.manager_user_ids || []),
    ]);
    const scopeMapIds = uniqueStrings(req.body?.scope_map_ids || []);
    const scopeProjectIds = uniqueStrings(req.body?.scope_project_ids || []);
    const allUserIds = memberUserIds;
    const previousMembers = await queryAll('SELECT user_id FROM group_members WHERE group_id = ?', [
      groupId,
    ]);

    if (allUserIds.length > 0) {
      const rows = await queryAll(
        `SELECT id, user_type
         FROM users
        WHERE id IN (${allUserIds.map(() => '?').join(',')})
          AND is_active = 1`,
        allUserIds,
      );
      const byId = new Map(rows.map((r) => [String(r.id), r]));
      for (const userId of allUserIds) {
        if (!byId.has(userId))
          return res.status(400).json({ error: `Utilisateur introuvable: ${userId}` });
      }
    }

    if (scopeMapIds.length > 0) {
      const rows = await queryAll(
        `SELECT id FROM maps WHERE id IN (${scopeMapIds.map(() => '?').join(',')})`,
        scopeMapIds,
      );
      const existing = new Set(rows.map((r) => String(r.id)));
      for (const mapId of scopeMapIds) {
        if (!existing.has(mapId))
          return res.status(400).json({ error: `Carte introuvable: ${mapId}` });
      }
    }

    if (scopeProjectIds.length > 0) {
      const rows = await queryAll(
        `SELECT id FROM task_projects WHERE id IN (${scopeProjectIds.map(() => '?').join(',')})`,
        scopeProjectIds,
      );
      const existing = new Set(rows.map((r) => String(r.id)));
      for (const projectId of scopeProjectIds) {
        if (!existing.has(projectId))
          return res.status(400).json({ error: `Projet introuvable: ${projectId}` });
      }
    }

    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM group_members WHERE group_id = ?', [groupId]);
      // Resout les `user_type` des membres ET managers en UNE requete (au lieu d'un SELECT par
      // utilisateur), puis insere chaque groupe de roles en UNE requete multi-valeurs (au lieu
      // d'une boucle N+1). Les utilisateurs introuvables sont ignores, comme la version par boucle.
      const userTypeById = new Map();
      if (memberUserIds.length > 0) {
        const userRows = await tx.queryAll(
          `SELECT id, user_type FROM users WHERE id IN (${memberUserIds.map(() => '?').join(',')})`,
          memberUserIds,
        );
        for (const row of userRows) userTypeById.set(String(row.id), row.user_type);
      }

      const memberRows = memberUserIds.filter((userId) => userTypeById.has(String(userId)));
      if (memberRows.length > 0) {
        const placeholders = memberRows.map(() => '(?, ?, ?)').join(', ');
        const params = [];
        for (const userId of memberRows)
          params.push(groupId, userId, userTypeById.get(String(userId)));
        await tx.execute(
          `INSERT INTO group_members (group_id, user_id, user_type) VALUES ${placeholders}`,
          params,
        );
      }

      await tx.execute('DELETE FROM group_scopes WHERE group_id = ?', [groupId]);
      if (scopeMapIds.length > 0) {
        const placeholders = scopeMapIds.map(() => '(?, ?, NULL)').join(', ');
        const params = [];
        for (const mapId of scopeMapIds) params.push(groupId, mapId);
        await tx.execute(
          `INSERT INTO group_scopes (group_id, map_id, project_id) VALUES ${placeholders}`,
          params,
        );
      }
      if (scopeProjectIds.length > 0) {
        const placeholders = scopeProjectIds.map(() => '(?, NULL, ?)').join(', ');
        const params = [];
        for (const projectId of scopeProjectIds) params.push(groupId, projectId);
        await tx.execute(
          `INSERT INTO group_scopes (group_id, map_id, project_id) VALUES ${placeholders}`,
          params,
        );
      }
    });

    // Membres ajoutés **et** retirés : les deux voient leur profil effectif recalculé.
    await recomputeUsersRoles([...memberUserIds, ...previousMembers.map((row) => row.user_id)]);

    const [membersByGroup, scopesByGroup] = await Promise.all([
      fetchGroupMembers([groupId]),
      fetchGroupScopes([groupId]),
    ]);
    res.json({
      group_id: groupId,
      members: membersByGroup.get(groupId) || [],
      scopes: scopesByGroup.get(groupId) || [],
    });
  }),
);

/**
 * F2-A — code de classe : génération (rotation) ou suppression du code d'inscription
 * d'un groupe. Codes lisibles sans ambiguïté (pas de 0/O/1/I), unicité garantie en base.
 */
router.post(
  '/:id/class-code',
  requireGroupManagement,
  asyncHandler(async (req, res) => {
    const id = normalizeId(req.params.id);
    const group = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [id]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!(await isGroupInManageScope(req.auth, id))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const action = String(req.body?.action || 'generate');
    if (action === 'clear') {
      await execute('UPDATE `groups` SET class_code = NULL, updated_at = NOW() WHERE id = ?', [id]);
      return res.json({ ok: true, class_code: null });
    }
    if (action !== 'generate') {
      return res.status(400).json({ error: "Action attendue: 'generate' ou 'clear'" });
    }
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = Array.from(crypto.randomBytes(8))
        .map((b) => alphabet[b % alphabet.length])
        .join('');
      try {
        await execute('UPDATE `groups` SET class_code = ?, updated_at = NOW() WHERE id = ?', [
          code,
          id,
        ]);
        return res.json({ ok: true, class_code: code });
      } catch (err) {
        if (err?.code !== 'ER_DUP_ENTRY') throw err; // collision improbable : on retire
      }
    }
    return res.status(500).json({ error: 'Génération du code impossible, réessayer' });
  }),
);

/**
 * Rattachement **en lot** d'élèves à un groupe (P2 / P14 de l'audit UX) — utilisé par la
 * barre d'actions groupées de l'onglet Comptes et par la fiche utilisateur.
 *
 * Déclarée avant `/:id/members/:userId` : `bulk` est un segment littéral que la route
 * paramétrée absorberait sinon (elle le prendrait pour un `userId`).
 *
 * Chaque élève passe par `addStudentToGroup` — mêmes contrôles et même resynchronisation de
 * rôle que le rattachement unitaire. Un échec n'annule pas les autres : la réponse détaille
 * chaque ligne.
 */
const BULK_MEMBERS_MAX = 200;

router.post(
  '/:id/members/bulk',
  requireGroupManagement,
  asyncHandler(async (req, res) => {
    const groupId = normalizeId(req.params.id);
    if (!groupId) return res.status(400).json({ error: 'Identifiant de groupe requis' });
    const userIds = Array.isArray(req.body?.user_ids) ? req.body.user_ids : null;
    if (!userIds || userIds.length === 0) {
      return res.status(400).json({ error: 'user_ids[] requis (non vide)' });
    }
    if (userIds.length > BULK_MEMBERS_MAX) {
      return res
        .status(400)
        .json({ error: `user_ids[] limité à ${BULK_MEMBERS_MAX} comptes par appel` });
    }
    if (!(await isGroupInManageScope(req.auth, groupId))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }

    const results = [];
    for (const raw of userIds) {
      const userId = normalizeId(raw);
      if (!userId) {
        results.push({ user_id: String(raw ?? ''), ok: false, error: 'Identifiant invalide' });
        continue;
      }
      const result = await addUserToGroup(userId, groupId);
      results.push(
        result.ok
          ? { user_id: userId, ok: true }
          : { user_id: userId, ok: false, error: result.error },
      );
    }
    const added = results.filter((r) => r.ok).length;
    logAudit('groups_add_members_bulk', 'group', groupId, `${added}/${results.length}`, { req });
    res.json({ ok: true, group_id: groupId, added, failed: results.length - added, results });
  }),
);

/**
 * Retrait unitaire d'un membre — symétrique du `POST /:id/members/:userId`. Sans lui, corriger
 * un rattachement depuis la fiche utilisateur imposait de réécrire toute la liste des membres
 * via `PUT /:id/members` (et donc de la connaître entièrement).
 */
router.delete(
  '/:id/members/:userId',
  requireGroupManagement,
  asyncHandler(async (req, res) => {
    const groupId = normalizeId(req.params.id);
    const userId = normalizeId(req.params.userId);
    if (!groupId || !userId) return res.status(400).json({ error: 'Identifiants requis' });
    if (!(await isGroupInManageScope(req.auth, groupId))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const removed = await removeUserFromGroup(userId, groupId);
    if (!removed.ok) return res.status(removed.status).json({ error: removed.error });
    logAudit('groups_remove_member', 'group', groupId, userId, { req });
    res.json({ ok: true, group_id: groupId, user_id: userId });
  }),
);

/** F2-B — rattachement unitaire d'un élève à un groupe (un clic côté prof). */
router.post(
  '/:id/members/:userId',
  requireGroupManagement,
  asyncHandler(async (req, res) => {
    const groupId = normalizeId(req.params.id);
    const userId = normalizeId(req.params.userId);
    if (!groupId || !userId) return res.status(400).json({ error: 'Identifiants requis' });
    if (!(await isGroupInManageScope(req.auth, groupId))) {
      return res.status(403).json({ error: 'Groupe hors périmètre' });
    }
    const result = await addUserToGroup(userId, groupId);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ ok: true, group_id: groupId, user_id: userId, role: result.role });
  }),
);

module.exports = router;
// Exporté pour le test no-DB du contrat de validation O7.
module.exports.createGroupBodySchema = createGroupBodySchema;
