const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, execute } = require('../database');
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
async function findStudentUser({ linkedId, email, pseudo }) {
  if (linkedId) {
    const byLink = await queryOne(
      "SELECT * FROM users WHERE id = ? AND user_type = 'student' LIMIT 1",
      [linkedId],
    );
    if (byLink) return byLink;
  }
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  if (normalizedEmail) {
    const byEmail = await queryOne(
      "SELECT * FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?) LIMIT 1",
      [normalizedEmail],
    );
    if (byEmail) return byEmail;
  }
  const normalizedPseudo = String(pseudo || '').trim();
  if (normalizedPseudo) {
    return queryOne(
      "SELECT * FROM users WHERE user_type = 'student' AND LOWER(pseudo) = LOWER(?) LIMIT 1",
      [normalizedPseudo],
    );
  }
  return null;
}

async function resolveInsertPseudo(pseudo, glPlayerId, excludeUserId = null) {
  const base = String(pseudo || '').trim();
  if (!base) {
    return glPlayerId ? `gl-player-${glPlayerId}` : null;
  }
  const conflict = await queryOne(
    'SELECT id FROM users WHERE LOWER(pseudo) = LOWER(?) AND (? IS NULL OR id <> ?) LIMIT 1',
    [base, excludeUserId, excludeUserId],
  );
  if (!conflict) return base;
  const fallback = glPlayerId ? `${base}-gl${glPlayerId}` : `${base}-fm`;
  const fallbackConflict = await queryOne(
    'SELECT id FROM users WHERE LOWER(pseudo) = LOWER(?) AND (? IS NULL OR id <> ?) LIMIT 1',
    [fallback, excludeUserId, excludeUserId],
  );
  if (!fallbackConflict) return fallback;
  return glPlayerId ? `gl-player-${glPlayerId}` : `${base}-fm-${Date.now()}`;
}

async function resolveInsertEmail(email, excludeUserId = null) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  if (!normalizedEmail) return null;
  const conflict = await queryOne(
    'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND (? IS NULL OR id <> ?) LIMIT 1',
    [normalizedEmail, excludeUserId, excludeUserId],
  );
  return conflict ? null : normalizedEmail;
}

async function upsertForetmapUserForGlPlayer({
  classId,
  firstName,
  lastName,
  pseudo,
  email = null,
  passwordHash = null,
  existingForetmapUserId = null,
  glPlayerId = null,
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

  let user = await findStudentUser({
    linkedId: existingForetmapUserId,
    email: null,
    pseudo: null,
  });

  const displayName = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();

  if (!user) {
    const userId = uuidv4();
    const insertPseudo = await resolveInsertPseudo(normalizedPseudo, glPlayerId);
    const insertEmail = await resolveInsertEmail(normalizedEmail);
    try {
      await execute(
        `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
         description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, NULL, NULL, 'both', ?, 'gl_bridge', 1, NOW(), NOW(), NOW())`,
        [
          userId,
          insertEmail,
          insertPseudo || null,
          String(firstName || '').trim(),
          String(lastName || '').trim(),
          displayName || insertPseudo || userId,
          passwordHash,
        ],
      );
      user = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [userId]);
    } catch (err) {
      if (err?.errno === 1062 || err?.code === 'ER_DUP_ENTRY') {
        const retryPseudo = await resolveInsertPseudo(normalizedPseudo, glPlayerId);
        await execute(
          `INSERT INTO users
          (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
           description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
         VALUES (?, 'student', NULL, NULL, ?, ?, ?, ?, NULL, NULL, 'both', ?, 'gl_bridge', 1, NOW(), NOW(), NOW())`,
          [
            userId,
            retryPseudo || null,
            String(firstName || '').trim(),
            String(lastName || '').trim(),
            displayName || retryPseudo || userId,
            passwordHash,
          ],
        );
        user = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
          userId,
        ]);
      }
      if (!user) throw err;
    }
  } else {
    if (String(user.auth_provider || '') === 'gl_bridge') {
      const nextPseudo = await resolveInsertPseudo(normalizedPseudo, glPlayerId, user.id);
      const nextEmail = await resolveInsertEmail(normalizedEmail, user.id);
      await execute(
        `UPDATE users SET
           first_name = COALESCE(NULLIF(?, ''), first_name),
           last_name = COALESCE(NULLIF(?, ''), last_name),
           display_name = COALESCE(NULLIF(?, ''), display_name),
           pseudo = COALESCE(NULLIF(?, ''), pseudo),
           email = COALESCE(?, email),
           updated_at = NOW()
         WHERE id = ?`,
        [
          String(firstName || '').trim(),
          String(lastName || '').trim(),
          displayName || nextPseudo || user.display_name,
          nextPseudo || null,
          nextEmail,
          user.id,
        ],
      );
    }
    user = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [user.id]);
  }

  await execute(
    `INSERT INTO group_members (group_id, user_id, user_type, role_in_group)
     VALUES (?, ?, 'student', 'member')
     ON DUPLICATE KEY UPDATE role_in_group = 'member'`,
    [group.id, user.id],
  );

  await pruneOtherGlClassGroupMemberships(user.id, group.id);

  await syncStudentRoleFromGroups(user.id);

  return { ok: true, user, groupId: group.id };
}

