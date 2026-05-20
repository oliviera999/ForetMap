const express = require('express');
const bcrypt = require('bcryptjs');
const { queryOne, execute } = require('../../database');
const { signAuthToken } = require('../../middleware/requireTeacher');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const {
  resolveGlStaffLogin,
  buildGlAdminClaims,
} = require('../../lib/glStaffAuth');
const {
  makeGoogleOAuthState,
  buildOAuthFrontendRedirect,
  buildOAuthFrontendErrorRedirect,
  exchangeGoogleCode,
  verifyGoogleIdToken,
} = require('../../lib/googleOAuthShared');

const router = express.Router();

const GL_OAUTH_STATE_COOKIE = 'gl_oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
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
  return {
    product: 'gl',
    userType: claims.userType,
    userId: claims.userId,
    roleSlug: claims.roleSlug,
    displayName: claims.displayName || null,
    classId: claims.classId || null,
    teamId: claims.teamId || null,
    permissions: claims.permissions || [],
  };
}

function buildGoogleConfig(req) {
  const clientId = normalizeOptionalString(process.env.GL_GOOGLE_OAUTH_CLIENT_ID)
    || normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = normalizeOptionalString(process.env.GL_GOOGLE_OAUTH_REDIRECT_URI)
    || `${req.protocol}://${req.get('host')}/api/gl/auth/google/callback`;
  const frontendOrigin = normalizeOptionalString(process.env.GL_FRONTEND_ORIGIN)
    || `${req.protocol}://${req.get('host')}`;
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

async function issueGlStaffSession(admin, glRole) {
  const baseClaims = buildGlAdminClaims(admin, glRole);
  const claims = {
    ...baseClaims,
    permissions: getGlRolePermissions(glRole === 'mj' ? 'mj' : 'admin'),
  };
  const token = await signGlToken(claims);
  return { authToken: token, auth: exposeGlAuth(claims) };
}

/** GET /api/gl/auth/config — libellés écran connexion (public). */
router.get('/config', async (_req, res) => {
  const titleRow = await queryOne(
    "SELECT value_json FROM gl_settings WHERE `key` = 'platform.title' LIMIT 1"
  );
  const subtitleRow = await queryOne(
    "SELECT value_json FROM gl_settings WHERE `key` = 'platform.subtitle' LIMIT 1"
  );
  let title = 'Gnomes & Licornes';
  let subtitle = '';
  try {
    if (titleRow?.value_json) title = JSON.parse(titleRow.value_json);
  } catch (_) { /* noop */ }
  try {
    if (subtitleRow?.value_json) subtitle = JSON.parse(subtitleRow.value_json);
  } catch (_) { /* noop */ }
  const clientId = normalizeOptionalString(process.env.GL_GOOGLE_OAUTH_CLIENT_ID)
    || normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID);
  return res.json({
    title: String(title || 'Gnomes & Licornes'),
    subtitle: String(subtitle || ''),
    allowGoogleStaff: !!clientId,
  });
});

