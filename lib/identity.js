const { queryOne, execute } = require('../database');

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

function canonicalFromEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return null;
  return email.split('@')[0] || null;
}

function buildDisplayName({ firstName, lastName, fallback } = {}) {
  const first = normalizeOptionalString(firstName);
  const last = normalizeOptionalString(lastName);
  const merged = [first, last].filter(Boolean).join(' ').trim();
  if (merged) return merged;
  return normalizeOptionalString(fallback) || null;
}

async function upsertCanonicalUser({
  userType,
  userId,
  email,
  pseudo,
  firstName,
  lastName,
  displayName,
  description,
  avatarPath,
  affiliation,
  passwordHash,
  authProvider,
  isActive = 1,
  lastSeen = null,
}) {
  const id = String(userId || '').trim();
  if (!id) return null;
  await execute(
    `INSERT INTO users (
      id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
      description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      email = VALUES(email),
      pseudo = VALUES(pseudo),
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      display_name = VALUES(display_name),
      description = VALUES(description),
      avatar_path = VALUES(avatar_path),
      affiliation = VALUES(affiliation),
      password_hash = VALUES(password_hash),
      auth_provider = VALUES(auth_provider),
      is_active = VALUES(is_active),
      last_seen = VALUES(last_seen),
      updated_at = CURRENT_TIMESTAMP`,
    [
      id,
      userType,
      null,
      normalizeEmail(email),
      normalizeOptionalString(pseudo),
      normalizeOptionalString(firstName),
      normalizeOptionalString(lastName),
      normalizeOptionalString(displayName),
      normalizeOptionalString(description),
      normalizeOptionalString(avatarPath),
      normalizeOptionalString(affiliation) || 'both',
      normalizeOptionalString(passwordHash),
      normalizeOptionalString(authProvider) || 'local',
      isActive ? 1 : 0,
      normalizeOptionalString(lastSeen),
    ]
  );
  return id;
}

async function ensureCanonicalUserFromStudent(student) {
  if (!student?.id) return null;
  const full = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [student.id]) || student;
  return upsertCanonicalUser({
    userType: 'student',
    userId: full.id,
    email: full.email,
    pseudo: full.pseudo,
    firstName: full.first_name,
    lastName: full.last_name,
    displayName: buildDisplayName({
      firstName: full.first_name,
      lastName: full.last_name,
      fallback: full.pseudo,
    }),
    description: full.description,
    avatarPath: full.avatar_path,
    affiliation: full.affiliation || 'both',
    passwordHash: full.password_hash,
    authProvider: full.auth_provider || (full.password_hash ? 'local' : 'google'),
    isActive: full.is_active == null ? 1 : !!full.is_active,
    lastSeen: full.last_seen,
  });
}

async function ensureCanonicalUserFromTeacher(teacher) {
  if (!teacher?.id) return null;
  const full = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [teacher.id]) || teacher;
  return upsertCanonicalUser({
    userType: 'teacher',
    userId: full.id,
    email: full.email,
    pseudo: full.pseudo || canonicalFromEmail(full.email),
    firstName: full.first_name || null,
    lastName: full.last_name || null,
    displayName: full.display_name || full.email,
    description: full.description || null,
    avatarPath: full.avatar_path || null,
    affiliation: full.affiliation || 'both',
    passwordHash: full.password_hash,
    authProvider: full.auth_provider || 'local',
    isActive: full.is_active == null ? 1 : !!full.is_active,
    lastSeen: full.last_seen,
  });
}

async function ensureCanonicalUserByAuth(auth) {
  if (!auth?.userId) return null;
  const existing = await queryOne(
    'SELECT id FROM users WHERE id = ? LIMIT 1',
    [auth.userId]
  );
  if (existing?.id) return existing.id;
  const sameType = await queryOne(
    'SELECT id FROM users WHERE id = ? AND user_type = ? LIMIT 1',
    [auth.userId, auth.userType || 'student']
  );
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

module.exports = {
  ensureCanonicalUserFromStudent,
  ensureCanonicalUserFromTeacher,
  ensureCanonicalUserByAuth,
  resolveActorFromReq,
  canonicalFromEmail,
  normalizeEmail,
};