/**
 * Retire l'élève des autres groupes liés à des classes GL (changement de classe).
 */
async function pruneOtherGlClassGroupMemberships(userId, keepGroupId) {
  const uid = String(userId || '').trim();
  const keepId = String(keepGroupId || '').trim();
  if (!uid || !keepId) return;
  await execute(
    `DELETE gm FROM group_members gm
     INNER JOIN gl_classes c ON c.foretmap_group_id = gm.group_id
     WHERE gm.user_id = ? AND gm.group_id <> ?`,
    [uid, keepId],
  );
}

/**
 * Synchronise un joueur GL existant vers users + group_members + linked_foretmap_user_id.
 */
async function syncForetmapUserForGlPlayer(playerId) {
  const id = Number(playerId);
  if (!Number.isFinite(id)) return { ok: false, error: 'Identifiant joueur invalide' };

  const player = await queryOne(
    `SELECT id, class_id, first_name, last_name, pseudo, email, password_hash, linked_foretmap_user_id
       FROM gl_players WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!player) return { ok: false, error: 'Joueur introuvable' };

  const result = await upsertForetmapUserForGlPlayer({
    classId: player.class_id,
    firstName: player.first_name,
    lastName: player.last_name,
    pseudo: player.pseudo,
    email: player.email,
    passwordHash: player.password_hash || null,
    existingForetmapUserId: player.linked_foretmap_user_id,
    glPlayerId: player.id,
  });
  if (!result.ok) return result;

  const linkedId = String(result.user.id);
  if (String(player.linked_foretmap_user_id || '') !== linkedId) {
    await execute(
      'UPDATE gl_players SET linked_foretmap_user_id = ?, updated_at = NOW() WHERE id = ?',
      [linkedId, player.id],
    );
  }

  return { ...result, playerId: player.id };
}

async function countPendingGlPlayersForetmapSync() {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
       FROM gl_players p
       INNER JOIN gl_classes c ON c.id = p.class_id
      WHERE c.foretmap_group_id IS NOT NULL
        AND (
          p.linked_foretmap_user_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM group_members gm
             WHERE gm.user_id = p.linked_foretmap_user_id
               AND gm.group_id = c.foretmap_group_id
          )
        )`,
  );
  return Number(row?.c || 0);
}

/**
 * Rattrapage idempotent : lie les joueurs GL préexistants aux groupes ForetMap.
 */
async function backfillGlPlayersForetmapLinks() {
  const players = await queryAll(
    `SELECT p.id
       FROM gl_players p
       INNER JOIN gl_classes c ON c.id = p.class_id
      WHERE c.foretmap_group_id IS NOT NULL
        AND (
          p.linked_foretmap_user_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM group_members gm
             WHERE gm.user_id = p.linked_foretmap_user_id
               AND gm.group_id = c.foretmap_group_id
          )
        )
      ORDER BY p.id ASC`,
  );

  let synced = 0;
  let failed = 0;
  for (const row of players) {
    try {
      const result = await syncForetmapUserForGlPlayer(row.id);
      if (result.ok) synced += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, failed, total: players.length };
}

module.exports = {
  ensureForetmapGroupForGlClass,
  upsertForetmapUserForGlPlayer,
  syncForetmapUserForGlPlayer,
  countPendingGlPlayersForetmapSync,
  backfillGlPlayersForetmapLinks,
};
