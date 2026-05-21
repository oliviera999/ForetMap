'use strict';

const { queryOne, execute } = require('../database');
const { buildAuthzPayload } = require('./rbac');

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

async function ensureGlAdminRecord({ email, displayName, googleSub, role = 'admin', foretmapUserId = null }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const safeRole = String(role || 'admin').toLowerCase() === 'mj' ? 'mj' : 'admin';
  let admin = await queryOne('SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [normalizedEmail]);
  if (!admin) {
    await execute(
      `INSERT INTO gl_admins (email, display_name, google_sub, role, foretmap_user_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [normalizedEmail, displayName || normalizedEmail, googleSub || null, safeRole, foretmapUserId]
    );
    admin = await queryOne('SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [normalizedEmail]);
  } else {
    await execute(
      `UPDATE gl_admins
          SET display_name = ?, google_sub = COALESCE(?, google_sub), role = ?, foretmap_user_id = COALESCE(?, foretmap_user_id), is_active = 1,
              last_seen = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [displayName || admin.display_name || normalizedEmail, googleSub || null, safeRole, foretmapUserId, admin.id]
    );
    admin = await queryOne('SELECT * FROM gl_admins WHERE id = ? LIMIT 1', [admin.id]);
  }
  return admin;
}

/**
 * Détermine si un compte peut se connecter en MJ/Admin GL.
 * - Admin ForetMap → gl_admins role admin (création / synchro auto).
 * - Compte déjà présent dans gl_admins (mj ou admin) → autorisé.
 */
async function resolveGlStaffLogin({ email, displayName, googleSub, teacherId = null }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: 'Email requis' };
  }

  if (teacherId) {
    const authz = await buildAuthzPayload('teacher', teacherId, false);
    if (!authz?.permissions?.includes('teacher.access')) {
      return {
        ok: false,
        status: 403,
        error: 'Ce compte enseignant n’a pas les droits maître du jeu.',
      };
    }
    if (isForetmapAdminForGl(authz)) {
      const admin = await ensureGlAdminRecord({
        email: normalizedEmail,
        displayName,
        googleSub,
        role: 'admin',
        foretmapUserId: String(teacherId),
      });
      return { ok: true, admin, glRole: 'admin' };
    }
  }

  const existing = await queryOne(
    'SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1',
    [normalizedEmail]
  );
  if (existing && Number(existing.is_active)) {
    if (googleSub || displayName) {
      await execute(
        `UPDATE gl_admins
            SET display_name = COALESCE(?, display_name),
                google_sub = COALESCE(?, google_sub),
                foretmap_user_id = COALESCE(?, foretmap_user_id),
                last_seen = NOW(),
                updated_at = NOW()
          WHERE id = ?`,
        [displayName || null, googleSub || null, teacherId ? String(teacherId) : null, existing.id]
      );
    }
    const admin = await queryOne('SELECT * FROM gl_admins WHERE id = ? LIMIT 1', [existing.id]);
    const glRole = String(admin?.role || 'mj').toLowerCase() === 'admin' ? 'admin' : 'mj';
    return { ok: true, admin, glRole };
  }

  return {
    ok: false,
    status: 403,
    error: 'Accès réservé aux administrateurs ForetMap ou aux comptes MJ enregistrés dans Gnomes & Licornes.',
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
