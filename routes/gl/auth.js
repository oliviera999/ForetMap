const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { queryOne, execute } = require('../../database');
const { signAuthToken } = require('../../middleware/requireTeacher');
const { requireGlAuth } = require('../../middleware/requireGlAuth');

const router = express.Router();
const googleOidcClient = new OAuth2Client();

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

function buildGoogleConfig() {
  const clientId = normalizeOptionalString(process.env.GL_GOOGLE_OAUTH_CLIENT_ID)
    || normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const allowedDomains = parseCsvLowercaseSet(
    process.env.GL_GOOGLE_OAUTH_ALLOWED_DOMAINS || process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS,
    ['pedagolyautey.org', 'lyceelyautey.org']
  );
  const allowedEmails = parseCsvLowercaseSet(
    process.env.GL_GOOGLE_OAUTH_ALLOWED_EMAILS || process.env.GOOGLE_OAUTH_ALLOWED_EMAILS,
    []
  );
  return { clientId, allowedDomains, allowedEmails };
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

router.post('/google', async (req, res) => {
  try {
    const idToken = normalizeOptionalString(req.body?.idToken);
    if (!idToken) return res.status(400).json({ error: 'idToken requis' });
    const cfg = buildGoogleConfig();
    if (!cfg.clientId) return res.status(503).json({ error: 'OAuth Google GL non configuré' });

    const ticket = await googleOidcClient.verifyIdToken({ idToken, audience: cfg.clientId });
    const payload = ticket.getPayload() || null;
    const email = normalizeEmail(payload?.email);
    const emailVerified = payload?.email_verified === true || String(payload?.email_verified) === 'true';
    if (!email || !emailVerified || !isGoogleEmailAllowed(email, payload?.hd, cfg.allowedDomains, cfg.allowedEmails)) {
      return res.status(403).json({ error: 'Adresse Google non autorisée pour Gnomes & Licornes' });
    }

    const displayName = normalizeOptionalString(payload?.name) || email;
    const googleSub = normalizeOptionalString(payload?.sub);
    let admin = await queryOne('SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [email]);
    if (!admin) {
      await execute(
        `INSERT INTO gl_admins (email, display_name, google_sub, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', 1, NOW(), NOW())`,
        [email, displayName, googleSub]
      );
      admin = await queryOne('SELECT * FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [email]);
    } else {
      await execute(
        'UPDATE gl_admins SET display_name = ?, google_sub = ?, last_seen = NOW(), updated_at = NOW() WHERE id = ?',
        [displayName, googleSub, admin.id]
      );
      admin.display_name = displayName;
    }
    if (!admin || !Number(admin.is_active)) {
      return res.status(403).json({ error: 'Compte GL inactif' });
    }

    const role = String(admin.role || 'admin').toLowerCase();
    const claims = {
      userType: 'gl_admin',
      userId: String(admin.id),
      roleSlug: role === 'mj' ? 'gl_mj' : 'gl_admin',
      displayName: admin.display_name || email,
      permissions: getGlRolePermissions(role),
    };
    const token = await signGlToken(claims);
    return res.json({
      authToken: token,
      auth: exposeGlAuth(claims),
    });
  } catch (_) {
    return res.status(401).json({ error: 'Connexion Google impossible' });
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