router.post('/login', async (req, res) => {
  try {
    const pseudo = normalizeOptionalString(req.body?.pseudo);
    const pin = normalizeOptionalString(req.body?.pin);
    if (!pseudo || !pin) return res.status(400).json({ error: 'Pseudo et PIN requis' });

    const player = await queryOne(
      `SELECT p.id, p.class_id, p.team_id, p.pseudo, p.pin_hash, p.is_active
         FROM gl_players p
        WHERE LOWER(p.pseudo) = LOWER(?)
        LIMIT 1`,
      [pseudo]
    );
    if (!player || !Number(player.is_active)) {
      return res.status(401).json({ error: 'Pseudo ou PIN incorrect' });
    }
    const ok = await bcrypt.compare(pin, String(player.pin_hash || ''));
    if (!ok) return res.status(401).json({ error: 'Pseudo ou PIN incorrect' });

    await execute('UPDATE gl_players SET last_seen = NOW() WHERE id = ?', [player.id]);
    const claims = {
      userType: 'gl_player',
      userId: String(player.id),
      roleSlug: 'gl_player',
      displayName: player.pseudo,
      classId: player.class_id ? Number(player.class_id) : null,
      teamId: player.team_id ? Number(player.team_id) : null,
      permissions: getGlRolePermissions('player'),
    };
    const token = await signGlToken(claims);
    return res.json({
      authToken: token,
      auth: exposeGlAuth(claims),
    });
  } catch (err) {
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

    const account = await queryOne(
      `SELECT id, user_type, email, pseudo, password_hash, is_active, display_name
         FROM users
        WHERE LOWER(pseudo) = LOWER(?) OR LOWER(email) = LOWER(?)
        LIMIT 1`,
      [identifier, identifier]
    );
    if (!account || !account.password_hash) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }
    if (account.is_active != null && !Number(account.is_active)) {
      return res.status(401).json({ error: 'Compte inactif' });
    }
    const passOk = await bcrypt.compare(password, String(account.password_hash));
    if (!passOk) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

    const userType = String(account.user_type || '').toLowerCase();
    if (userType === 'student') {
      return res.status(403).json({
        error: 'Les élèves se connectent via l’onglet Joueur (pseudo + PIN).',
      });
    }
    if (userType !== 'teacher') {
      return res.status(403).json({ error: 'Compte non autorisé pour la connexion MJ.' });
    }

    const email = normalizeEmail(account.email) || normalizeEmail(account.pseudo);
    const displayName = normalizeOptionalString(account.display_name)
      || normalizeOptionalString(account.pseudo)
      || email;
    const resolved = await resolveGlStaffLogin({
      email,
      displayName,
      googleSub: null,
      teacherId: account.id,
    });
    if (!resolved.ok) {
      return res.status(resolved.status || 403).json({ error: resolved.error });
    }
    const session = await issueGlStaffSession(resolved.admin, resolved.glRole);
    return res.json(session);
  } catch (_) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** POST /api/gl/auth/google — ID token (compatibilité API / tests). */
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

    const displayName = normalizeOptionalString(payload?.name) || email;
    const googleSub = normalizeOptionalString(payload?.sub);
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

/** GET /api/gl/auth/google/start — redirection OAuth (comme ForetMap). */
router.get('/google/start', async (req, res) => {
  const cfg = buildGoogleConfig(req);
  if (!googleOauthConfigured(cfg)) {
    return res.status(503).json({ error: 'OAuth Google non configuré' });
  }
  const state = makeGoogleOAuthState();
  const cookieSecure = process.env.NODE_ENV === 'production';
  res.cookie(GL_OAUTH_STATE_COOKIE, state, {
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
  res.clearCookie(GL_OAUTH_STATE_COOKIE, { path: '/api/gl/auth/google' });

  if (!googleOauthConfigured(cfg)) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_not_configured'));
  }
  if (normalizeOptionalString(req.query?.error)) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_google_refused'));
  }
  const state = normalizeOptionalString(req.query?.state);
  if (!state || !stateCookie || state !== stateCookie) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_invalid_state'));
  }
  const code = normalizeOptionalString(req.query?.code);
  if (!code) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_missing_code'));
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
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_missing_id_token'));
    }
    const payload = await verifyGoogleIdToken({ idToken, audience: cfg.clientId });
    const email = normalizeEmail(payload?.email);
    const issuer = String(payload?.iss || '');
    const emailVerified = payload?.email_verified === true || String(payload?.email_verified) === 'true';
    const audience = String(payload?.aud || '');
    if (!email || !emailVerified || audience !== cfg.clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(issuer)) {
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_claims_invalid'));
    }
    if (!isGoogleEmailAllowed(email, payload?.hd, cfg.allowedDomains, cfg.allowedEmails)) {
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_email_not_allowed'));
    }

    const displayName = normalizeOptionalString(payload?.name) || email;
    const googleSub = normalizeOptionalString(payload?.sub);
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
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_gl_staff_denied'));
    }
    const session = await issueGlStaffSession(resolved.admin, resolved.glRole);
    return res.redirect(buildOAuthFrontendRedirect(cfg.frontendOrigin, {
      type: 'gl_staff',
      token: session.authToken,
      auth: session.auth,
    }));
  } catch (_) {
    return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_server_error'));
  }
});

router.get('/me', requireGlAuth, async (req, res) => {
  if (req.glAuth.userType === 'gl_player') {
    const player = await queryOne(
      `SELECT p.id, p.pseudo, p.class_id, p.team_id, c.name AS class_name, t.name AS team_name
         FROM gl_players p
    LEFT JOIN gl_classes c ON c.id = p.class_id
    LEFT JOIN gl_teams t ON t.id = p.team_id
        WHERE p.id = ?
        LIMIT 1`,
      [req.glAuth.userId]
    );
    return res.json({
      auth: req.glAuth,
      profile: player || null,
    });
  }
  const admin = await queryOne(
    'SELECT id, email, display_name, role FROM gl_admins WHERE id = ? LIMIT 1',
    [req.glAuth.userId]
  );
  return res.json({
    auth: req.glAuth,
    profile: admin || null,
  });
});

module.exports = router;
