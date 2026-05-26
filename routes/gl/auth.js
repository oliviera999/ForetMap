const express = require('express');
const bcrypt = require('bcryptjs');
const { queryOne, execute } = require('../../database');
const { signAuthToken } = require('../../middleware/requireTeacher');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const { logAudit, logSecurityEvent } = require('../audit');
const {
  resolveGlStaffLogin,
  buildGlAdminClaims,
} = require('../../lib/glStaffAuth');
const { resolveGlPlayerLogin } = require('../../lib/glPlayerAuth');
const { getGlModulesSettings } = require('../../lib/glSettings');
const { parseBrandFromGlSettings } = require('../../lib/glBrand');
const { saveBase64ToDisk, deleteFile } = require('../../lib/uploads');
const {
  MAX_AVATAR_BYTES,
  normalizeEmail,
  normalizeOptionalString,
  detectAvatarExtension,
  validatePlayerProfileInput,
  validateStaffProfileInput,
} = require('../../lib/glProfile');
const {
  makeGoogleOAuthState,
  buildOAuthFrontendRedirect,
  buildOAuthFrontendErrorRedirect,
  exchangeGoogleCode,
  verifyGoogleIdToken,
} = require('../../lib/googleOAuthShared');
const { logRouteError } = require('../../lib/routeLog');
const { resolveOAuthPublicOrigin, resolveOAuthRedirectUri } = require('../../lib/oauthPublicUrl');
const { sendPasswordResetEmail } = require('../../lib/mailer');
const {
  EMAIL_RE,
  createPasswordResetToken,
  consumePasswordResetToken,
  getPasswordMinLength,
  makeResetUrl,
} = require('../../lib/passwordReset');

const router = express.Router();

const GL_OAUTH_STATE_COOKIE = 'gl_oauth_state';
const GL_OAUTH_MODE_COOKIE = 'gl_oauth_mode';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

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

function getGlRolePermissions(roleSlug) {
  const role = String(roleSlug || '').toLowerCase();
  if (role === 'admin' || role === 'mj') {
    return [
      'gl.read',
      'gl.content.manage',
      'gl.players.manage',
      'gl.game.manage',
      'gl.team.manage',
      'gl.event.emit',
      'gl.mascot.position',
      'gl.settings.manage',
    ];
  }
  return ['gl.read', 'gl.action.request'];
}

async function signGlToken(payload) {
  return signAuthToken({
    ...payload,
    product: 'gl',
  });
}

function exposeGlAuth(claims) {
  const auth = {
    product: 'gl',
    userType: claims.userType,
    userId: claims.userId,
    roleSlug: claims.roleSlug,
    displayName: claims.displayName || null,
    classId: claims.classId || null,
    teamId: claims.teamId || null,
    permissions: claims.permissions || [],
    passwordMustReset: !!claims.passwordMustReset,
  };
  if (claims.impersonating && claims.actorUserType && claims.actorUserId != null) {
    auth.impersonating = true;
    auth.impersonatedBy = {
      userType: String(claims.actorUserType),
      userId: String(claims.actorUserId),
      roleSlug: String(claims.actorRoleSlug || ''),
    };
  }
  return auth;
}

function buildGoogleConfig(req) {
  const clientId = normalizeOptionalString(process.env.GL_GOOGLE_OAUTH_CLIENT_ID)
    || normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = resolveOAuthRedirectUri(req, {
    envRedirectUri: process.env.GL_GOOGLE_OAUTH_REDIRECT_URI,
    callbackPath: '/api/gl/auth/google/callback',
  });
  const frontendOrigin = resolveOAuthPublicOrigin(req, process.env.GL_FRONTEND_ORIGIN);
  const allowedDomains = parseCsvLowercaseSet(
    process.env.GL_GOOGLE_OAUTH_ALLOWED_DOMAINS || process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS,
    ['pedagolyautey.org', 'lyceelyautey.org']
  );
  const allowedEmails = parseCsvLowercaseSet(
    process.env.GL_GOOGLE_OAUTH_ALLOWED_EMAILS || process.env.GOOGLE_OAUTH_ALLOWED_EMAILS,
    []
  );
  return { clientId, clientSecret, redirectUri, frontendOrigin, allowedDomains, allowedEmails };
}

function googleOauthConfigured(cfg) {
  return !!(cfg?.clientId && cfg?.clientSecret && cfg?.redirectUri);
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

function readCookie(req, name) {
  const raw = String(req.headers?.cookie || '');
  const parts = raw.split(';').map((p) => p.trim());
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1));
  }
  return null;
}

function normalizeGlOAuthMode(value) {
  const raw = String(value || '').toLowerCase();
  if (raw === 'player') return 'player';
  if (raw === 'staff') return 'staff';
  return 'auto';
}

const { resolveLoginAccountByIdentifier } = require('../../lib/identity');

