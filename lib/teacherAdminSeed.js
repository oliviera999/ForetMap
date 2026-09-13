'use strict';

/**
 * Création / garantie du compte enseignant admin défini par TEACHER_ADMIN_*.
 * Partagé entre routes/auth (premier login), scripts/seed-teacher-admin.js et le harnais de tests.
 */

const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { queryOne, execute } = require('../database');
const { nowIsoUtc } = require('./shared/isoTimestamp');

function normalizeEmail(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase();
  return s || null;
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

/**
 * @param {{
 *   minPasswordLength?: number,
 *   updatePasswordIfExists?: boolean,
 *   ensurePrimaryRole?: (userType: string, userId: string, roleSlug: string) => Promise<unknown>
 * }} [options]
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
      const now = nowIsoUtc();
      await execute(
        "UPDATE users SET password_hash = ?, display_name = ?, is_active = 1, updated_at = NOW(), last_seen = ? WHERE id = ? AND user_type = 'teacher'",
        [hash, displayName, now, existing.id],
      );
    }
    if (typeof options.ensurePrimaryRole === 'function') {
      await options.ensurePrimaryRole('teacher', existing.id, 'admin');
    }
    return {
      created: false,
      skipped: false,
      updated: !!options.updatePasswordIfExists,
      teacherId: existing.id,
    };
  }

  const hash = await bcrypt.hash(password, 10);
  const now = nowIsoUtc();
  const teacherId = crypto.randomUUID();
  try {
    await execute(
      `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
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
  if (typeof options.ensurePrimaryRole === 'function') {
    await options.ensurePrimaryRole('teacher', teacherId, 'admin');
  }
  return { created: true, skipped: false, updated: false, teacherId };
}

module.exports = {
  ensureTeacherAdminFromEnv,
  normalizeEmail,
};
