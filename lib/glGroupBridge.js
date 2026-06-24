const { v4: uuidv4 } = require('uuid');
const { queryOne, execute } = require('../database');
const { getRoleBySlug } = require('./rbac');
const { syncStudentRoleFromGroups } = require('./groupRole');

function normalizeSlug(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || null;
}

/**
 * Crée ou récupère le groupe ForetMap lié à une classe GL.
 */
async function ensureForetmapGroupForGlClass(classRow, options = {}) {
  const classId = Number(classRow?.id);
  if (!Number.isFinite(classId)) return null;

  const existingGroupId = classRow?.foretmap_group_id
    ? String(classRow.foretmap_group_id).trim()
    : null;
  if (existingGroupId) {
    const group = await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [existingGroupId]);
    if (group) return group;
  }

  const linked = await queryOne('SELECT foretmap_group_id FROM gl_classes WHERE id = ? LIMIT 1', [
    classId,
  ]);
  if (linked?.foretmap_group_id) {
    const group = await queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [
      linked.foretmap_group_id,
    ]);
    if (group) return group;
  }

  const slugBase = normalizeSlug(`gl-class-${classId}-${classRow?.name || 'classe'}`);
  const slug = slugBase || `gl-class-${classId}`;
  const visitorRole = await getRoleBySlug('visiteur');
  const defaultRoleId =
    options.defaultRoleId != null ? options.defaultRoleId : (visitorRole?.id ?? null);
  const grantsN3beur = options.grantsN3beurAccess ? 1 : 0;
  const groupId = uuidv4();
  const name = String(classRow?.name || `Classe GL ${classId}`).trim();

  await execute(
    `INSERT INTO \`groups\`
      (id, slug, name, description, kind, parent_group_id, default_role_id, grants_n3beur_access, is_active, created_by)
     VALUES (?, ?, ?, ?, 'class', NULL, ?, ?, 1, NULL)`,
    [groupId, slug, name, `Groupe lié à la classe GL #${classId}`, defaultRoleId, grantsN3beur],
  );
  await execute('UPDATE gl_classes SET foretmap_group_id = ?, updated_at = NOW() WHERE id = ?', [
    groupId,
    classId,
  ]);
  return queryOne('SELECT * FROM `groups` WHERE id = ? LIMIT 1', [groupId]);
}

/**
 * Upsert compte ForetMap élève + appartenance au groupe de la classe GL.
 */
async function upsertForetmapUserForGlPlayer({
  classId,
  firstName,
  lastName,
  pseudo,
  email = null,
  passwordHash = null,
}) {
  const cls = await queryOne(
    'SELECT id, name, foretmap_group_id FROM gl_classes WHERE id = ? LIMIT 1',
    [Number(classId)],
  );
  if (!cls) return { ok: false, error: 'Classe introuvable' };

  const group = await ensureForetmapGroupForGlClass(cls);
  if (!group?.id) return { ok: false, error: 'Groupe ForetMap introuvable' };

  const normalizedPseudo = String(pseudo || '').trim();
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

  let user = null;
  if (normalizedEmail) {
    user = await queryOne(
      "SELECT * FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?) LIMIT 1",
      [normalizedEmail],
    );
  }
  if (!user && normalizedPseudo) {
    user = await queryOne(
      "SELECT * FROM users WHERE user_type = 'student' AND LOWER(pseudo) = LOWER(?) LIMIT 1",
      [normalizedPseudo],
    );
  }

  if (!user) {
    const userId = uuidv4();
    const displayName = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
    await execute(
      `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
         description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, NULL, NULL, 'both', ?, 'local', 1, NOW(), NOW(), NOW())`,
      [
        userId,
        normalizedEmail,
        normalizedPseudo || null,
        String(firstName || '').trim(),
        String(lastName || '').trim(),
        displayName || normalizedPseudo || userId,
        passwordHash,
      ],
    );
    user = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [userId]);
  } else if (passwordHash) {
    await execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [
      passwordHash,
      user.id,
    ]);
  }

  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')
     ON DUPLICATE KEY UPDATE role_in_group = 'member'`,
    [group.id, user.id],
  );

  await syncStudentRoleFromGroups(user.id);

  return { ok: true, user, groupId: group.id };
}

module.exports = {
  ensureForetmapGroupForGlClass,
  upsertForetmapUserForGlPlayer,
};
