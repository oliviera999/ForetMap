const { queryOne } = require('../database');
const { normalizeOptionalString } = require('./shared/httpHelpers');

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

function canonicalFromEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return null;
  return email.split('@')[0] || null;
}

async function ensureCanonicalUserByAuth(auth) {
  if (!auth?.userId) return null;
  const existing = await queryOne('SELECT id FROM users WHERE id = ? LIMIT 1', [auth.userId]);
  if (existing?.id) return existing.id;
  const sameType = await queryOne('SELECT id FROM users WHERE id = ? AND user_type = ? LIMIT 1', [
    auth.userId,
    auth.userType || 'student',
  ]);
  if (sameType?.id) return sameType.id;
  return null;
}

function resolveActorFromReq(req) {
  const auth = req?.auth;
  if (auth?.userId && auth?.userType) {
    return { actorUserType: auth.userType, actorUserId: auth.userId };
  }
  return { actorUserType: null, actorUserId: null };
}

function adminCanonicalLogin() {
  return String(process.env.ADMIN_CANONICAL_LOGIN || 'oliviera9')
    .trim()
    .toLowerCase();
}

/**
 * Résout un compte users pour login identifiant+mot de passe.
 * Accepte pseudo, email, ou l'alias canonique admin (ex. oliviera9) même si le pseudo BDD diffère.
 */
async function resolveLoginAccountByIdentifier(identifier) {
  const normalized = normalizeOptionalString(identifier);
  if (!normalized) return null;

  let account = await queryOne(
    `SELECT * FROM users
      WHERE LOWER(pseudo) = LOWER(?) OR LOWER(email) = LOWER(?)
      LIMIT 1`,
    [normalized, normalized],
  );
  if (account) return account;

  const canonicalLogin = adminCanonicalLogin();
  if (normalized.toLowerCase() !== canonicalLogin) return null;

  const adminEmail = normalizeEmail(process.env.TEACHER_ADMIN_EMAIL);
  if (adminEmail) {
    account = await queryOne(
      `SELECT * FROM users
        WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?)
        LIMIT 1`,
      [adminEmail],
    );
    if (account) return account;
  }

  return queryOne(
    `SELECT u.* FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'teacher' AND ur.is_primary = 1
     INNER JOIN roles r ON r.id = ur.role_id AND r.slug = 'admin'
     WHERE u.user_type = 'teacher'
     LIMIT 1`,
  );
}

module.exports = {
  ensureCanonicalUserByAuth,
  resolveActorFromReq,
  resolveLoginAccountByIdentifier,
  adminCanonicalLogin,
  canonicalFromEmail,
  normalizeEmail,
};