async function attemptGlStaffPasswordLogin(identifier, password, { rejectStudent = false } = {}) {
  const account = await resolveLoginAccountByIdentifier(identifier);
  if (!account) {
    return { ok: false, status: 401, error: 'Identifiant ou mot de passe incorrect' };
  }
  if (!account.password_hash) {
    const provider = String(account.auth_provider || '').toLowerCase();
    if (provider === 'google') {
      return {
        ok: false,
        status: 401,
        error: 'Ce compte est lié à Google. Utilisez « Continuer avec Google » ou définissez un mot de passe depuis ForetMap.',
      };
    }
    return { ok: false, status: 401, error: 'Identifiant ou mot de passe incorrect' };
  }
  if (account.is_active != null && !Number(account.is_active)) {
    return { ok: false, status: 401, error: 'Compte inactif' };
  }
  const passOk = await bcrypt.compare(password, String(account.password_hash));
  if (!passOk) return { ok: false, status: 401, error: 'Identifiant ou mot de passe incorrect' };

  const userType = String(account.user_type || '').toLowerCase();
  if (userType === 'student') {
    if (rejectStudent) {
      return {
        ok: false,
        status: 403,
        error: 'Les comptes élèves ForetMap ne peuvent pas se connecter en tant que MJ.',
      };
    }
    return { ok: false, status: 401, error: 'Identifiant ou mot de passe incorrect' };
  }
  if (userType !== 'teacher') {
    return { ok: false, status: 403, error: 'Compte non autorisé pour la connexion MJ.' };
  }

  const loginKey = identifier.trim().toLowerCase();
  const pseudoKey = normalizeOptionalString(account.pseudo)?.toLowerCase() || null;
  const emailFromAccount = normalizeEmail(account.email);
  const emailFromLogin = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginKey) ? loginKey : null;
  const email = emailFromAccount || emailFromLogin;
  const displayName = normalizeOptionalString(account.display_name)
    || normalizeOptionalString(account.pseudo)
    || email
    || identifier;
  const alternateLoginIdentifiers = [];
  if (pseudoKey && pseudoKey !== loginKey) alternateLoginIdentifiers.push(pseudoKey);
  const resolved = await resolveGlStaffLogin({
    email,
    displayName,
    googleSub: null,
    teacherId: account.id,
    loginIdentifier: loginKey,
    alternateLoginIdentifiers,
  });
  if (!resolved.ok) {
    return { ok: false, status: resolved.status || 403, error: resolved.error };
  }
  const session = await issueGlStaffSession(resolved.admin, resolved.glRole);
  return { ok: true, session };
}

function parseBoolJsonSetting(rawValue, fallback = false) {
  try {
    if (rawValue == null) return fallback;
    return JSON.parse(String(rawValue)) === true;
  } catch (_) {
    return fallback;
  }
}

async function isForetmapLinkEnabled() {
  const row = await queryOne(
    "SELECT value_json FROM gl_settings WHERE `key` = 'platform.allow_player_link_foretmap' LIMIT 1"
  );
  return parseBoolJsonSetting(row?.value_json, false);
}

function buildGlOAuthFrontendErrorRedirect(frontendOrigin, code, mode) {
  const base = String(frontendOrigin || '').replace(/\/+$/, '');
  const modeParam = normalizeGlOAuthMode(mode) === 'player' ? '&oauth_mode=player' : '&oauth_mode=staff';
  return `${base}/#oauth_error=${encodeURIComponent(code)}${modeParam}`;
}

async function issueGlPlayerSession(player) {
  const claims = {
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    displayName: player.pseudo,
    classId: player.class_id ? Number(player.class_id) : null,
    teamId: player.team_id ? Number(player.team_id) : null,
    passwordMustReset: !!Number(player.password_must_reset || 0),
    permissions: getGlRolePermissions('player'),
  };
  const token = await signGlToken(claims);
  return { authToken: token, auth: exposeGlAuth(claims) };
}

async function issueGlStaffSession(admin, glRole) {
  const baseClaims = buildGlAdminClaims(admin, glRole);
  const claims = {
    ...baseClaims,
    permissions: getGlRolePermissions(glRole === 'mj' ? 'mj' : 'admin'),
  };
  const token = await signGlToken(claims);
  return { authToken: token, auth: exposeGlAuth(claims) };
}

function isStrictGlAdmin(auth) {
  return auth?.userType === 'gl_admin' && auth?.roleSlug === 'gl_admin';
}

async function completeGlGoogleOAuth({ cfg, payload, mode }) {
  const email = normalizeEmail(payload?.email);
  const issuer = String(payload?.iss || '');
  const emailVerified = payload?.email_verified === true || String(payload?.email_verified) === 'true';
  const audience = String(payload?.aud || '');
  if (!email || !emailVerified || audience !== cfg.clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(issuer)) {
    return { errorRedirect: buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_claims_invalid', mode) };
  }
  if (!isGoogleEmailAllowed(email, payload?.hd, cfg.allowedDomains, cfg.allowedEmails)) {
    return { errorRedirect: buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_email_not_allowed', mode) };
  }

  const displayName = normalizeOptionalString(payload?.name) || email;
  const googleSub = normalizeOptionalString(payload?.sub);
  const oauthMode = normalizeGlOAuthMode(mode);

  if (oauthMode === 'player' || oauthMode === 'auto') {
    const resolved = await resolveGlPlayerLogin({ email, googleSub });
    if (resolved.ok) {
      const session = await issueGlPlayerSession(resolved.player);
      return {
        successRedirect: buildOAuthFrontendRedirect(cfg.frontendOrigin, {
          type: 'gl_player',
          token: session.authToken,
          auth: session.auth,
        }),
      };
    }
    if (oauthMode === 'player') {
      return {
        errorRedirect: buildGlOAuthFrontendErrorRedirect(
          cfg.frontendOrigin,
          'oauth_gl_player_denied',
          'player'
        ),
      };
    }
  }

  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email)=LOWER(?) LIMIT 1",
    [email]
  );
  const resolved = await resolveGlStaffLogin({
    email,
    displayName,
    googleSub,
    teacherId: teacher?.id || null,
  });
  if (!resolved.ok) {
    const code = oauthMode === 'auto' ? 'oauth_gl_login_denied' : 'oauth_gl_staff_denied';
    return {
      errorRedirect: buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, code, oauthMode),
    };
  }
  const session = await issueGlStaffSession(resolved.admin, resolved.glRole);
  return {
    successRedirect: buildOAuthFrontendRedirect(cfg.frontendOrigin, {
      type: 'gl_staff',
      token: session.authToken,
      auth: session.auth,
    }),
  };
}

