const { queryAll, queryOne } = require('../database');

function normalizeId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function authPermissions(auth) {
  return Array.isArray(auth?.permissions) ? auth.permissions : [];
}

function canReadGroups(auth) {
  const perms = authPermissions(auth);
  return perms.includes('groups.read') || perms.includes('groups.manage');
}

function canManageGroups(auth) {
  const perms = authPermissions(auth);
  return perms.includes('groups.manage');
}

function canBypassGroupScope(auth) {
  const roleSlug = String(auth?.roleSlug || '').toLowerCase();
  const perms = authPermissions(auth);
  return roleSlug === 'admin' || perms.includes('stats.read.all');
}

async function getAllGroups() {
  return queryAll(
    `SELECT id, slug, name, description, kind, parent_group_id, is_active,
            created_by, created_at, updated_at
       FROM \`groups\`
      ORDER BY name ASC, id ASC`,
  );
}

function collectDescendants(seedGroupIds, rows) {
  const byParent = new Map();
  for (const row of rows) {
    const parentId = normalizeId(row.parent_group_id);
    if (!parentId) continue;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(String(row.id));
  }
  const out = new Set(uniqueStrings(seedGroupIds));
  const queue = [...out];
  while (queue.length) {
    const current = queue.shift();
    const children = byParent.get(current) || [];
    for (const childId of children) {
      if (out.has(childId)) continue;
      out.add(childId);
      queue.push(childId);
    }
  }
  return [...out];
}

async function getUserDirectGroupIds(userId) {
  const normalized = normalizeId(userId);
  if (!normalized) return [];
  const rows = await queryAll(
    `SELECT gm.group_id
       FROM group_members gm
      INNER JOIN \`groups\` g ON g.id = gm.group_id
      WHERE gm.user_id = ?
        AND g.is_active = 1`,
    [normalized],
  );
  return uniqueStrings(rows.map((r) => r.group_id));
}

async function getUserAccessibleGroupIds(auth, options = {}) {
  const includeDescendants = options.includeDescendants !== false;
  if (!auth?.userId) return [];
  const directGroupIds = await getUserDirectGroupIds(auth.userId);
  if (!includeDescendants || directGroupIds.length === 0) return directGroupIds;
  const rows = await getAllGroups();
  return collectDescendants(directGroupIds, rows);
}

async function getScopedStudentIds(auth, options = {}) {
  const requestedGroupId = normalizeId(options.groupId || options.subgroupId);
  const requestedMapId = normalizeId(options.mapId);
  const requestedProjectId = normalizeId(options.projectId);
  const scopeGroupIds = await getUserAccessibleGroupIds(auth, { includeDescendants: true });
  // stats.read.all / rôle admin : vue globale sauf filtre group_id explicite (même si l’utilisateur est membre de groupes).
  const bypassAll = canBypassGroupScope(auth);

  let effectiveGroupIds = scopeGroupIds;
  if (requestedGroupId) {
    if (bypassAll) {
      const groups = await getAllGroups();
      effectiveGroupIds = collectDescendants([requestedGroupId], groups);
    } else {
      if (!scopeGroupIds.includes(requestedGroupId)) {
        return { all: false, studentIds: [], groupIds: [], unauthorizedGroup: true };
      }
      const groups = await getAllGroups();
      effectiveGroupIds = collectDescendants([requestedGroupId], groups).filter((id) =>
        scopeGroupIds.includes(id),
      );
    }
  }

  const where = [];
  const params = [];
  if (!bypassAll) {
    if (effectiveGroupIds.length === 0) {
      return { all: false, studentIds: [], groupIds: [] };
    }
    where.push(`gm.group_id IN (${effectiveGroupIds.map(() => '?').join(',')})`);
    params.push(...effectiveGroupIds);
  } else if (requestedGroupId && effectiveGroupIds.length > 0) {
    where.push(`gm.group_id IN (${effectiveGroupIds.map(() => '?').join(',')})`);
    params.push(...effectiveGroupIds);
  }

  if (requestedMapId) {
    where.push(
      `(
        NOT EXISTS (SELECT 1 FROM group_scopes gs0 WHERE gs0.group_id = gm.group_id)
        OR EXISTS (
          SELECT 1 FROM group_scopes gsm
           WHERE gsm.group_id = gm.group_id
             AND gsm.map_id = ?
        )
      )`,
    );
    params.push(requestedMapId);
  }
  if (requestedProjectId) {
    where.push(
      `(
        NOT EXISTS (SELECT 1 FROM group_scopes gs1 WHERE gs1.group_id = gm.group_id)
        OR EXISTS (
          SELECT 1 FROM group_scopes gsp
           WHERE gsp.group_id = gm.group_id
             AND gsp.project_id = ?
        )
      )`,
    );
    params.push(requestedProjectId);
  }

  const sql = `
    SELECT DISTINCT gm.user_id AS student_id
      FROM group_members gm
      INNER JOIN users u ON u.id = gm.user_id
     WHERE u.user_type = 'student'
       AND u.is_active = 1
       ${where.length ? `AND ${where.join(' AND ')}` : ''}
  `;
  const rows = await queryAll(sql, params);
  return {
    all: bypassAll && !requestedGroupId && !requestedMapId && !requestedProjectId,
    studentIds: uniqueStrings(rows.map((r) => r.student_id)),
    groupIds: effectiveGroupIds,
  };
}

async function canAccessStudentId(auth, studentId, options = {}) {
  const normalized = normalizeId(studentId);
  if (!normalized) return false;
  if (canBypassGroupScope(auth)) {
    const row = await queryOne(
      "SELECT id FROM users WHERE id = ? AND user_type = 'student' AND is_active = 1 LIMIT 1",
      [normalized],
    );
    return !!row;
  }
  const scope = await getScopedStudentIds(auth, options);
  return scope.studentIds.includes(normalized);
}

module.exports = {
  normalizeId,
  canReadGroups,
  canManageGroups,
  canBypassGroupScope,
  getAllGroups,
  getUserDirectGroupIds,
  getUserAccessibleGroupIds,
  getScopedStudentIds,
  canAccessStudentId,
};
