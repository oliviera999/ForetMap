const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const { queryOne, execute } = require('../database');
const { JWT_SECRET, requireAuth, signAuthToken } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitStudentsChanged } = require('../lib/realtime');
const { sendPasswordResetEmail } = require('../lib/mailer');
const {
  ensureRbacBootstrap,
  buildAuthzPayload,
  ensurePrimaryRole,
  verifyRolePin,
} = require('../lib/rbac');
const { getSettingValue } = require('../lib/settings');
const { countStudentActiveTaskAssignments } = require('../lib/studentTaskEnrollment');
const { logAudit, logSecurityEvent } = require('./audit');
const {
  ensureCanonicalUserByAuth,
} = require('../lib/identity');
const { saveBase64ToDisk, deleteFile } = require('../lib/uploads');

const router = express.Router();
const MAX_DESCRIPTION_LEN = 300;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_MIN_LEN = 4;
const PASSWORD_RESET_TTL_MINUTES = 60;
const ALLOWED_STUDENT_AFFILIATIONS = new Set(['n3', 'foret', 'both']);
const OAUTH_STATE_COOKIE = 'foretmap_oauth_state';
const OAUTH_MODE_COOKIE = 'foretmap_oauth_mode';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const GOOGLE_ALLOWED_DOMAINS_DEFAULT = ['pedagolyautey.org', 'lyceelyautey.org'];
const GOOGLE_ALLOWED_EMAILS_DEFAULT = ['oliv.arn.lau@gmail.com'];
const googleOidcClient = new OAuth2Client();
const googleOAuthHooks = {
  exchangeCode: null,
  verifyIdToken: null,
};

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

function normalizeStudentAffiliation(value) {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'both';
  const normalized = raw.toLowerCase();
  if (!ALLOWED_STUDENT_AFFILIATIONS.has(normalized)) return null;
  return normalized;
}

function detectAvatarExtension(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const raw = String(m[1]).toLowerCase();
  return raw === 'jpeg' ? 'jpg' : raw;
}