/** GET /api/gl/auth/config — libellés écran connexion (public). */
router.get('/config', async (req, res) => {
  try {
    const titleRow = await queryOne(
      "SELECT value_json FROM gl_settings WHERE `key` = 'platform.title' LIMIT 1"
    );
    const subtitleRow = await queryOne(
      "SELECT value_json FROM gl_settings WHERE `key` = 'platform.subtitle' LIMIT 1"
    );
    const brandRow = await queryOne(
      "SELECT value_json FROM gl_settings WHERE `key` = 'platform.brand' LIMIT 1"
    );
    let title = 'Gnomes & Licornes';
    let subtitle = '';
    try {
      if (titleRow?.value_json) title = JSON.parse(titleRow.value_json);
    } catch (_) { /* noop */ }
    try {
      if (subtitleRow?.value_json) subtitle = JSON.parse(subtitleRow.value_json);
    } catch (_) { /* noop */ }
    const brand = parseBrandFromGlSettings([{ key: 'platform.brand', value_json: brandRow?.value_json }]);
    const clientId = normalizeOptionalString(process.env.GL_GOOGLE_OAUTH_CLIENT_ID)
      || normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID);
    const modules = await getGlModulesSettings();
    const allowPlayerLinkForetmap = await isForetmapLinkEnabled();
    const googleReady = !!clientId;
    return res.json({
      title: String(title || 'Gnomes & Licornes'),
      subtitle: String(subtitle || ''),
      brand,
      allowGoogleStaff: googleReady,
      allowGooglePlayer: googleReady,
      allowPlayerLinkForetmap,
      modules,
    });
  } catch (err) {
    logRouteError(err, req, 'GET /api/gl/auth/config');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const identifier = normalizeOptionalString(req.body?.identifier)
      || normalizeOptionalString(req.body?.pseudo);
    // Compat legacy: "pin" reste accepté pour les clients existants.
    const password = normalizeOptionalString(req.body?.password)
      || normalizeOptionalString(req.body?.pin);
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
    }

    const player = await queryOne(
      `SELECT p.id, p.class_id, p.team_id, p.pseudo, p.first_name, p.last_name,
              p.password_hash, p.password_must_reset, p.is_active
         FROM gl_players p
        WHERE LOWER(p.pseudo) = LOWER(?)
        LIMIT 1`,
      [identifier]
    );
    let playerPasswordOk = false;
    if (player) {
      if (!Number(player.is_active)) {
        return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
      }
      playerPasswordOk = await bcrypt.compare(password, String(player.password_hash || ''));
      if (playerPasswordOk) {
        return res.json(await issueGlPlayerSession(player));
      }
    }

    const staffOutcome = await attemptGlStaffPasswordLogin(identifier, password);
    if (staffOutcome.ok) return res.json(staffOutcome.session);
    if (player) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }
    return res.status(staffOutcome.status || 401).json({ error: staffOutcome.error });
  } catch (err) {
    logRouteError(err, req, 'POST /api/gl/auth/login');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

const FORGOT_PASSWORD_NEUTRAL_MESSAGE = 'Si un compte existe, un email de réinitialisation a été envoyé.';

async function findTeacherForGlPasswordReset(email) {
  let teacher = await queryOne(
    "SELECT id, email, is_active FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [email]
  );
  if (teacher) return teacher;
  const glAdmin = await queryOne(
    'SELECT foretmap_user_id FROM gl_admins WHERE LOWER(email) = LOWER(?) LIMIT 1',
    [email]
  );
  if (!glAdmin?.foretmap_user_id) return null;
  return queryOne(
    "SELECT id, email, is_active FROM users WHERE user_type = 'teacher' AND id = ? LIMIT 1",
    [String(glAdmin.foretmap_user_id)]
  );
}

/** POST /api/gl/auth/forgot-password — email de réinitialisation joueur GL ou MJ/Admin (réponse neutre). */
router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email ?? req.body?.mail);
    if (!email || !EMAIL_RE.test(email)) {
      return res.json({ ok: true, message: FORGOT_PASSWORD_NEUTRAL_MESSAGE });
    }

    const player = await queryOne(
      `SELECT id, email, pseudo, first_name, last_name, password_hash, is_active
         FROM gl_players
        WHERE LOWER(email) = LOWER(?)
          AND email IS NOT NULL
          AND TRIM(email) <> ''
        LIMIT 1`,
      [email]
    );
    if (player && Number(player.is_active) && player.password_hash) {
      const token = await createPasswordResetToken('gl_player', player.id);
      const displayName = normalizeOptionalString(player.pseudo)
        || `${player.first_name || ''} ${player.last_name || ''}`.trim()
        || 'Joueur';
      await sendPasswordResetEmail({
        to: player.email,
        displayName,
        resetUrl: makeResetUrl('gl_player', token, { product: 'gl' }, req),
        roleLabel: 'Gnomes & Licornes (joueur)',
      });
    }

    const teacher = await findTeacherForGlPasswordReset(email);
    if (teacher && Number(teacher.is_active)) {
      const token = await createPasswordResetToken('teacher', teacher.id);
      await sendPasswordResetEmail({
        to: teacher.email || email,
        displayName: 'MJ / Admin',
        resetUrl: makeResetUrl('teacher', token, { product: 'gl' }, req),
        roleLabel: 'Gnomes & Licornes (MJ/Admin)',
      });
    }

    return res.json({ ok: true, message: FORGOT_PASSWORD_NEUTRAL_MESSAGE });
  } catch (err) {
    logRouteError(err, req, 'POST /api/gl/auth/forgot-password');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** POST /api/gl/auth/reset-password — consomme un token émis pour gl_player ou teacher. */
router.post('/reset-password', async (req, res) => {
  try {
    const token = normalizeOptionalString(req.body?.token);
    const password = req.body?.password;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
    }
    const minPasswordLen = await getPasswordMinLength();
    if (String(password).length < minPasswordLen) {
      return res.status(400).json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    }

    const playerId = await consumePasswordResetToken('gl_player', token);
    if (playerId) {
      const passwordHash = await bcrypt.hash(password, 10);
      await execute(
        `UPDATE gl_players
            SET password_hash = ?, password_must_reset = 0, updated_at = NOW()
          WHERE id = ?`,
        [passwordHash, playerId]
      );
      return res.json({ ok: true });
    }

    const teacherId = await consumePasswordResetToken('teacher', token);
    if (teacherId) {
      const passwordHash = await bcrypt.hash(password, 10);
      await execute(
        "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ? AND user_type = 'teacher'",
        [passwordHash, teacherId]
      );
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Token invalide ou expiré' });
  } catch (err) {
    logRouteError(err, req, 'POST /api/gl/auth/reset-password');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** POST /api/gl/auth/staff/login — identifiant + mot de passe (compte ForetMap enseignant / admin). */
router.post('/staff/login', async (req, res) => {
  try {
    const identifier = normalizeOptionalString(req.body?.identifier);
    const password = normalizeOptionalString(req.body?.password);
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
    }

    const staffOutcome = await attemptGlStaffPasswordLogin(identifier, password, { rejectStudent: true });
    if (staffOutcome.ok) return res.json(staffOutcome.session);
    return res.status(staffOutcome.status || 401).json({ error: staffOutcome.error });
  } catch (err) {
    logRouteError(err, req, 'POST /api/gl/auth/staff/login');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** POST /api/gl/auth/google — ID token (compatibilité API / tests). Body : `{ idToken, mode?: 'player'|'staff' }`. */
router.post('/google', async (req, res) => {
  try {
    const idToken = normalizeOptionalString(req.body?.idToken);
    if (!idToken) return res.status(400).json({ error: 'idToken requis' });
    const cfg = buildGoogleConfig(req);
    if (!cfg.clientId) return res.status(503).json({ error: 'OAuth Google GL non configuré' });

    const payload = await verifyGoogleIdToken({ idToken, audience: cfg.clientId });
    const email = normalizeEmail(payload?.email);
    const emailVerified = payload?.email_verified === true || String(payload?.email_verified) === 'true';
    if (!email || !emailVerified || !isGoogleEmailAllowed(email, payload?.hd, cfg.allowedDomains, cfg.allowedEmails)) {
      return res.status(403).json({ error: 'Adresse Google non autorisée pour Gnomes & Licornes' });
    }

    const mode = normalizeGlOAuthMode(req.body?.mode);
    const googleSub = normalizeOptionalString(payload?.sub);

    if (mode === 'player' || mode === 'auto') {
      const resolved = await resolveGlPlayerLogin({ email, googleSub });
      if (resolved.ok) {
        return res.json(await issueGlPlayerSession(resolved.player));
      }
      if (mode === 'player') {
        return res.status(resolved.status || 403).json({ error: resolved.error });
      }
    }

    const displayName = normalizeOptionalString(payload?.name) || email;
    const teacher = await queryOne(
      "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email)=LOWER(?) LIMIT 1",
      [email]
    );
    const resolved = await resolveGlStaffLogin({
      email,
      displayName,
      googleSub,
      teacherId: teacher?.id || null,
    });
    if (!resolved.ok) {
      return res.status(resolved.status || 403).json({ error: resolved.error });
    }
    return res.json(await issueGlStaffSession(resolved.admin, resolved.glRole));
  } catch (_) {
    return res.status(401).json({ error: 'Connexion Google impossible' });
  }
});

/** GET /api/gl/auth/google/start?mode=player|staff — redirection OAuth (comme ForetMap). */
router.get('/google/start', async (req, res) => {
  const cfg = buildGoogleConfig(req);
  if (!googleOauthConfigured(cfg)) {
    return res.status(503).json({ error: 'OAuth Google non configuré' });
  }
  const mode = normalizeGlOAuthMode(req.query?.mode);
  const state = makeGoogleOAuthState();
  const cookieSecure = process.env.NODE_ENV === 'production';
  res.cookie(GL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: OAUTH_STATE_TTL_MS,
    path: '/api/gl/auth/google',
  });
  res.cookie(GL_OAUTH_MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: OAUTH_STATE_TTL_MS,
    path: '/api/gl/auth/google',
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

/** GET /api/gl/auth/google/callback — retour OAuth vers gl.html#oauth=… */
router.get('/google/callback', async (req, res) => {
  const cfg = buildGoogleConfig(req);
  const stateCookie = readCookie(req, GL_OAUTH_STATE_COOKIE);
  const mode = normalizeGlOAuthMode(readCookie(req, GL_OAUTH_MODE_COOKIE));
  res.clearCookie(GL_OAUTH_STATE_COOKIE, { path: '/api/gl/auth/google' });
  res.clearCookie(GL_OAUTH_MODE_COOKIE, { path: '/api/gl/auth/google' });

  if (!googleOauthConfigured(cfg)) {
    return res.redirect(buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_not_configured', mode));
  }
  if (normalizeOptionalString(req.query?.error)) {
    return res.redirect(buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_google_refused', mode));
  }
  const state = normalizeOptionalString(req.query?.state);
  if (!state || !stateCookie || state !== stateCookie) {
    return res.redirect(buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_invalid_state', mode));
  }
  const code = normalizeOptionalString(req.query?.code);
  if (!code) {
    return res.redirect(buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_missing_code', mode));
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
      return res.redirect(buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_missing_id_token', mode));
    }
    const payload = await verifyGoogleIdToken({ idToken, audience: cfg.clientId });
    const outcome = await completeGlGoogleOAuth({ cfg, payload, mode });
    if (outcome.errorRedirect) {
      return res.redirect(outcome.errorRedirect);
    }
    return res.redirect(outcome.successRedirect);
  } catch (err) {
    logRouteError(err, req, 'GET /api/gl/auth/google/callback');
    return res.redirect(buildGlOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_server_error', mode));
  }
});

router.get('/me', requireGlAuth, async (req, res) => {
  if (req.glAuth.userType === 'gl_player') {
    const player = await queryOne(
      `SELECT p.id, p.first_name, p.last_name, p.pseudo, p.class_id, p.team_id,
              p.email, p.description, p.avatar_path, p.password_must_reset, p.linked_foretmap_user_id,
              p.google_sub, c.name AS class_name, t.name AS team_name
         FROM gl_players p
    LEFT JOIN gl_classes c ON c.id = p.class_id
    LEFT JOIN gl_teams t ON t.id = p.team_id
        WHERE p.id = ?
        LIMIT 1`,
      [req.glAuth.userId]
    );
    let linkedForetmapStudent = null;
    if (player?.linked_foretmap_user_id) {
      linkedForetmapStudent = await queryOne(
        `SELECT id, pseudo, email
           FROM users
          WHERE id = ?
            AND user_type = 'student'
          LIMIT 1`,
        [player.linked_foretmap_user_id]
      );
    }
    return res.json({
      auth: req.glAuth,
      profile: player
        ? { ...player, linkedForetmapStudent: linkedForetmapStudent || null }
        : null,
    });
  }
  const admin = await queryOne(
    `SELECT id, email, display_name, role, description, avatar_path, foretmap_user_id
       FROM gl_admins
      WHERE id = ?
      LIMIT 1`,
    [req.glAuth.userId]
  );
  let linkedForetmapUser = null;
  if (admin?.foretmap_user_id) {
    linkedForetmapUser = await queryOne(
      `SELECT id, user_type, pseudo, email, display_name
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [admin.foretmap_user_id]
    );
  }
  return res.json({
    auth: req.glAuth,
    profile: admin
      ? { ...admin, linkedForetmapUser: linkedForetmapUser || null }
      : null,
  });
});

router.post('/admin/impersonate', requireGlAuth, async (req, res) => {
  try {
    if (!isStrictGlAdmin(req.glAuth)) {
      return res.status(403).json({ error: 'Action réservée aux administrateurs GL' });
    }
    if (req.glAuth.impersonating) {
      return res.status(400).json({ error: 'Quittez d’abord la prise de contrôle en cours' });
    }

    const targetUserType = String(req.body?.userType || '').trim().toLowerCase();
    const targetUserId = String(req.body?.userId || '').trim();
    if (targetUserType !== 'gl_player') {
      return res.status(400).json({ error: 'Type utilisateur invalide (gl_player uniquement)' });
    }
    if (!targetUserId) {
      return res.status(400).json({ error: 'Identifiant utilisateur requis' });
    }
    if (targetUserId === String(req.glAuth.userId)) {
      return res.status(400).json({ error: 'Impossible de prendre le contrôle de votre propre compte' });
    }

    const actorAdmin = await queryOne(
      `SELECT id, email, display_name, role, is_active
         FROM gl_admins
        WHERE id = ?
        LIMIT 1`,
      [req.glAuth.userId]
    );
    if (!actorAdmin || !Number(actorAdmin.is_active) || String(actorAdmin.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'Compte administrateur GL invalide ou inactif' });
    }

    const player = await queryOne(
      `SELECT id, class_id, team_id, pseudo, password_must_reset, is_active
         FROM gl_players
        WHERE id = ?
        LIMIT 1`,
      [targetUserId]
    );
    if (!player || !Number(player.is_active)) {
      return res.status(404).json({ error: 'Joueur introuvable ou inactif' });
    }

    const playerSession = await issueGlPlayerSession(player);
    const claims = {
      ...playerSession.auth,
      impersonating: true,
      actorUserType: 'gl_admin',
      actorUserId: String(actorAdmin.id),
      actorRoleSlug: 'gl_admin',
    };
    const token = await signGlToken(claims);

    await logAudit('gl_auth_impersonate_start', 'gl_auth', String(actorAdmin.id), `Prise de contrôle gl_player#${player.id}`, {
      req,
      actorUserType: 'gl_admin',
      actorUserId: String(actorAdmin.id),
      payload: {
        target_user_type: 'gl_player',
        target_user_id: String(player.id),
      },
    });
    await logSecurityEvent('gl.auth.impersonate.start', {
      req,
      actorUserType: 'gl_admin',
      actorUserId: String(actorAdmin.id),
      targetType: 'gl_player',
      targetId: String(player.id),
      payload: {
        actor_role: 'gl_admin',
      },
    });

    return res.json({
      authToken: token,
      auth: exposeGlAuth(claims),
      profile: {
        id: String(player.id),
        pseudo: player.pseudo || null,
        class_id: player.class_id || null,
        team_id: player.team_id || null,
      },
    });
  } catch (err) {
    logRouteError(err, req, 'POST /api/gl/auth/admin/impersonate');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/admin/impersonate/stop', requireGlAuth, async (req, res) => {
  try {
    if (!req.glAuth?.impersonating || !req.glAuth?.impersonatedBy) {
      return res.status(400).json({ error: 'Aucune prise de contrôle en cours' });
    }
    const actor = req.glAuth.impersonatedBy;
    if (actor.userType !== 'gl_admin' || actor.roleSlug !== 'gl_admin') {
      return res.status(403).json({ error: 'Compte de reprise invalide' });
    }

    const actorAdmin = await queryOne(
      `SELECT id, email, display_name, role, is_active
         FROM gl_admins
        WHERE id = ?
        LIMIT 1`,
      [actor.userId]
    );
    if (!actorAdmin || !Number(actorAdmin.is_active) || String(actorAdmin.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'Compte administrateur GL introuvable ou inactif' });
    }

    const restored = await issueGlStaffSession(actorAdmin, 'admin');

    await logAudit('gl_auth_impersonate_stop', 'gl_auth', String(actorAdmin.id), 'Fin prise de contrôle compte GL', {
      req,
      actorUserType: 'gl_admin',
      actorUserId: String(actorAdmin.id),
      payload: {
        target_user_type: req.glAuth.userType,
        target_user_id: req.glAuth.userId,
      },
    });
    await logSecurityEvent('gl.auth.impersonate.stop', {
      req,
      actorUserType: 'gl_admin',
      actorUserId: String(actorAdmin.id),
      targetType: req.glAuth.userType,
      targetId: String(req.glAuth.userId),
    });

    return res.json(restored);
  } catch (err) {
    logRouteError(err, req, 'POST /api/gl/auth/admin/impersonate/stop');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/me/profile', requireGlAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const currentPassword = normalizeOptionalString(body.currentPassword);
    if (!currentPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel requis' });
    }

    if (req.glAuth.userType === 'gl_player') {
      const account = await queryOne(
        `SELECT id, class_id, team_id, pseudo, first_name, last_name, email, description, avatar_path, password_hash, password_must_reset
           FROM gl_players
          WHERE id = ?
          LIMIT 1`,
        [req.glAuth.userId]
      );
      if (!account) return res.status(404).json({ error: 'Joueur introuvable' });
      const passOk = await bcrypt.compare(currentPassword, String(account.password_hash || ''));
      if (!passOk) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

      const hasPseudo = Object.prototype.hasOwnProperty.call(body, 'pseudo');
      const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email');
      const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
      const hasAvatarData = Object.prototype.hasOwnProperty.call(body, 'avatarData');
      const removeAvatar = !!body.removeAvatar;
      if (!hasPseudo && !hasEmail && !hasDescription && !hasAvatarData && !removeAvatar) {
        return res.status(400).json({ error: 'Aucun champ de profil à mettre à jour' });
      }

      const pseudo = hasPseudo ? normalizeOptionalString(body.pseudo) : account.pseudo;
      const email = hasEmail ? normalizeEmail(body.email) : account.email;
      const description = hasDescription ? normalizeOptionalString(body.description) : account.description;
      const validationError = validatePlayerProfileInput({ pseudo, email, description });
      if (validationError) return res.status(400).json({ error: validationError });

      if (pseudo) {
        const existingPseudo = await queryOne(
          'SELECT id FROM gl_players WHERE LOWER(pseudo)=LOWER(?) AND id <> ? LIMIT 1',
          [pseudo, account.id]
        );
        if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
      }
      if (email) {
        const existingEmail = await queryOne(
          'SELECT id FROM gl_players WHERE LOWER(email)=LOWER(?) AND id <> ? LIMIT 1',
          [email, account.id]
        );
        if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé pour un joueur GL' });
      }

      let avatarPath = account.avatar_path || null;
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
        const relativePath = `gl_players/${account.id}/avatar-${Date.now()}.${ext}`;
        saveBase64ToDisk(relativePath, avatarData);
        if (account.avatar_path && account.avatar_path !== relativePath) {
          deleteFile(account.avatar_path);
        }
        avatarPath = relativePath;
      } else if (removeAvatar) {
        if (account.avatar_path) deleteFile(account.avatar_path);
        avatarPath = null;
      }

      await execute(
        `UPDATE gl_players
            SET pseudo = ?, email = ?, description = ?, avatar_path = ?, updated_at = NOW()
          WHERE id = ?`,
        [pseudo, email, description, avatarPath, account.id]
      );
      const updated = await queryOne(
        `SELECT id, class_id, team_id, pseudo, first_name, last_name, email, description, avatar_path, password_must_reset
           FROM gl_players
          WHERE id = ?
          LIMIT 1`,
        [account.id]
      );
      const session = await issueGlPlayerSession(updated);
      return res.json({
        ok: true,
        authToken: session.authToken,
        auth: session.auth,
        profile: updated,
      });
    }

    if (req.glAuth.userType !== 'gl_admin') {
      return res.status(403).json({ error: 'Type de session GL non supporté' });
    }

    const hasDisplayName = Object.prototype.hasOwnProperty.call(body, 'displayName')
      || Object.prototype.hasOwnProperty.call(body, 'display_name');
    const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
    const hasAvatarData = Object.prototype.hasOwnProperty.call(body, 'avatarData');
    const removeAvatar = !!body.removeAvatar;
    if (!hasDisplayName && !hasDescription && !hasAvatarData && !removeAvatar) {
      return res.status(400).json({ error: 'Aucun champ de profil à mettre à jour' });
    }

    const admin = await queryOne(
      'SELECT id, email, display_name, role, description, avatar_path, foretmap_user_id FROM gl_admins WHERE id = ? LIMIT 1',
      [req.glAuth.userId]
    );
    if (!admin) return res.status(404).json({ error: 'Compte MJ/Admin introuvable' });

    const linkedTeacher = admin.foretmap_user_id
      ? await queryOne(
        'SELECT id, user_type, password_hash, is_active FROM users WHERE id = ? LIMIT 1',
        [admin.foretmap_user_id]
      )
      : await queryOne(
        `SELECT id, user_type, password_hash, is_active
           FROM users
          WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?)
          LIMIT 1`,
        [admin.email]
      );
    if (!linkedTeacher || !linkedTeacher.password_hash || !Number(linkedTeacher.is_active || 0)) {
      return res.status(403).json({ error: 'Compte ForetMap lié introuvable pour valider le mot de passe' });
    }
    const passOk = await bcrypt.compare(currentPassword, String(linkedTeacher.password_hash || ''));
    if (!passOk) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    const displayNameRaw = body.displayName ?? body.display_name;
    const displayName = hasDisplayName ? normalizeOptionalString(displayNameRaw) : admin.display_name;
    const description = hasDescription ? normalizeOptionalString(body.description) : admin.description;
    const validationError = validateStaffProfileInput({ displayName, description });
    if (validationError) return res.status(400).json({ error: validationError });

    let avatarPath = admin.avatar_path || null;
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
      const relativePath = `gl_admins/${admin.id}/avatar-${Date.now()}.${ext}`;
      saveBase64ToDisk(relativePath, avatarData);
      if (admin.avatar_path && admin.avatar_path !== relativePath) {
        deleteFile(admin.avatar_path);
      }
      avatarPath = relativePath;
    } else if (removeAvatar) {
      if (admin.avatar_path) deleteFile(admin.avatar_path);
      avatarPath = null;
    }

    await execute(
      `UPDATE gl_admins
          SET display_name = ?, description = ?, avatar_path = ?, foretmap_user_id = ?, updated_at = NOW()
        WHERE id = ?`,
      [displayName, description, avatarPath, String(linkedTeacher.id), admin.id]
    );
    const updated = await queryOne(
      `SELECT id, email, display_name, role, description, avatar_path, foretmap_user_id
         FROM gl_admins
        WHERE id = ?
        LIMIT 1`,
      [admin.id]
    );
    const session = await issueGlStaffSession(updated, String(updated.role || 'mj').toLowerCase());
    return res.json({
      ok: true,
      authToken: session.authToken,
      auth: session.auth,
      profile: updated,
    });
  } catch (err) {
    logRouteError(err, req, 'PATCH /api/gl/auth/me/profile');
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/staff/change-password', requireGlAuth, async (req, res) => {
  if (req.glAuth.userType !== 'gl_admin') {
    return res.status(403).json({ error: 'Action réservée aux MJ/Admin GL' });
  }
  const currentPassword = normalizeOptionalString(req.body?.currentPassword);
  const nextPassword = normalizeOptionalString(req.body?.newPassword);
  if (!currentPassword || !nextPassword) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
  }
  if (nextPassword.length < 4) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
  }
  const admin = await queryOne(
    'SELECT id, email, foretmap_user_id FROM gl_admins WHERE id = ? LIMIT 1',
    [req.glAuth.userId]
  );
  if (!admin) return res.status(404).json({ error: 'Compte MJ/Admin introuvable' });
  const teacher = admin.foretmap_user_id
    ? await queryOne('SELECT id, password_hash, user_type FROM users WHERE id = ? LIMIT 1', [admin.foretmap_user_id])
    : await queryOne(
      "SELECT id, password_hash, user_type FROM users WHERE user_type = 'teacher' AND LOWER(email)=LOWER(?) LIMIT 1",
      [admin.email]
    );
  if (!teacher || !teacher.password_hash || String(teacher.user_type || '').toLowerCase() !== 'teacher') {
    return res.status(403).json({ error: 'Aucun compte enseignant ForetMap lié' });
  }
  const ok = await bcrypt.compare(currentPassword, String(teacher.password_hash || ''));
  if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  const passwordHash = await bcrypt.hash(nextPassword, 10);
  await execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, teacher.id]);
  await execute('UPDATE gl_admins SET foretmap_user_id = ?, updated_at = NOW() WHERE id = ?', [String(teacher.id), admin.id]);
  return res.json({ ok: true });
});

router.post('/link-foretmap', requireGlAuth, async (req, res) => {
  if (req.glAuth.userType !== 'gl_player') {
    return res.status(403).json({ error: 'Action réservée aux joueurs GL' });
  }
  if (!(await isForetmapLinkEnabled())) {
    return res.status(403).json({ error: 'Liaison ForetMap désactivée par la plateforme' });
  }
  const identifier = normalizeOptionalString(req.body?.identifier);
  const password = normalizeOptionalString(req.body?.password);
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  }
  const player = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [req.glAuth.userId]);
  if (!player) return res.status(404).json({ error: 'Joueur introuvable' });
  const student = await queryOne(
    `SELECT id, user_type, pseudo, email, password_hash, is_active
       FROM users
      WHERE user_type = 'student'
        AND (LOWER(pseudo) = LOWER(?) OR LOWER(email) = LOWER(?))
      LIMIT 1`,
    [identifier, identifier]
  );
  if (!student || !student.password_hash || !Number(student.is_active || 0)) {
    return res.status(401).json({ error: 'Compte ForetMap invalide' });
  }
  const passOk = await bcrypt.compare(password, String(student.password_hash || ''));
  if (!passOk) return res.status(401).json({ error: 'Compte ForetMap invalide' });
  const existingLink = await queryOne(
    'SELECT id, pseudo FROM gl_players WHERE linked_foretmap_user_id = ? AND id <> ? LIMIT 1',
    [student.id, player.id]
  );
  if (existingLink) {
    return res.status(409).json({ error: 'Ce compte ForetMap est déjà lié à un autre joueur GL' });
  }
  await execute(
    'UPDATE gl_players SET linked_foretmap_user_id = ?, updated_at = NOW() WHERE id = ?',
    [String(student.id), player.id]
  );
  return res.json({
    ok: true,
    linkedForetmapStudent: {
      id: String(student.id),
      pseudo: student.pseudo || null,
      email: student.email || null,
    },
  });
});

router.delete('/link-foretmap', requireGlAuth, async (req, res) => {
  if (req.glAuth.userType !== 'gl_player') {
    return res.status(403).json({ error: 'Action réservée aux joueurs GL' });
  }
  if (!(await isForetmapLinkEnabled())) {
    return res.status(403).json({ error: 'Liaison ForetMap désactivée par la plateforme' });
  }
  const currentPassword = normalizeOptionalString(req.body?.currentPassword);
  if (!currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });
  const player = await queryOne(
    'SELECT id, password_hash FROM gl_players WHERE id = ? LIMIT 1',
    [req.glAuth.userId]
  );
  if (!player) return res.status(404).json({ error: 'Joueur introuvable' });
  const ok = await bcrypt.compare(currentPassword, String(player.password_hash || ''));
  if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  await execute('UPDATE gl_players SET linked_foretmap_user_id = NULL, updated_at = NOW() WHERE id = ?', [player.id]);
  return res.json({ ok: true });
});

router.post('/change-password', requireGlAuth, async (req, res) => {
  if (req.glAuth.userType !== 'gl_player') {
    return res.status(403).json({ error: 'Action réservée aux joueurs GL' });
  }
  const currentPassword = normalizeOptionalString(req.body?.currentPassword)
    || normalizeOptionalString(req.body?.pin);
  const nextPassword = normalizeOptionalString(req.body?.newPassword)
    || normalizeOptionalString(req.body?.password);
  if (!currentPassword || !nextPassword) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
  }
  if (nextPassword.length < 4) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
  }
  const player = await queryOne(
    'SELECT id, password_hash FROM gl_players WHERE id = ? LIMIT 1',
    [req.glAuth.userId]
  );
  if (!player) {
    return res.status(404).json({ error: 'Joueur introuvable' });
  }
  const ok = await bcrypt.compare(currentPassword, String(player.password_hash || ''));
  if (!ok) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  const passwordHash = await bcrypt.hash(nextPassword, 10);
  await execute(
    `UPDATE gl_players
        SET password_hash = ?, password_must_reset = 0, updated_at = NOW()
      WHERE id = ?`,
    [passwordHash, player.id]
  );
  return res.json({ ok: true });
});

module.exports = router;
