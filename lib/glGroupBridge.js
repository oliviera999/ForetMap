const crypto = require('node:crypto');
const { queryOne, queryAll, execute } = require('../database');
const { getRoleBySlug } = require('./rbac');
const { syncStudentRoleFromGroups } = require('./groupRole');

/**
 * Pont identité Gnomes & Licornes → ForetMap.
 *
 * Depuis l'unification des identités (migration 211, `docs/AUDIT_COMPTES_2026-09.md`), le
 * compte `users` lié à un joueur GL est LE porteur de ses secrets : mot de passe, e-mail,
 * `google_sub`, `password_must_reset`, `token_epoch`. `gl_players` ne garde que le gameplay.
 * Ce module garantit qu'un joueur a toujours un compte lié, membre du groupe ForetMap miroir
 * de sa classe, et rapproche un joueur d'un compte ForetMap déjà existant (même e-mail, ou
 * même pseudo ET mêmes prénom/nom) au lieu d'en créer un doublon.
 */

function normalizeSlug(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || null;
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
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
  const groupId = crypto.randomUUID();
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
 * Compte élève ForetMap à rapprocher d'un joueur GL.
 *
 * Ordre : le lien déjà posé, puis l'e-mail (identité forte), puis le pseudo — uniquement si
 * prénom et nom coïncident aussi, pour ne pas fusionner deux élèves homonymes de pseudo.
 * Avant l'unification, cette fonction n'était appelée qu'avec le lien : chaque import GL
 * d'un élève déjà inscrit à ForetMap créait un compte en doublon, pseudo suffixé et e-mail
 * écrasé (constat C1 de l'audit).
 */
async function findStudentUser({ linkedId, email, pseudo, firstName = null, lastName = null }) {
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
    const byPseudo = await queryOne(
      "SELECT * FROM users WHERE user_type = 'student' AND LOWER(pseudo) = LOWER(?) LIMIT 1",
      [normalizedPseudo],
    );
    if (
      byPseudo &&
      normalizeName(byPseudo.first_name) === normalizeName(firstName) &&
      normalizeName(byPseudo.last_name) === normalizeName(lastName)
    ) {
      return byPseudo;
    }
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

/** E-mail inscriptible (normalisé) ou `null` s'il est déjà pris par un autre compte. */
async function resolveInsertEmail(email, excludeUserId = null) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  if (!normalizedEmail) return null;
  const conflict = await queryOne(
    'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND (? IS NULL OR id <> ?) LIMIT 1',
    [normalizedEmail, excludeUserId, excludeUserId],
  );
  return conflict ? null : normalizedEmail;
}

function isBridgeAccount(user) {
  return String(user?.auth_provider || '') === 'gl_bridge';
}

/**
 * Garantit le compte ForetMap d'un joueur GL et son appartenance au groupe de sa classe.
 *
 * @param {object} params
 * @param {number} params.classId
 * @param {string} params.firstName
 * @param {string} params.lastName
 * @param {string} params.pseudo pseudo de jeu
 * @param {string|null} [params.email]
 * @param {string|null} [params.passwordHash] hash bcrypt à poser (compte créé, ou compte miroir sans mot de passe)
 * @param {boolean|null} [params.passwordMustReset] drapeau à poser sur un compte créé
 * @param {string|null} [params.existingForetmapUserId] lien déjà connu
 * @param {number|null} [params.glPlayerId]
 * @param {boolean} [params.dedupe=true] rapprocher un compte existant par e-mail / pseudo+nom
 * @param {boolean} [params.forceEmail=false] écrire l'e-mail même sur un compte non miroir
 * @returns {Promise<{ok:true,user:object,groupId:string,created:boolean,reusedExisting:boolean,emailConflict:boolean}|{ok:false,error:string}>}
 */
async function upsertForetmapUserForGlPlayer({
  classId,
  firstName,
  lastName,
  pseudo,
  email = null,
  passwordHash = null,
  passwordMustReset = null,
  existingForetmapUserId = null,
  glPlayerId = null,
  dedupe = true,
  forceEmail = false,
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

  let user = await findStudentUser({ linkedId: existingForetmapUserId, email: null, pseudo: null });
  let reusedExisting = false;
  if (!user && dedupe) {
    user = await findStudentUser({
      linkedId: null,
      email: normalizedEmail,
      pseudo: normalizedPseudo,
      firstName,
      lastName,
    });
    if (user) {
      // Un compte ForetMap déjà lié à un AUTRE joueur ne peut pas être rapproché (lien 1-1).
      const otherPlayer = await queryOne(
        'SELECT id FROM gl_players WHERE linked_foretmap_user_id = ? AND (? IS NULL OR id <> ?) LIMIT 1',
        [user.id, glPlayerId, glPlayerId],
      );
      if (otherPlayer) user = null;
      else reusedExisting = true;
    }
  }

  const displayName = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
  let created = false;
  let emailConflict = false;

  if (!user) {
    const userId = crypto.randomUUID();
    const insertPseudo = await resolveInsertPseudo(normalizedPseudo, glPlayerId);
    const insertEmail = await resolveInsertEmail(normalizedEmail);
    emailConflict = !!normalizedEmail && !insertEmail;
    const mustReset = passwordMustReset ? 1 : 0;
    try {
      await execute(
        `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
         description, avatar_path, affiliation, password_hash, auth_provider, password_must_reset,
         is_active, last_seen, created_at, updated_at)
       VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, NULL, NULL, 'both', ?, 'gl_bridge', ?, 1, NOW(), NOW(), NOW())`,
        [
          userId,
          insertEmail,
          insertPseudo || null,
          String(firstName || '').trim(),
          String(lastName || '').trim(),
          displayName || insertPseudo || userId,
          passwordHash,
          mustReset,
        ],
      );
      user = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [userId]);
    } catch (err) {
      if (err?.errno === 1062 || err?.code === 'ER_DUP_ENTRY') {
        const retryPseudo = await resolveInsertPseudo(normalizedPseudo, glPlayerId);
        await execute(
          `INSERT INTO users
          (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
           description, avatar_path, affiliation, password_hash, auth_provider, password_must_reset,
           is_active, last_seen, created_at, updated_at)
         VALUES (?, 'student', NULL, NULL, ?, ?, ?, ?, NULL, NULL, 'both', ?, 'gl_bridge', ?, 1, NOW(), NOW(), NOW())`,
          [
            userId,
            retryPseudo || null,
            String(firstName || '').trim(),
            String(lastName || '').trim(),
            displayName || retryPseudo || userId,
            passwordHash,
            mustReset,
          ],
        );
        emailConflict = !!normalizedEmail;
        user = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
          userId,
        ]);
      }
      if (!user) throw err;
    }
    created = true;
  } else {
    const bridge = isBridgeAccount(user);
    const nextEmail =
      normalizedEmail && (bridge || forceEmail)
        ? await resolveInsertEmail(normalizedEmail, user.id)
        : null;
    emailConflict = !!normalizedEmail && (bridge || forceEmail) && !nextEmail;
    if (bridge) {
      // Compte miroir : il suit le joueur (identité, pseudo, e-mail) ; un mot de passe n'est
      // posé que s'il n'en a pas encore (rattrapage d'un joueur historique).
      const nextPseudo = await resolveInsertPseudo(normalizedPseudo, glPlayerId, user.id);
      await execute(
        `UPDATE users SET
           first_name = COALESCE(NULLIF(?, ''), first_name),
           last_name = COALESCE(NULLIF(?, ''), last_name),
           display_name = COALESCE(NULLIF(?, ''), display_name),
           pseudo = COALESCE(NULLIF(?, ''), pseudo),
           email = COALESCE(?, email),
           password_hash = COALESCE(password_hash, ?),
           updated_at = NOW()
         WHERE id = ?`,
        [
          String(firstName || '').trim(),
          String(lastName || '').trim(),
          displayName || nextPseudo || user.display_name,
          nextPseudo || null,
          nextEmail,
          passwordHash,
          user.id,
        ],
      );
    } else if (nextEmail) {
      await execute('UPDATE users SET email = ?, updated_at = NOW() WHERE id = ?', [
        nextEmail,
        user.id,
      ]);
    }
    if (!user.password_hash && passwordHash && !bridge) {
      // Compte ForetMap sans mot de passe (Google seul) rapproché d'un import avec mot de passe.
      await execute(
        'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ? AND password_hash IS NULL',
        [passwordHash, user.id],
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

  return { ok: true, user, groupId: group.id, created, reusedExisting, emailConflict };
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

/** Retire l'élève du groupe miroir d'une classe GL (suppression du joueur). */
async function removeGlClassGroupMembership(userId, classId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  await execute(
    `DELETE gm FROM group_members gm
     INNER JOIN gl_classes c ON c.foretmap_group_id = gm.group_id
     WHERE gm.user_id = ? AND c.id = ?`,
    [uid, Number(classId)],
  );
  await syncStudentRoleFromGroups(uid);
}

/**
 * Synchronise un joueur GL existant vers users + group_members + linked_foretmap_user_id.
 *
 * Un joueur historique (créé avant l'unification, ou inséré directement en base) peut encore
 * porter `legacy_password_hash` / `legacy_email` : ils servent à créer ou compléter le compte,
 * puis sont vidés dès qu'ils ont été repris — le compte `users` fait foi ensuite.
 */
async function syncForetmapUserForGlPlayer(playerId, options = {}) {
  const id = Number(playerId);
  if (!Number.isFinite(id)) return { ok: false, error: 'Identifiant joueur invalide' };

  const player = await queryOne(
    `SELECT id, class_id, first_name, last_name, pseudo, legacy_email, legacy_password_hash,
            linked_foretmap_user_id
       FROM gl_players WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!player) return { ok: false, error: 'Joueur introuvable' };

  const result = await upsertForetmapUserForGlPlayer({
    classId: player.class_id,
    firstName: player.first_name,
    lastName: player.last_name,
    pseudo: player.pseudo,
    email: options.email !== undefined ? options.email : player.legacy_email,
    passwordHash: player.legacy_password_hash || null,
    existingForetmapUserId: player.linked_foretmap_user_id,
    glPlayerId: player.id,
    dedupe: options.dedupe !== undefined ? !!options.dedupe : true,
    forceEmail: options.forceEmail === true,
  });
  if (!result.ok) return result;

  const linkedId = String(result.user.id);
  if (String(player.linked_foretmap_user_id || '') !== linkedId) {
    await execute(
      'UPDATE gl_players SET linked_foretmap_user_id = ?, updated_at = NOW() WHERE id = ?',
      [linkedId, player.id],
    );
  }
  // Reliquats hérités repris dans users → vidés.
  if (player.legacy_password_hash && result.user.password_hash === player.legacy_password_hash) {
    await execute(
      'UPDATE gl_players SET legacy_password_hash = NULL, updated_at = NOW() WHERE id = ?',
      [player.id],
    );
  }
  if (
    player.legacy_email &&
    String(result.user.email || '').toLowerCase() === String(player.legacy_email).toLowerCase()
  ) {
    await execute('UPDATE gl_players SET legacy_email = NULL, updated_at = NOW() WHERE id = ?', [
      player.id,
    ]);
  }

  return { ...result, playerId: player.id };
}

const PENDING_SYNC_WHERE = `
      WHERE p.linked_foretmap_user_id IS NULL
         OR c.foretmap_group_id IS NULL
         OR NOT EXISTS (
            SELECT 1 FROM group_members gm
             WHERE gm.user_id = p.linked_foretmap_user_id
               AND gm.group_id = c.foretmap_group_id
          )`;

async function countPendingGlPlayersForetmapSync() {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
       FROM gl_players p
       INNER JOIN gl_classes c ON c.id = p.class_id
      ${PENDING_SYNC_WHERE}`,
  );
  return Number(row?.c || 0);
}

/**
 * Rattrapage idempotent : lie les joueurs GL préexistants aux comptes et groupes ForetMap.
 */
async function backfillGlPlayersForetmapLinks() {
  const players = await queryAll(
    `SELECT p.id
       FROM gl_players p
       INNER JOIN gl_classes c ON c.id = p.class_id
      ${PENDING_SYNC_WHERE}
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
  findStudentUser,
  upsertForetmapUserForGlPlayer,
  syncForetmapUserForGlPlayer,
  removeGlClassGroupMembership,
  pruneOtherGlClassGroupMemberships,
  countPendingGlPlayersForetmapSync,
  backfillGlPlayersForetmapLinks,
  isBridgeAccount,
};
