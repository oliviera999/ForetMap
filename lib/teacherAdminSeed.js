'use strict';

/**
 * Création / garantie du compte enseignant admin défini par TEACHER_ADMIN_*.
 * Partagé entre routes/auth (premier login), scripts/seed-teacher-admin.js et le harnais de tests.
 */

const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { queryOne, execute } = require('../database');
const { nowDbTimestamp } = require('./shared/isoTimestamp');
const { normalizeEmail } = require('./identity');
const { assignRole } = require('./rbacRoleAssignment');

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

async function assignAdmin(teacherId) {
  const role = await queryOne("SELECT id, slug, `rank` FROM roles WHERE slug = 'admin' LIMIT 1");
  if (!role) return;
  await assignRole({ actor: null, userType: 'teacher', userId: teacherId, nextRole: role });
}

/**
 * @param {{
 *   minPasswordLength?: number,
 *   updatePasswordIfExists?: boolean,
 *   forceAdminRole?: boolean
 * }} [options]
 *   - `updatePasswordIfExists` : réécrit le mot de passe d'un compte déjà présent (script
 *     d'exploitation `scripts/seed-teacher-admin.js` seulement) ;
 *   - `forceAdminRole` : repose le profil `admin` sur un compte déjà présent (même script).
 *     Au premier login du processus, un compte existant garde le profil qu'il a : une
 *     promotion automatique d'après l'e-mail serait une porte d'escalade (CDG-01).
 * @returns {Promise<{ created: boolean, skipped: boolean, updated: boolean, teacherId: string|null }>}
 */
async function ensureTeacherAdminFromEnv(options = {}) {
  const minPasswordLength = Number.isFinite(options.minPasswordLength)
    ? options.minPasswordLength
    : 4;
  const email = normalizeEmail(process.env.TEACHER_ADMIN_EMAIL);
  const password = normalizeOptionalString(process.env.TEACHER_ADMIN_PASSWORD);
  const displayName = normalizeOptionalString(process.env.TEACHER_ADMIN_DISPLAY_NAME) || 'n3boss';
  if (!email || !password || password.length < minPasswordLength) {
    return { created: false, skipped: true, updated: false, teacherId: null };
  }

  const existing = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [email],
  );
  if (existing?.id) {
    if (options.updatePasswordIfExists) {
      const hash = await bcrypt.hash(password, 10);
      const now = nowDbTimestamp();
      await execute(
        "UPDATE users SET password_hash = ?, display_name = ?, is_active = 1, updated_at = NOW(), last_seen = ? WHERE id = ? AND user_type = 'teacher'",
        [hash, displayName, now, existing.id],
      );
    }
    if (options.forceAdminRole) await assignAdmin(existing.id);
    return {
      created: false,
      skipped: false,
      updated: !!options.updatePasswordIfExists,
      teacherId: existing.id,
    };
  }

  const hash = await bcrypt.hash(password, 10);
  const now = nowDbTimestamp();
  const teacherId = crypto.randomUUID();
  try {
    await execute(
      `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, ?, 'local', 1, ?, NOW(), NOW())`,
      [teacherId, email, email.split('@')[0] || null, displayName, hash, now],
    );
  } catch (err) {
    if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
      const again = await queryOne(
        "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
        [email],
      );
      return { created: false, skipped: false, updated: false, teacherId: again?.id || null };
    }
    throw err;
  }
  await assignAdmin(teacherId);
  return { created: true, skipped: false, updated: false, teacherId };
}

module.exports = {
  ensureTeacherAdminFromEnv,
  normalizeEmail,
};
