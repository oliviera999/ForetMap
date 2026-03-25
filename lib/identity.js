const { v4: uuidv4 } = require('uuid');
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
  legacyUserId,
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
  const row = await queryOne(
    'SELECT id FROM users WHERE user_type = ? AND legacy_user_id = ? LIMIT 1',
    [userType, legacyUserId]
  );
  const id = row?.id || uuidv4();
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
      legacyUserId,
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
  let full = student;
  if (student.first_name == null || student.last_name == null || student.password === undefined) {
    full = await queryOne('SELECT * FROM students WHERE id = ? LIMIT 1', [student.id]) || student;
  }
  return upsertCanonicalUser({
    userType: 'student',
    legacyUserId: full.id,
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
    passwordHash: full.password,
    authProvider: full.password ? 'local' : 'google',
    isActive: 1,
    lastSeen: full.last_seen,
  });
}

async function ensureCanonicalUserFromTeacher(teacher) {
  if (!teacher?.id) return null;
  let full = teacher;
  if (teacher.email == null || teacher.password_hash === undefined || teacher.display_name === undefined) {
    full = await queryOne('SELECT * FROM teachers WHERE id = ? LIMIT 1', [teacher.id]) || teacher;
  }
  return upsertCanonicalUser({
    userType: 'teacher',
    legacyUserId: full.id,
    email: full.email,
    pseudo: canonicalFromEmail(full.email),
    firstName: null,
    lastName: null,
    displayName: full.display_name || full.email,
    description: null,
    avatarPath: null,
    affiliation: 'both',
    passwordHash: full.password_hash,
    authProvider: 'local',
    isActive: full.is_active == null ? 1 : !!full.is_active,
    lastSeen: full.last_seen,
  });
}

async function ensureCanonicalUserByAuth(auth) {
  if (!auth?.userId || !auth?.userType) return null;
  const existing = await queryOne(
    'SELECT id FROM users WHERE user_type = ? AND legacy_user_id = ? LIMIT 1',
    [auth.userType, auth.userId]
  );
  if (existing?.id) return existing.id;
  if (auth.userType === 'student') {
    const student = await queryOne('SELECT * FROM students WHERE id = ? LIMIT 1', [auth.userId]);
    return ensureCanonicalUserFromStudent(student);
  }
  if (auth.userType === 'teacher') {
    const teacher = await queryOne('SELECT * FROM teachers WHERE id = ? LIMIT 1', [auth.userId]);
    return ensureCanonicalUserFromTeacher(teacher);
  }
  return null;
}

function resolveActorFromReq(req) {
  const auth = req?.auth;
  if (auth?.userId && auth?.userType) {
    return { actorUserType: auth.userType, actorLegacyUserId: auth.userId };
  }
  return { actorUserType: null, actorLegacyUserId: null };
}

module.exports = {
  ensureCanonicalUserFromStudent,
  ensureCanonicalUserFromTeacher,
  ensureCanonicalUserByAuth,
  resolveActorFromReq,
  canonicalFromEmail,
  normalizeEmail,
};
