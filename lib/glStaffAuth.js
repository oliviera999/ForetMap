'use strict';

const { queryOne, execute } = require('../database');
const { buildAuthzPayload } = require('./rbac');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  const email = String(value || '')
    .trim()
    .toLowerCase();
  return EMAIL_RE.test(email);
}

/** Email stable pour synchroniser un enseignant ForetMap sans adresse mail. */
function syntheticGlAdminEmail(teacherId) {
  const safe = String(teacherId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `foretmap-teacher-${safe}@gl.internal`;
}

function isMissingColumnError(err) {
  return err?.code === 'ER_BAD_FIELD_ERROR' || err?.errno === 1054;
}

/**
 * Administrateur ForetMap (rôle RBAC admin ou permissions admin système).
 */
function isForetmapAdminForGl(authz) {
  if (!authz) return false;
  const slug = String(authz.roleSlug || '').toLowerCase();
  if (slug === 'admin') return true;
  const perms = Array.isArray(authz.permissions) ? authz.permissions : [];
  return perms.includes('admin.impersonate') || perms.includes('admin.roles.manage');
}

async function ensureGlAdminRecord({
  email,
  displayName,
  googleSub,
  role = 'admin',
  foretmapUserId = null,
}) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();
  const safeRole = String(role || 'admin').toLowerCase() === 'mj' ? 'mj' : 'admin';
  let admin = await queryOne('SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [
    normalizedEmail,
  ]);
  if (!admin) {
    try {
      await execute(
        `INSERT INTO gl_admins (email, display_name, google_sub, role, foretmap_user_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           display_name = VALUES(display_name),
           google_sub = COALESCE(VALUES(google_sub), google_sub),
           role = VALUES(role),
           foretmap_user_id = COALESCE(VALUES(foretmap_user_id), foretmap_user_id),
           is_active = 1,
           last_seen = NOW(),
           updated_at = NOW()`,
        [
          normalizedEmail,
          displayName || normalizedEmail,
          googleSub || null,
          safeRole,
          foretmapUserId,
        ],
      );
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') {
        admin = await queryOne('SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [
          normalizedEmail,
        ]);
      } else if (!isMissingColumnError(err)) {
        throw err;
      } else {
        await execute(
          `INSERT INTO gl_admins (email, display_name, google_sub, role, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             display_name = VALUES(display_name),
             google_sub = COALESCE(VALUES(google_sub), google_sub),
             role = VALUES(role),
             is_active = 1,
             last_seen = NOW(),
             updated_at = NOW()`,
          [normalizedEmail, displayName || normalizedEmail, googleSub || null, safeRole],
        );
      }
    }
    if (!admin) {
      admin = await queryOne('SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [
        normalizedEmail,
      ]);
    }
  } else {
    try {
      await execute(
        `UPDATE gl_admins
            SET display_name = ?, google_sub = COALESCE(?, google_sub), role = ?, foretmap_user_id = COALESCE(?, foretmap_user_id), is_active = 1,
                last_seen = NOW(), updated_at = NOW()
          WHERE id = ?`,
        [
          displayName || admin.display_name || normalizedEmail,
          googleSub || null,
          safeRole,
          foretmapUserId,
          admin.id,
        ],
      );
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      await execute(
        `UPDATE gl_admins
            SET display_name = ?, google_sub = COALESCE(?, google_sub), role = ?, is_active = 1,
                last_seen = NOW(), updated_at = NOW()
          WHERE id = ?`,
        [
          displayName || admin.display_name || normalizedEmail,
          googleSub || null,
          safeRole,
          admin.id,
        ],
      );
    }
    admin = await queryOne('SELECT * FROM gl_admins WHERE id = ? LIMIT 1', [admin.id]);
  }
  return admin;
}

/**
 * Rattachement d'un gl_admin existant (display_name/google_sub/foretmap_user_id,
 * COALESCE partout) avec repli sans `foretmap_user_id` si la colonne manque
 * (base pas encore migrée) — factorise le double try/catch dupliqué.
 */
async function touchGlAdminLink({ adminId, displayName, googleSub, teacherKey }) {
  try {
    await execute(
      `UPDATE gl_admins
          SET display_name = COALESCE(?, display_name),
              google_sub = COALESCE(?, google_sub),
              foretmap_user_id = COALESCE(?, foretmap_user_id),
              last_seen = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [displayName || null, googleSub || null, teacherKey, adminId],
    );
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    await execute(
      `UPDATE gl_admins
          SET display_name = COALESCE(?, display_name),
              google_sub = COALESCE(?, google_sub),
              last_seen = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [displayName || null, googleSub || null, adminId],
    );
  }
}

async function findGlAdminByForetmapUserId(teacherId) {
  if (teacherId == null) return null;
  try {
    return await queryOne('SELECT * FROM gl_admins WHERE foretmap_user_id = ? LIMIT 1', [
      String(teacherId),
    ]);
  } catch (err) {
    if (isMissingColumnError(err)) return null;
    throw err;
  }
}

/**
 * Détermine si un compte peut se connecter en MJ/Admin GL.
 * - Admin ForetMap → gl_admins role admin (création / synchro auto).
 * - Compte déjà présent dans gl_admins (mj ou admin) → autorisé.
 */