function parseCsvLowercaseSet(raw, defaults = []) {
  const value = String(raw || '').trim();
  if (!value) return new Set(defaults.map((v) => String(v).trim().toLowerCase()).filter(Boolean));
  return new Set(
    value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function readCookie(req, name) {
  const header = req?.headers?.cookie;
  if (!header) return null;
  const parts = String(header).split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

function makeGoogleOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

function normalizeOAuthMode(value) {
  return String(value || '').toLowerCase() === 'teacher' ? 'teacher' : 'student';
}

function getGoogleOauthConfig(req) {
  const clientId = normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = normalizeOptionalString(process.env.GOOGLE_OAUTH_REDIRECT_URI)
    || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const frontendOrigin = normalizeOptionalString(process.env.FRONTEND_ORIGIN)
    || normalizeOptionalString(process.env.PASSWORD_RESET_BASE_URL)
    || `${req.protocol}://${req.get('host')}`;
  const allowedDomains = parseCsvLowercaseSet(process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS, GOOGLE_ALLOWED_DOMAINS_DEFAULT);
  const allowedEmails = parseCsvLowercaseSet(process.env.GOOGLE_OAUTH_ALLOWED_EMAILS, GOOGLE_ALLOWED_EMAILS_DEFAULT);
  return { clientId, clientSecret, redirectUri, frontendOrigin, allowedDomains, allowedEmails };
}

function googleOauthConfigured(cfg) {
  return !!(cfg?.clientId && cfg?.clientSecret && cfg?.redirectUri);
}

async function exchangeGoogleCode({ code, clientId, clientSecret, redirectUri }) {
  if (googleOAuthHooks.exchangeCode) {
    return googleOAuthHooks.exchangeCode({ code, clientId, clientSecret, redirectUri });
  }
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!tokenRes.ok) throw new Error('Échange OAuth Google échoué');
  return tokenRes.json();
}

async function verifyGoogleIdToken({ idToken, audience }) {
  if (googleOAuthHooks.verifyIdToken) {
    return googleOAuthHooks.verifyIdToken({ idToken, audience });
  }
  const ticket = await googleOidcClient.verifyIdToken({ idToken, audience });
  return ticket.getPayload() || null;
}

function splitDisplayName(name) {
  const value = normalizeOptionalString(name);
  if (!value) return { firstName: 'Google', lastName: 'Utilisateur' };
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0], lastName: 'Utilisateur' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function isGoogleEmailAllowed(email, hd, allowedDomains, allowedEmails) {
  if (!email) return false;
  if (allowedEmails.has(email)) return true;
  const domain = String(email.split('@')[1] || '').toLowerCase();
  if (domain && allowedDomains.has(domain)) return true;
  const hostedDomain = normalizeOptionalString(hd)?.toLowerCase();
  if (hostedDomain && hostedDomain === domain && allowedDomains.has(hostedDomain)) return true;
  return false;
}

function encodeOAuthPayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function buildOAuthFrontendRedirect(frontendOrigin, payload) {
  const base = String(frontendOrigin || '').replace(/\/+$/, '');
  return `${base}/#oauth=${encodeURIComponent(encodeOAuthPayload(payload))}`;
}

function buildOAuthFrontendErrorRedirect(frontendOrigin, code, mode) {
  const base = String(frontendOrigin || '').replace(/\/+$/, '');
  return `${base}/#oauth_error=${encodeURIComponent(code)}&mode=${encodeURIComponent(normalizeOAuthMode(mode))}`;
}

function validateProfileInput({ pseudo, email, description }) {
  if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
    return 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)';
  }
  if (email != null && !EMAIL_RE.test(email)) {
    return 'Email invalide';
  }
  if (description != null && description.length > MAX_DESCRIPTION_LEN) {
    return `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`;
  }
  return null;
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getPasswordResetBaseUrl() {
  return process.env.PASSWORD_RESET_BASE_URL
    || process.env.FRONTEND_ORIGIN
    || 'http://localhost:3000';
}

async function getPasswordMinLength() {
  const n = await getSettingValue('security.password_min_length', PASSWORD_RESET_MIN_LEN);
  const parsed = parseInt(n, 10);
  if (!Number.isFinite(parsed)) return PASSWORD_RESET_MIN_LEN;
  return Math.min(Math.max(parsed, 4), 32);
}

function makeResetUrl(type, token) {
  const base = getPasswordResetBaseUrl().replace(/\/$/, '');
  return `${base}/?resetType=${encodeURIComponent(type)}&resetToken=${encodeURIComponent(token)}`;
}

async function createPasswordResetToken(userType, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);
  const ttlMs = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await execute(
    'INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)',
    [uuidv4(), userType, userId, tokenHash, expiresAt]
  );
  return token;
}

