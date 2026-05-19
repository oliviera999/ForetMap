const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requireAuth } = require('../middleware/requireTeacher');
const { logRouteError, respondInternalError } = require('../lib/routeLog');
const {
  normalizeId,
  canReadGroups,
  canManageGroups,
  getAllGroups,
  getUserAccessibleGroupIds,
} = require('../lib/groupScope');

const router = express.Router();

function normalizeSlug(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || null;
}

function normalizeKind(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'class';
  if (['class', 'team', 'unit', 'club'].includes(raw)) return raw;
  return null;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

async function fetchGroupMembers(groupIds) {
  if (!groupIds.length) return new Map();
  const rows = await queryAll(
    `SELECT gm.group_id, gm.user_id, gm.user_type, gm.role_in_group,
            COALESCE(NULLIF(u.display_name, ''), NULLIF(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')), ''), u.pseudo, u.email, u.id) AS user_label
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id IN (${groupIds.map(() => '?').join(',')})
      ORDER BY gm.group_id ASC, gm.role_in_group DESC, user_label ASC`,
    groupIds
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
    groupIds
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

router.get('/options', async (req, res) => {
  try {
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
      })),
    });
  } catch (err) {
    respondInternalError(res, req, err);
  }
});

router.get('/', async (req, res) => {
  try {
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

    const list = visibleRows.map((row) => ({
      ...row,
      parent_group_id: row.parent_group_id || null,
      is_active: Number(row.is_active) !== 0,
      members: membersByGroup.get(row.id) || [],
      scopes: scopesByGroup.get(row.id) || [],
    }));
    res.json({
      can_manage: canManage,
      groups: list,
      tree: buildTree(list),
    });
  } catch (err) {
    respondInternalError(res, req, err);
  }
});

router.post('/', async (req, res) => {
  try {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const slug = normalizeSlug(req.body?.slug || req.body?.name);
    const name = String(req.body?.name || '').trim();
    const description = normalizeId(req.body?.description);
    const kind = normalizeKind(req.body?.kind);
    const parentGroupId = normalizeId(req.body?.parent_group_id);
    if (!slug || !name) return res.status(400).json({ error: 'slug et name requis' });
    if (!kind) return res.status(400).json({ error: 'kind invalide (class|team|unit|club)' });
    if (parentGroupId) {
      const parent = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [parentGroupId]);
      if (!parent) return res.status(400).json({ error: 'parent_group_id introuvable' });
    }
    const id = uuidv4();
    await execute(
      `INSERT INTO \`groups\` (id, slug, name, description, kind, parent_group_id, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, slug, name, description, kind, parentGroupId, normalizeId(req.auth?.userId)]
    );
    const created = await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]);
    res.status(201).json(created);
  } catch (err) {
    if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'Slug déjà utilisé' });
    }
    respondInternalError(res, req, err);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const id = normalizeId(req.params.id);
    const group = await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });

    const slug = req.body?.slug !== undefined ? normalizeSlug(req.body.slug) : group.slug;
    const name = req.body?.name !== undefined ? String(req.body.name || '').trim() : group.name;
    const description = req.body?.description !== undefined ? normalizeId(req.body.description) : group.description;
    const kind = req.body?.kind !== undefined ? normalizeKind(req.body.kind) : group.kind;
    const parentGroupId = req.body?.parent_group_id !== undefined ? normalizeId(req.body.parent_group_id) : group.parent_group_id;
    const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : Number(group.is_active) !== 0 ? 1 : 0;
    if (!slug || !name) return res.status(400).json({ error: 'slug et name requis' });
    if (!kind) return res.status(400).json({ error: 'kind invalide (class|team|unit|club)' });
    if (parentGroupId && parentGroupId === id) return res.status(400).json({ error: 'Un groupe ne peut pas être son propre parent' });
    if (parentGroupId) {
      const parent = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [parentGroupId]);
      if (!parent) return res.status(400).json({ error: 'parent_group_id introuvable' });
    }

    await execute(
      `UPDATE \`groups\`
          SET slug = ?, name = ?, description = ?, kind = ?, parent_group_id = ?, is_active = ?, updated_at = NOW()
        WHERE id = ?`,
      [slug, name, description, kind, parentGroupId, isActive, id]
    );
    const updated = await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [id]);
    res.json(updated);
  } catch (err) {
    if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'Slug déjà utilisé' });
    }
    respondInternalError(res, req, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!canManageGroups(req.auth)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    const id = normalizeId(req.params.id);
    const group = await queryOne('SELECT id FROM `groups` WHERE id = ? LIMIT 1', [id]);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    await execute('UPDATE `groups` SET parent_group_id = NULL WHERE parent_group_id = ?', [id]);
    await execute('DELETE FROM `groups` WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    respondInternalError(res, req, err);
  }
});

