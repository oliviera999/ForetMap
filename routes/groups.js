const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const {
  normalizeId,
  canReadGroups,
  canManageGroups,
  getAllGroups,
  getUserAccessibleGroupIds,
} = require('../lib/groupScope');
const { z, validate } = require('../lib/validate');
const {
  getAllowedGroupDefaultRole,
  syncStudentRoleFromGroups,
  syncStudentRolesForGroupMembers,
} = require('../lib/groupRole');

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

/** Traduit un conflit d'unicité MySQL (slug déjà pris) en erreur HTTP 409 portée par `.status`. */
function rethrowSlugConflict(err) {
  if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
    const conflict = new Error('Slug déjà utilisé');
    conflict.status = 409;
    throw conflict;
  }
  throw err;
}

function normalizeSlug(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || null;
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

async function validateDefaultRoleId(roleId) {
  const normalized = roleId == null || roleId === '' ? null : Number(roleId);
  if (normalized == null) return null;
  if (!Number.isFinite(normalized) || normalized <= 0) return false;
  const row = await getAllowedGroupDefaultRole(normalized);
  return row ? normalized : false;
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
          `SELECT id, slug, display_name FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`,
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
      grants_n3beur_access: Number(row.grants_n3beur_access) !== 0,
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
// manuelle : normalisation permissive de chaque champ (`normalizeSlug(slug || name)`, `name` trimé,
// `description`/`parent_group_id` via `normalizeId`, `kind` via `normalizeKind`), puis les gardes 400
// dans l'ordre d'origine — `!slug || !name` → 'slug et name requis', sinon `!kind` →
// 'kind invalide (class|team|unit|club)'. Les messages restent au niveau racine (path vide) pour que
// `formatZodError` les renvoie tels quels. La vérification d'existence du parent (dépendante de la
// base) reste dans le handler, qui lit les champs normalisés depuis `req.body`.
const createGroupBodySchema = z
  .object({})
  .loose()
  .transform((b) => ({
    slug: normalizeSlug(b.slug || b.name),
    name: String(b.name || '').trim(),
    description: normalizeId(b.description),
    kind: normalizeKind(b.kind),
    parent_group_id: normalizeId(b.parent_group_id),
    default_role_id:
      b.default_role_id === undefined || b.default_role_id === null || b.default_role_id === ''
        ? null
        : b.default_role_id,
    grants_n3beur_access: b.grants_n3beur_access,
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
    `SELECT gm.group_id, gm.user_id, gm.user_type, gm.role_in_group,
            COALESCE(NULLIF(u.display_name, ''), NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''), u.pseudo, u.email, u.id) AS user_label
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id IN (${groupIds.map(() => '?').join(',')})
      ORDER BY gm.group_id ASC, gm.role_in_group DESC, user_label ASC`,
    groupIds,
  );
  const byGroup = new Map();
  for (const row of rows) {
    if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, []);
    byGroup.get(row.group_id).push({
      user_id: row.user_id,
      user_type: row.user_type,
      role_in_group: row.role_in_group,
      user_label: row.user_label,
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
    if (!canReadGroups(req.auth) && scopeGroupIds.length === 0) {
      return res.json({ groups: [] });
    }
    const rows = await getAllGroups();
    const scoped = canReadGroups(req.auth)
      ? rows.filter((r) => Number(r.is_active) !== 0)
      : rows.filter((r) => scopeGroupIds.includes(String(r.id)) && Number(r.is_active) !== 0);
    res.json({
      groups: scoped.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
        kind: g.kind,
        parent_group_id: g.parent_group_id || null,
        default_role_id: g.default_role_id ?? null,
        grants_n3beur_access: Number(g.grants_n3beur_access) !== 0,
      })),
    });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const canRead = canReadGroups(req.auth);
    const canManage = canManageGroups(req.auth);
    const scopeGroupIds = await getUserAccessibleGroupIds(req.auth, { includeDescendants: true });
    if (!canRead && scopeGroupIds.length === 0) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }

    const rows = await getAllGroups();
    const visibleRows = canRead
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
    const defaultRoleId = await validateDefaultRoleId(req.body?.default_role_id);
    if (defaultRoleId === false) {
      return res.status(400).json({ error: 'default_role_id invalide' });
    }
    const grantsN3beur = parseBooleanFlag(req.body?.grants_n3beur_access, false);
    if (parentGroupId) {
      const parent = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [
        parentGroupId,
      ]);
      if (!parent) return res.status(400).json({ error: 'parent_group_id introuvable' });
    }
    const id = uuidv4();
    try {
      await execute(
        `INSERT INTO \`groups\` (id, slug, name, description, kind, parent_group_id, default_role_id, grants_n3beur_access, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          id,
          slug,
          name,
          description,
          kind,
          parentGroupId,
          defaultRoleId,
          grantsN3beur ? 1 : 0,
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

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const id = normalizeId(req.params.id);
    const group = await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });

    const slug = req.body?.slug !== undefined ? normalizeSlug(req.body.slug) : group.slug;
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
    const defaultRoleId =
      req.body?.default_role_id !== undefined
        ? await validateDefaultRoleId(req.body.default_role_id)
        : group.default_role_id;
    if (defaultRoleId === false) {
      return res.status(400).json({ error: 'default_role_id invalide' });
    }
    const grantsN3beur =
      req.body?.grants_n3beur_access !== undefined
        ? parseBooleanFlag(req.body.grants_n3beur_access, false)
        : Number(group.grants_n3beur_access) !== 0;
    if (!slug || !name) return res.status(400).json({ error: 'slug et name requis' });
    if (!kind) return res.status(400).json({ error: 'kind invalide (class|team|unit|club)' });
    if (parentGroupId && parentGroupId === id)
      return res.status(400).json({ error: 'Un groupe ne peut pas être son propre parent' });
    if (parentGroupId) {
      const parent = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [
        parentGroupId,
      ]);
      if (!parent) return res.status(400).json({ error: 'parent_group_id introuvable' });
    }

    try {
      await execute(
        `UPDATE \`groups\`
          SET slug = ?, name = ?, description = ?, kind = ?, parent_group_id = ?,
              default_role_id = ?, grants_n3beur_access = ?, is_active = ?, updated_at = NOW()
        WHERE id = ?`,
        [
          slug,
          name,
          description,
          kind,
          parentGroupId,
          defaultRoleId,
          grantsN3beur ? 1 : 0,
          isActive,
          id,
        ],
      );
    } catch (err) {
      rethrowSlugConflict(err);
    }
    const updated = await enrichGroupRow(
      await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]),
    );
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const id = normalizeId(req.params.id);
    const group = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [id]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    await execute('UPDATE `groups` SET parent_group_id = NULL WHERE parent_group_id = ?', [id]);
    await execute('DELETE FROM `groups` WHERE id = ?', [id]);
    res.json({ ok: true });
  }),
);