async function consumePasswordResetToken(userType, token) {
  const tokenHash = hashResetToken(token);
  const row = await queryOne(
    `SELECT id, user_id
       FROM password_reset_tokens
      WHERE user_type = ?
        AND token_hash = ?
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [userType, tokenHash]
  );
  if (!row) return null;

  const result = await execute(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
    [row.id]
  );
  if (!result.affectedRows) return null;
  return row.user_id;
}

let seedTeacherChecked = false;
async function ensureTeacherSeedFromEnv() {
  if (seedTeacherChecked) return;
  seedTeacherChecked = true;
  const email = normalizeEmail(process.env.TEACHER_ADMIN_EMAIL);
  const password = normalizeOptionalString(process.env.TEACHER_ADMIN_PASSWORD);
  const displayName = normalizeOptionalString(process.env.TEACHER_ADMIN_DISPLAY_NAME) || 'n3boss';
  if (!email || !password || password.length < PASSWORD_RESET_MIN_LEN) return;

  const existing = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [email]
  );
  if (existing) return;

  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  try {
    const teacherId = uuidv4();
    await execute(
      `INSERT INTO users
        (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
       VALUES (?, 'teacher', NULL, ?, ?, NULL, NULL, ?, NULL, NULL, 'both', ?, 'local', 1, ?, NOW(), NOW())`,
      [teacherId, email, email.split('@')[0] || null, displayName, hash, now]
    );
    await ensurePrimaryRole('teacher', teacherId, 'admin');
  } catch (err) {
    if (!(err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY'))) {
      throw err;
    }
  }
}

async function buildSessionPayload(userType, userId, elevated = false) {
  const canonicalUserId = await ensureCanonicalUserByAuth({ userType, userId });
  const authz = await buildAuthzPayload(userType, userId, elevated);
  if (!authz) return null;
  return {
    tokenPayload: {
      userType,
      userId,
      canonicalUserId: canonicalUserId || null,
      roleId: authz.roleId,
      roleSlug: authz.roleSlug,
      roleDisplayName: authz.roleDisplayName,
      permissions: authz.permissions,
      elevated,
    },
    authz,
  };
}

async function resolveLoginUserType(user) {
  const explicit = normalizeOptionalString(user?.user_type)?.toLowerCase();
  const primary = await queryOne(
    `SELECT ur.user_type
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND ur.is_primary = 1
      ORDER BY r.\`rank\` DESC, ur.assigned_at ASC
      LIMIT 1`,
    [user?.id]
  );
  if (primary?.user_type) return String(primary.user_type).toLowerCase();
  if (explicit) return explicit;
  return 'student';
}

function exposeAuth(auth) {
  return {
    userType: auth.userType,
    userId: auth.userId,
    canonicalUserId: auth.canonicalUserId || null,
    roleId: auth.roleId,
    roleSlug: auth.roleSlug,
    roleDisplayName: auth.roleDisplayName,
    permissions: auth.permissions,
    elevated: !!auth.elevated,
  };
}

function respondInternalError(res, req, err, message = 'Erreur serveur') {
  logRouteError(err, req);
  return res.status(500).json({ error: message });
}

router.get('/me', requireAuth, async (req, res) => {
  const auth = exposeAuth(req.auth);
  const body = { auth };
  if (req.auth?.userType === 'student' && req.auth?.userId) {
    const u = await queryOne(
      "SELECT first_name, last_name, COALESCE(forum_participate, 1) AS forum_participate FROM users WHERE id = ? AND user_type = 'student' LIMIT 1",
      [req.auth.userId]
    );
    if (u) {
      const maxActive = await getSettingValue('tasks.student_max_active_assignments', 0);
      const current = await countStudentActiveTaskAssignments(req.auth.userId, u.first_name, u.last_name);
      body.taskEnrollment = {
        maxActiveAssignments: maxActive,
        currentActiveAssignments: current,
        atLimit: maxActive > 0 && current >= maxActive,
      };
      body.forumParticipate = Number(u.forum_participate) !== 0;
    }
  }
  res.json(body);
});

router.patch('/me/profile', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });

    const auth = req.auth || {};
    const account = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [auth.userId]);
    if (!account) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!account.password_hash) return res.status(401).json({ error: 'Ce compte n\'a pas de mot de passe. Contactez un responsable.' });

    const passwordOk = await bcrypt.compare(String(body.currentPassword), account.password_hash);
    if (!passwordOk) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    const hasPseudo = Object.prototype.hasOwnProperty.call(body, 'pseudo');
    const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email')
      || Object.prototype.hasOwnProperty.call(body, 'mail');
    const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
    const hasAffiliation = Object.prototype.hasOwnProperty.call(body, 'affiliation');
    const hasAvatarData = Object.prototype.hasOwnProperty.call(body, 'avatarData');
    const removeAvatar = !!body.removeAvatar;
    if (!hasPseudo && !hasEmail && !hasDescription && !hasAffiliation && !hasAvatarData && !removeAvatar) {
      return res.status(400).json({ error: 'Aucun champ de profil à mettre à jour' });
    }

    const pseudo = hasPseudo ? normalizeOptionalString(body.pseudo) : account.pseudo;
    const email = hasEmail ? normalizeEmail(body.email ?? body.mail) : account.email;
    const description = hasDescription ? normalizeOptionalString(body.description) : account.description;
    const affiliation = hasAffiliation
      ? normalizeStudentAffiliation(body.affiliation)
      : (normalizeStudentAffiliation(account.affiliation) || 'both');
    let avatarPath = account.avatar_path || null;

    const profileError = validateProfileInput({ pseudo, email, description });
    if (profileError) return res.status(400).json({ error: profileError });
    if (!affiliation) return res.status(400).json({ error: "Affiliation invalide (n3, foret ou both)" });
    if (hasAvatarData) {
      const avatarData = normalizeOptionalString(body.avatarData);
      if (!avatarData) return res.status(400).json({ error: 'Image de profil invalide' });
      const ext = detectAvatarExtension(avatarData);
      if (!ext) return res.status(400).json({ error: 'Format image invalide (png/jpg/webp)' });
      const base64Payload = avatarData.includes(',') ? avatarData.split(',')[1] : avatarData;
      const bytes = Buffer.byteLength(base64Payload, 'base64');
      if (bytes > MAX_AVATAR_BYTES) {
        return res.status(400).json({ error: 'Image trop lourde (max 2 Mo)' });
      }
      const userFolder = String(account.user_type || 'users').toLowerCase();
      const relativePath = `${userFolder}/${account.id}/avatar-${Date.now()}.${ext}`;
      saveBase64ToDisk(relativePath, avatarData);
      if (account.avatar_path && account.avatar_path !== relativePath) {
        deleteFile(account.avatar_path);
      }
      avatarPath = relativePath;
    } else if (removeAvatar) {
      if (account.avatar_path) deleteFile(account.avatar_path);
      avatarPath = null;
    }

    if (pseudo) {
      const existingPseudo = await queryOne('SELECT id FROM users WHERE LOWER(pseudo)=LOWER(?) AND id <> ? LIMIT 1', [pseudo, account.id]);
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne('SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND id <> ? LIMIT 1', [email, account.id]);
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    try {
      await execute(
        `UPDATE users
            SET pseudo = ?, email = ?, description = ?, affiliation = ?, avatar_path = ?, updated_at = NOW()
          WHERE id = ?`,
        [pseudo, email, description, affiliation, avatarPath, account.id]
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }

    const updated = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [account.id]);
    logAudit('update_user_profile', 'user', account.id, `${updated?.first_name || ''} ${updated?.last_name || ''}`.trim() || updated?.display_name || account.id, {
      req,
      actorUserType: account.user_type,
      actorUserId: account.id,
      payload: { pseudo: !!hasPseudo, email: !!hasEmail, description: !!hasDescription, affiliation: !!hasAffiliation, avatar: !!(hasAvatarData || removeAvatar) },
    });
    if (String(account.user_type || '').toLowerCase() === 'student') {
      emitStudentsChanged({ reason: 'student_profile_update', studentId: account.id });
    }
    res.json({ ...updated, password_hash: undefined });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/register', async (req, res) => {
  try {
    const allowReg = await getSettingValue('ui.auth.allow_register', true);
    if (!allowReg) return res.status(403).json({ error: 'La création de compte est désactivée.' });
    const { firstName, lastName, password } = req.body;
    const pseudo = normalizeOptionalString(req.body?.pseudo);
    const email = normalizeEmail(req.body?.email ?? req.body?.mail);
    const description = normalizeOptionalString(req.body?.description);
    const affiliation = normalizeStudentAffiliation(req.body?.affiliation);
    if (!firstName?.trim() || !lastName?.trim()) return res.status(400).json({ error: 'Prénom et nom requis' });
    const minPasswordLen = await getPasswordMinLength();
    if (!password || password.length < minPasswordLen) return res.status(400).json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    if (!affiliation) return res.status(400).json({ error: "Affiliation invalide (n3, foret ou both)" });
    const profileError = validateProfileInput({ pseudo, email, description });
    if (profileError) return res.status(400).json({ error: profileError });

    const existing = await queryOne(
      "SELECT * FROM users WHERE user_type = 'student' AND LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)",
      [firstName.trim(), lastName.trim()]
    );
    if (existing) return res.status(409).json({ error: 'Un compte avec ce nom existe déjà' });
    if (pseudo) {
      const existingPseudo = await queryOne("SELECT id FROM users WHERE LOWER(pseudo)=LOWER(?)", [pseudo]);
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne("SELECT id FROM users WHERE LOWER(email)=LOWER(?)", [email]);
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hash = await bcrypt.hash(password, 10);
    const id   = uuidv4();
    const now  = new Date().toISOString();
    try {
      await execute(
        `INSERT INTO users
          (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
         VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'local', 1, ?, NOW(), NOW())`,
        [id, email, pseudo, firstName.trim(), lastName.trim(), `${firstName.trim()} ${lastName.trim()}`.trim(), description, affiliation, hash, now]
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }
    await ensurePrimaryRole('student', id, 'visiteur');
    const student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [id]);
    const session = await buildSessionPayload('student', id, false);
    const token = session ? signAuthToken(session.tokenPayload, false) : null;
    await logSecurityEvent('auth.register.student', {
      req,
      actorUserType: 'student',
      actorUserId: id,
      targetType: 'student',
      targetId: id,
      payload: { via: 'password' },
    });
    emitStudentsChanged({ reason: 'register', studentId: id });
    res.status(201).json({
      ...student,
      password_hash: undefined,
      authToken: token,
      auth: session ? exposeAuth(session.tokenPayload) : null,
    });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const identifier = normalizeOptionalString(req.body?.identifier);
    if (!password || !identifier) return res.status(400).json({ error: 'Identifiant (email ou pseudo) et mot de passe requis' });
    await ensureTeacherSeedFromEnv();

    const account = await queryOne(
      "SELECT * FROM users WHERE (LOWER(pseudo)=LOWER(?) OR LOWER(email)=LOWER(?)) LIMIT 1",
      [identifier, identifier]
    );

    if (!account) {
      await logSecurityEvent('auth.login', {
        req,
        result: 'failure',
        reason: 'account_not_found',
        payload: { identifier },
      });
      return res.status(401).json({ error: 'Compte introuvable' });
    }
    if (!account.password_hash) {
      await logSecurityEvent('auth.login', {
        req,
        actorUserType: account.user_type,
        actorUserId: account.id,
        targetType: account.user_type,
        targetId: account.id,
        result: 'failure',
        reason: 'password_not_set',
      });
      return res.status(401).json({ error: 'Ce compte n\'a pas de mot de passe. Contactez le prof.' });
    }

    if (account.is_active != null && !Number(account.is_active)) {
      await logSecurityEvent('auth.login', {
        req,
        actorUserType: account.user_type,
        actorUserId: account.id,
        targetType: account.user_type,
        targetId: account.id,
        result: 'failure',
        reason: 'account_inactive',
      });
      return res.status(401).json({ error: 'Compte inactif' });
    }

    const ok = await bcrypt.compare(password, account.password_hash);
    if (!ok) {
      await logSecurityEvent('auth.login', {
        req,
        actorUserType: account.user_type,
        actorUserId: account.id,
        targetType: account.user_type,
        targetId: account.id,
        result: 'failure',
        reason: 'password_invalid',
      });
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    const userType = await resolveLoginUserType(account);
    const preferredRole = userType === 'teacher' || userType === 'user' ? 'prof' : 'eleve_novice';
    await ensurePrimaryRole(userType, account.id, preferredRole);
    await execute('UPDATE users SET last_seen = ?, updated_at = NOW() WHERE id = ?', [new Date().toISOString(), account.id]);
    let session = await buildSessionPayload(userType, account.id, false);
    if (!session && userType !== 'teacher') {
      session = await buildSessionPayload('teacher', account.id, false);
    }
    if (!session && userType !== 'student') {
      session = await buildSessionPayload('student', account.id, false);
    }
    if (!session) {
      return res.status(403).json({ error: 'Aucun profil attribué' });
    }
    const token = session ? signAuthToken(session.tokenPayload, false) : null;
    await logSecurityEvent('auth.login', {
      req,
      actorUserType: session.tokenPayload.userType,
      actorUserId: account.id,
      targetType: session.tokenPayload.userType,
      targetId: account.id,
      payload: { via: 'identifier' },
    });
    const safeUser = { ...account };
    delete safeUser.password_hash;
    res.json({
      ...safeUser,
      authToken: token,
      auth: session ? exposeAuth(session.tokenPayload) : null,
    });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.get('/google/start', async (req, res) => {
  const mode = normalizeOAuthMode(req.query?.mode);
  const googleEnabled = await getSettingValue('integration.google.enabled', true);
  const allowStudent = await getSettingValue('ui.auth.allow_google_student', true);
  const allowTeacher = await getSettingValue('ui.auth.allow_google_teacher', true);
  if (!googleEnabled || (mode === 'teacher' ? !allowTeacher : !allowStudent)) {
    return res.status(403).json({ error: 'Connexion Google désactivée par l’administrateur' });
  }
  const cfg = getGoogleOauthConfig(req);
  if (!googleOauthConfigured(cfg)) {
    return res.status(503).json({ error: 'OAuth Google non configuré' });
  }
  const state = makeGoogleOAuthState();
  const cookieSecure = process.env.NODE_ENV === 'production';
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: OAUTH_STATE_TTL_MS,
    path: '/api/auth/google',
  });
  res.cookie(OAUTH_MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: OAUTH_STATE_TTL_MS,
    path: '/api/auth/google',
  });
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  const googleEnabled = await getSettingValue('integration.google.enabled', true);
  if (!googleEnabled) {
    return res.redirect(buildOAuthFrontendErrorRedirect(
      normalizeOptionalString(process.env.FRONTEND_ORIGIN) || `${req.protocol}://${req.get('host')}`,
      'oauth_not_configured',
      normalizeOAuthMode(req.query?.mode)
    ));
  }
  const cfg = getGoogleOauthConfig(req);
  const stateCookie = readCookie(req, OAUTH_STATE_COOKIE);
  const modeCookie = normalizeOAuthMode(readCookie(req, OAUTH_MODE_COOKIE));
  const mode = normalizeOAuthMode(modeCookie || req.query?.mode);
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth/google' });
  res.clearCookie(OAUTH_MODE_COOKIE, { path: '/api/auth/google' });

  if (!googleOauthConfigured(cfg)) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_not_configured', mode));
  }
  if (normalizeOptionalString(req.query?.error)) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_google_refused', mode));
  }
  const state = normalizeOptionalString(req.query?.state);
  if (!state || !stateCookie || state !== stateCookie) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_invalid_state', mode));
  }
  const code = normalizeOptionalString(req.query?.code);
  if (!code) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_missing_code', mode));
  }

  try {
    const tokenData = await exchangeGoogleCode({
      code,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: cfg.redirectUri,
    });
    const idToken = normalizeOptionalString(tokenData?.id_token);
    if (!idToken) {
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_missing_id_token', mode));
    }
    const payload = await verifyGoogleIdToken({ idToken, audience: cfg.clientId });
    if (!payload) {
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_invalid_token', mode));
    }
    const email = normalizeEmail(payload.email);
    const issuer = String(payload.iss || '');
    const emailVerified = payload.email_verified === true || String(payload.email_verified) === 'true';
    const audience = String(payload.aud || '');
    if (!email || !emailVerified || audience !== cfg.clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(issuer)) {
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_claims_invalid', mode));
    }
    if (!isGoogleEmailAllowed(email, payload.hd, cfg.allowedDomains, cfg.allowedEmails)) {
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_email_not_allowed', mode));
    }

    const teacher = await queryOne(
      "SELECT id, email, is_active FROM users WHERE user_type = 'teacher' AND LOWER(email)=LOWER(?) LIMIT 1",
      [email]
    );
    if (teacher) {
      if (!teacher.is_active) {
        return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_teacher_inactive', mode));
      }
      await ensurePrimaryRole('teacher', teacher.id, 'prof');
      const now = new Date().toISOString();
      await execute("UPDATE users SET last_seen = ?, updated_at = NOW() WHERE id = ? AND user_type = 'teacher'", [now, teacher.id]);
      const session = await buildSessionPayload('teacher', teacher.id, false);
      if (!session) {
        return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_teacher_no_role', mode));
      }
      const token = signAuthToken(session.tokenPayload, false);
      await logSecurityEvent('auth.login.teacher.oauth_google', {
        req,
        actorUserType: 'teacher',
        actorUserId: teacher.id,
        targetType: 'teacher',
        targetId: teacher.id,
      });
      return res.redirect(buildOAuthFrontendRedirect(cfg.frontendOrigin, {
        type: 'teacher',
        token,
        auth: exposeAuth(session.tokenPayload),
      }));
    }

    let student = await queryOne(
      "SELECT * FROM users WHERE user_type = 'student' AND LOWER(email)=LOWER(?) LIMIT 1",
      [email]
    );
    if (!student) {
      const id = uuidv4();
      const now = new Date().toISOString();
      const splitName = splitDisplayName(payload.name);
      const firstName = normalizeOptionalString(payload.given_name) || splitName.firstName;
      const lastName = normalizeOptionalString(payload.family_name) || splitName.lastName;
      await execute(
        `INSERT INTO users
          (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
         VALUES (?, 'student', NULL, ?, NULL, ?, ?, ?, 'Compte Google', NULL, 'both', NULL, 'google', 1, ?, NOW(), NOW())`,
        [id, email, firstName, lastName, `${firstName} ${lastName}`.trim(), now]
      );
      await ensurePrimaryRole('student', id, 'visiteur');
      emitStudentsChanged({ reason: 'register_google', studentId: id });
      student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [id]);
    } else {
      await execute("UPDATE users SET last_seen = ? WHERE id = ? AND user_type = 'student'", [new Date().toISOString(), student.id]);
      student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [student.id]);
    }

    const session = await buildSessionPayload('student', student.id, false);
    const token = session ? signAuthToken(session.tokenPayload, false) : null;
    await logSecurityEvent('auth.login.student.oauth_google', {
      req,
      actorUserType: 'student',
      actorUserId: student.id,
      targetType: 'student',
      targetId: student.id,
    });
    return res.redirect(buildOAuthFrontendRedirect(cfg.frontendOrigin, {
      type: 'student',
      student: {
        ...student,
        password_hash: undefined,
        authToken: token,
        auth: session ? exposeAuth(session.tokenPayload) : null,
      },
    }));
  } catch (e) {
    logRouteError(e, req);
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_server_error', mode));
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email ?? req.body?.mail);
    if (!email || !EMAIL_RE.test(email)) {
      return res.json({ ok: true, message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });
    }
    const student = await queryOne(
      "SELECT id, first_name, last_name, email, password_hash FROM users WHERE user_type = 'student' AND LOWER(email)=LOWER(?) LIMIT 1",
      [email]
    );
    if (student && student.password_hash) {
      const token = await createPasswordResetToken('student', student.id);
      await sendPasswordResetEmail({
        to: student.email,
        displayName: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'n3beur',
        resetUrl: makeResetUrl('student', token),
        roleLabel: 'n3beur',
      });
      await logSecurityEvent('auth.password_reset.request.student', {
        req,
        actorUserType: 'student',
        actorUserId: student.id,
        targetType: 'student',
        targetId: student.id,
      });
    }
    res.json({ ok: true, message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = normalizeOptionalString(req.body?.token);
    const password = req.body?.password;
    if (!token || !password) return res.status(400).json({ error: 'Champs requis' });
    const minPasswordLen = await getPasswordMinLength();
    if (String(password).length < minPasswordLen) {
      return res.status(400).json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    }
    const studentId = await consumePasswordResetToken('student', token);
    if (!studentId) return res.status(400).json({ error: 'Token invalide ou expiré' });
    const hash = await bcrypt.hash(password, 10);
    await execute("UPDATE users SET password_hash = ? WHERE id = ? AND user_type = 'student'", [hash, studentId]);
    await logSecurityEvent('auth.password_reset.confirm.student', {
      req,
      actorUserType: 'student',
      actorUserId: studentId,
      targetType: 'student',
      targetId: studentId,
    });
    res.json({ ok: true });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/teacher/login', async (req, res) => {
  return res.status(410).json({ error: 'Endpoint supprimé. Utilisez /api/auth/login.' });
});