router.get('/:id/members', async (req, res) => {
  try {
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
      [groupId]
    );
    res.json({ members: rows });
  } catch (err) {
    respondInternalError(res, req, err);
  }
});

router.put('/:id/members', async (req, res) => {
  try {
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
        allUserIds
      );
      const byId = new Map(rows.map((r) => [String(r.id), r]));
      for (const userId of allUserIds) {
        if (!byId.has(userId)) return res.status(400).json({ error: `Utilisateur introuvable: ${userId}` });
      }
    }

    if (scopeMapIds.length > 0) {
      const rows = await queryAll(`SELECT id FROM maps WHERE id IN (${scopeMapIds.map(() => '?').join(',')})`, scopeMapIds);
      const existing = new Set(rows.map((r) => String(r.id)));
      for (const mapId of scopeMapIds) {
        if (!existing.has(mapId)) return res.status(400).json({ error: `Carte introuvable: ${mapId}` });
      }
    }

    if (scopeProjectIds.length > 0) {
      const rows = await queryAll(
        `SELECT id FROM task_projects WHERE id IN (${scopeProjectIds.map(() => '?').join(',')})`,
        scopeProjectIds
      );
      const existing = new Set(rows.map((r) => String(r.id)));
      for (const projectId of scopeProjectIds) {
        if (!existing.has(projectId)) return res.status(400).json({ error: `Projet introuvable: ${projectId}` });
      }
    }

    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM group_members WHERE group_id = ?', [groupId]);
      for (const userId of memberUserIds) {
        const user = await tx.queryOne('SELECT user_type FROM users WHERE id = ? LIMIT 1', [userId]);
        if (!user) continue;
        await tx.execute(
          `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
           VALUES (?, ?, ?, 'member')`,
          [groupId, userId, user.user_type]
        );
      }
      for (const userId of managerUserIds) {
        const user = await tx.queryOne('SELECT user_type FROM users WHERE id = ? LIMIT 1', [userId]);
        if (!user) continue;
        await tx.execute(
          `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
           VALUES (?, ?, ?, 'manager')
           ON DUPLICATE KEY UPDATE role_in_group = 'manager'`,
          [groupId, userId, user.user_type]
        );
      }

      await tx.execute('DELETE FROM group_scopes WHERE group_id = ?', [groupId]);
      for (const mapId of scopeMapIds) {
        await tx.execute(
          'INSERT INTO group_scopes (group_id, map_id, project_id) VALUES (?, ?, NULL)',
          [groupId, mapId]
        );
      }
      for (const projectId of scopeProjectIds) {
        await tx.execute(
          'INSERT INTO group_scopes (group_id, map_id, project_id) VALUES (?, NULL, ?)',
          [groupId, projectId]
        );
      }
    });

    const [membersByGroup, scopesByGroup] = await Promise.all([
      fetchGroupMembers([groupId]),
      fetchGroupScopes([groupId]),
    ]);
    res.json({
      group_id: groupId,
      members: membersByGroup.get(groupId) || [],
      scopes: scopesByGroup.get(groupId) || [],
    });
  } catch (err) {
    logRouteError(err, req);
    respondInternalError(res, req, err);
  }
});

module.exports = router;