async function findGlAdminByLoginIdentifier(loginIdentifier) {
  const key = String(loginIdentifier || '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  return queryOne('SELECT * FROM gl_admins WHERE LOWER(email) = LOWER(?) LIMIT 1', [key]);
}

function collectLoginKeys(loginIdentifier, alternateLoginIdentifiers = []) {
  const keys = [];
  const push = (raw) => {
    const key = String(raw || '')
      .trim()
      .toLowerCase();
    if (!key || keys.includes(key)) return;
    keys.push(key);
  };
  push(loginIdentifier);
  for (const alt of alternateLoginIdentifiers) push(alt);
  return keys;
}

async function resolveGlAdminByLoginKeys({ loginKeys, teacherKey, displayName, googleSub }) {
  for (const key of loginKeys) {
    const byLogin = await findGlAdminByLoginIdentifier(key);
    if (!byLogin || !Number(byLogin.is_active)) continue;
    if (teacherKey) {
      await touchGlAdminLink({ adminId: byLogin.id, displayName, googleSub, teacherKey });
    }
    const admin = await queryOne('SELECT * FROM gl_admins WHERE id = ? LIMIT 1', [byLogin.id]);
    const glRole = String(admin?.role || 'mj').toLowerCase() === 'admin' ? 'admin' : 'mj';
    return { ok: true, admin, glRole };
  }
  return null;
}

async function resolveGlStaffLogin({
  email,
  displayName,
  googleSub,
  teacherId = null,
  loginIdentifier = null,
  alternateLoginIdentifiers = [],
}) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();
  const emailIsValid = isValidEmail(normalizedEmail);
  const teacherKey = teacherId != null ? String(teacherId) : null;
  const loginKey = String(loginIdentifier || '')
    .trim()
    .toLowerCase();
  const loginKeys = collectLoginKeys(loginIdentifier, alternateLoginIdentifiers);

  if (teacherKey) {
    const authz = await buildAuthzPayload('teacher', teacherKey, false);
    if (!authz?.permissions?.includes('teacher.access')) {
      return {
        ok: false,
        status: 403,
        error: 'Ce compte enseignant n’a pas les droits maître du jeu.',
      };
    }
    if (isForetmapAdminForGl(authz)) {
      const recordEmail = emailIsValid ? normalizedEmail : syntheticGlAdminEmail(teacherKey);
      const admin = await ensureGlAdminRecord({
        email: recordEmail,
        displayName,
        googleSub,
        role: 'admin',
        foretmapUserId: teacherKey,
      });
      return { ok: true, admin, glRole: 'admin' };
    }

    const linked = await findGlAdminByForetmapUserId(teacherKey);
    if (linked && Number(linked.is_active)) {
      const glRole = String(linked.role || 'mj').toLowerCase() === 'admin' ? 'admin' : 'mj';
      return { ok: true, admin: linked, glRole };
    }

    const byLoginKeys = await resolveGlAdminByLoginKeys({
      loginKeys,
      teacherKey,
      displayName,
      googleSub,
    });
    if (byLoginKeys) return byLoginKeys;
  }

  if (!emailIsValid) {
    const byLoginKeys = await resolveGlAdminByLoginKeys({
      loginKeys,
      teacherKey,
      displayName,
      googleSub,
    });
    if (byLoginKeys) return byLoginKeys;
    return {
      ok: false,
      status: 403,
      error:
        'Accès réservé aux administrateurs ForetMap ou aux comptes MJ enregistrés dans Gnomes & Licornes.',
    };
  }

  let existing = await queryOne('SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [
    normalizedEmail,
  ]);
  if (!existing || !Number(existing.is_active)) {
    for (const key of loginKeys) {
      const byLogin = await findGlAdminByLoginIdentifier(key);
      if (byLogin && Number(byLogin.is_active)) {
        existing = byLogin;
        break;
      }
    }
  }
  if (existing && Number(existing.is_active)) {
    if (googleSub || displayName || teacherKey) {
      await touchGlAdminLink({ adminId: existing.id, displayName, googleSub, teacherKey });
    }
    const admin = await queryOne('SELECT * FROM gl_admins WHERE id = ? LIMIT 1', [existing.id]);
    const glRole = String(admin?.role || 'mj').toLowerCase() === 'admin' ? 'admin' : 'mj';
    return { ok: true, admin, glRole };
  }

  return {
    ok: false,
    status: 403,
    error:
      'Accès réservé aux administrateurs ForetMap ou aux comptes MJ enregistrés dans Gnomes & Licornes.',
  };
}

function buildGlAdminClaims(admin, glRole) {
  const role = String(glRole || admin?.role || 'admin').toLowerCase() === 'mj' ? 'mj' : 'admin';
  const displayName = admin?.display_name || admin?.email || 'MJ';
  return {
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: role === 'mj' ? 'gl_mj' : 'gl_admin',
    displayName,
  };
}

module.exports = {
  isForetmapAdminForGl,
  ensureGlAdminRecord,
  resolveGlStaffLogin,
  buildGlAdminClaims,
};