router.post('/teacher/forgot-password', async (req, res) => {
  try {
    await ensureTeacherSeedFromEnv();
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_RE.test(email)) {
      return res.json({ ok: true, message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });
    }
    const teacher = await queryOne(
      "SELECT id, email, is_active FROM users WHERE user_type = 'teacher' AND LOWER(email)=LOWER(?) LIMIT 1",
      [email]
    );
    if (teacher && teacher.is_active) {
      const token = await createPasswordResetToken('teacher', teacher.id);
      await sendPasswordResetEmail({
        to: teacher.email,
        displayName: 'n3boss',
        resetUrl: makeResetUrl('teacher', token),
        roleLabel: 'n3boss',
      });
      await logSecurityEvent('auth.password_reset.request.teacher', {
        req,
        actorUserType: 'teacher',
        actorUserId: teacher.id,
        targetType: 'teacher',
        targetId: teacher.id,
      });
    }
    res.json({ ok: true, message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/teacher/reset-password', async (req, res) => {
  try {
    const token = normalizeOptionalString(req.body?.token);
    const password = req.body?.password;
    if (!token || !password) return res.status(400).json({ error: 'Champs requis' });
    const minPasswordLen = await getPasswordMinLength();
    if (String(password).length < minPasswordLen) {
      return res.status(400).json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    }
    const teacherId = await consumePasswordResetToken('teacher', token);
    if (!teacherId) return res.status(400).json({ error: 'Token invalide ou expiré' });
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    await execute("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ? AND user_type = 'teacher'", [hash, teacherId]);
    await logSecurityEvent('auth.password_reset.confirm.teacher', {
      req,
      actorUserType: 'teacher',
      actorUserId: teacherId,
      targetType: 'teacher',
      targetId: teacherId,
    });
    res.json({ ok: true });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/elevate', requireAuth, async (req, res) => {
  try {
    const allowPinElevation = await getSettingValue('security.allow_pin_elevation', true);
    if (!allowPinElevation) return res.status(403).json({ error: 'Élévation PIN désactivée' });
    const pin = normalizeOptionalString(req.body?.pin);
    if (!pin) return res.status(400).json({ error: 'PIN requis' });
    if (!req.auth?.roleId) return res.status(401).json({ error: 'Session invalide' });

    const ok = await verifyRolePin(req.auth.roleId, pin);
    await execute(
      'INSERT INTO elevation_audit (user_type, user_id, role_id, success, reason) VALUES (?, ?, ?, ?, ?)',
      [req.auth.userType, req.auth.userId, req.auth.roleId, ok ? 1 : 0, ok ? 'ok' : 'pin_invalid']
    );
    if (!ok) return res.status(401).json({ error: 'PIN incorrect' });

    const session = await buildSessionPayload(req.auth.userType, req.auth.userId, true);
    if (!session) return res.status(403).json({ error: 'Aucun profil attribué' });
    const token = signAuthToken(session.tokenPayload, true);
    await logAudit('auth_elevate', 'auth', req.auth.userId, `Élévation ${req.auth.userType}`, {
      req,
      actorUserType: req.auth.userType,
      actorUserId: req.auth.userId,
      payload: { role_id: req.auth.roleId, elevated: true },
    });
    res.json({ token, auth: exposeAuth(session.tokenPayload) });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

// Compatibilité historique: "mode prof via PIN".
// Désormais, ce endpoint exige d'être déjà connecté puis élève la session.
router.post('/teacher', async (req, res) => {
  try {
    const allowPinElevation = await getSettingValue('security.allow_pin_elevation', true);
    if (!allowPinElevation) return res.status(403).json({ error: 'Élévation PIN désactivée' });
    const pin = normalizeOptionalString(req.body?.pin);
    if (!pin) return res.status(400).json({ error: 'PIN requis' });
    const bearer = req.headers.authorization;
    const tokenIn = bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : null;
    if (tokenIn) {
      let claims;
      try {
        claims = jwt.verify(tokenIn, JWT_SECRET);
      } catch (_) {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
      }
      const ok = await verifyRolePin(claims.roleId, pin);
      if (!ok) return res.status(401).json({ error: 'PIN incorrect' });
      const session = await buildSessionPayload(claims.userType, claims.userId, true);
      if (!session) return res.status(403).json({ error: 'Aucun profil attribué' });
      const token = signAuthToken(session.tokenPayload, true);
      await logAudit('auth_teacher_legacy_elevate', 'auth', claims.userId, `Élévation via endpoint legacy (${claims.userType})`, {
        req,
        actorUserType: claims.userType,
        actorUserId: claims.userId,
        payload: { role_id: claims.roleId, elevated: true },
      });
      return res.json({ token, auth: exposeAuth(session.tokenPayload) });
    }
    return res.status(401).json({ error: 'Token requis avant élévation PIN' });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.__setGoogleOAuthHooks = function setGoogleOAuthHooks({ exchangeCode, verifyIdToken } = {}) {
  googleOAuthHooks.exchangeCode = typeof exchangeCode === 'function' ? exchangeCode : null;
  googleOAuthHooks.verifyIdToken = typeof verifyIdToken === 'function' ? verifyIdToken : null;
};

module.exports = router;