router.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const groupId = normalizeId(req.params.id);
    const scopeGroupIds = await getUserAccessibleGroupIds(req.auth, { includeDescendants: true });
    const canRead = canReadGroups(req.auth);
    if (!canRead && !scopeGroupIds.includes(groupId)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const rows = await queryAll(
      `SELECT gm.group_id, gm.user_id, gm.user_type, gm.role_in_group,
            COALESCE(NULLIF(u.display_name, ''), NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''), u.pseudo, u.email, u.id) AS user_label
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY gm.role_in_group DESC, user_label ASC`,
      [groupId],
    );
    res.json({ members: rows });
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

    const memberUserIds = uniqueStrings(req.body?.member_user_ids || []);
    const managerUserIds = uniqueStrings(req.body?.manager_user_ids || []);
    const scopeMapIds = uniqueStrings(req.body?.scope_map_ids || []);
    const scopeProjectIds = uniqueStrings(req.body?.scope_project_ids || []);
    const allUserIds = uniqueStrings([...memberUserIds, ...managerUserIds]);

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
      const allMemberIds = [...new Set([...memberUserIds, ...managerUserIds])];
      const userTypeById = new Map();
      if (allMemberIds.length > 0) {
        const userRows = await tx.queryAll(
          `SELECT id, user_type FROM users WHERE id IN (${allMemberIds.map(() => '?').join(',')})`,
          allMemberIds,
        );
        for (const row of userRows) userTypeById.set(String(row.id), row.user_type);
      }

      const memberRows = memberUserIds.filter((userId) => userTypeById.has(String(userId)));
      if (memberRows.length > 0) {
        const placeholders = memberRows.map(() => "(?, ?, ?, 'member')").join(', ');
        const params = [];
        for (const userId of memberRows)
          params.push(groupId, userId, userTypeById.get(String(userId)));
        await tx.execute(
          `INSERT INTO group_members (group_id, user_id, user_type, role_in_group) VALUES ${placeholders}`,
          params,
        );
      }

      const managerRows = managerUserIds.filter((userId) => userTypeById.has(String(userId)));
      if (managerRows.length > 0) {
        const placeholders = managerRows.map(() => "(?, ?, ?, 'manager')").join(', ');
        const params = [];
        for (const userId of managerRows)
          params.push(groupId, userId, userTypeById.get(String(userId)));
        await tx.execute(
          `INSERT INTO group_members (group_id, user_id, user_type, role_in_group) VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE role_in_group = 'manager'`,
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

    const affectedStudentIds = uniqueStrings([...memberUserIds, ...managerUserIds]);
    if (affectedStudentIds.length > 0) {
      const studentRows = await queryAll(
        `SELECT id FROM users WHERE id IN (${affectedStudentIds.map(() => '?').join(',')})
           AND user_type = 'student' AND is_active = 1`,
        affectedStudentIds,
      );
      for (const row of studentRows) {
        await syncStudentRoleFromGroups(row.id);
      }
    }

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

router.post(
  '/:id/apply-default-role',
  asyncHandler(async (req, res) => {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const groupId = normalizeId(req.params.id);
    const group = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [groupId]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });

    const results = await syncStudentRolesForGroupMembers(groupId, {
      force: true,
      groupId,
    });
    res.json({
      group_id: groupId,
      applied: results.filter((r) => r.changed).length,
      results,
    });
  }),
);

module.exports = router;
// Exporté pour le test no-DB du contrat de validation O7.
module.exports.createGroupBodySchema = createGroupBodySchema;
