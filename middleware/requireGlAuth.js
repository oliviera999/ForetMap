const { queryOne } = require('../database');
const { JWT_SECRET, parseBearerToken } = require('./requireTeacher');
const { verifyJwtForProduct } = require('../lib/auth/jwtPipeline');
const {
  GL_GUEST_USER_TYPE,
  GlAuthInfraError,
  hydrateGlAuthFromClaims,
} = require('../lib/auth/glHydration');
const logger = require('../lib/logger');

/**
 * Pose l'acteur unique de la requête (`lib/glActeur.js`) : `mj`, `player`, `team` (tablette
 * d'équipe validée), `projection` ou `guest`.
 */
function attachActor(glAuth) {
  glAuth.actor = require('../lib/glActeur').buildActor(glAuth);
  return glAuth;
}

/**
 * Valide une session d'équipe (non révoquée, non expirée, partie non close). Une session
 * valide reçoit le droit de demander un geste (`gl.action.request`), pour SA partie et SON
 * équipe seulement : les routes de partie rejouent ce périmètre (`resolveGameActor`).
 * @returns {Promise<boolean>}
 */
async function validateTeamSession(glAuth) {
  if (!glAuth?.teamSession) return false;
  const database = require('../database');
  const { findValidTeamSession } = require('../lib/glGuestToken');
  const session = await findValidTeamSession(database, glAuth.teamSession);
  if (!session) return false;
  glAuth.teamSessionValide = true;
  glAuth.teamSessionId = session.id;
  glAuth.teamId = session.teamId;
  glAuth.gameId = session.gameId;
  glAuth.classId = session.classId;
  if (!glAuth.permissions.includes('gl.action.request')) {
    glAuth.permissions = [...glAuth.permissions, 'gl.action.request'];
  }
  return true;
}

const TEAM_SESSION_ENDED = Object.freeze({
  error: 'Cette tablette n’est plus connectée : scannez de nouveau le code de la classe.',
  code: 'TEAM_SESSION_TERMINEE',
});

function hasGlPermission(auth, permission) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes(permission);
}

function isGlGuest(auth) {
  return auth?.userType === GL_GUEST_USER_TYPE;
}

/** Vrai si la requête est authentifiée comme MJ/Admin GL (userType gl_admin). */
function isMj(req) {
  return req?.glAuth?.userType === 'gl_admin';
}

/** Type d'acteur pour l'audit des actions de partie : 'mj' ou 'team'. */
function actorTypeOf(req) {
  return isMj(req) ? 'mj' : 'team';
}

function allowsPasswordResetRoute(req) {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (method === 'POST' && path.endsWith('/api/gl/auth/change-password')) return true;
  if (method === 'GET' && path.endsWith('/api/gl/auth/me')) return true;
  // Quitter une prise de contrôle ne dépend pas du mot de passe du joueur contrôlé (CDG-33).
  if (method === 'POST' && path.endsWith('/api/gl/auth/admin/impersonate/stop')) return true;
  return false;
}

function passwordResetBlocked(glAuth, req) {
  return (
    glAuth.userType === 'gl_player' && glAuth.passwordMustReset && !allowsPasswordResetRoute(req)
  );
}

/**
 * Vérifie le JWT GL puis **ré-hydrate les droits depuis la base** (audit B6) : le jeton ne
 * porte plus que l'identité, jamais les permissions effectives. Une révocation de rôle, une
 * désactivation ou une suppression de compte prend donc effet à la requête suivante — même
 * contrat que `resolveAuthOrRespond` côté ForetMap.
 *
 * Ne pose aucune politique d'accès invité / reset MDP (cf. `requireGlAuth`).
 * @returns {Promise<{ ok: true, glAuth: object } | { ok: false, status: number, error: string }>}
 */
async function authenticateGl(req) {
  if (!JWT_SECRET) {
    return { ok: false, status: 503, error: 'Authentification GL non configurée' };
  }
  const token = parseBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Token requis' };

  const verified = verifyJwtForProduct(token, JWT_SECRET, 'gl');
  if (verified.error) {
    return { ok: false, status: verified.status, error: verified.error };
  }

  let glAuth;
  try {
    glAuth = await hydrateGlAuthFromClaims(verified.claims, { queryOne });
  } catch (err) {
    // Panne d'infrastructure : surtout pas un 401, qui ferait boucler les reconnexions.
    if (err instanceof GlAuthInfraError) {
      logger.error({ err: err.cause, msg: 'gl_auth_hydration_failed' }, 'Échec hydratation GL');
      // Code transitoire réessayable côté client (requête jamais traitée).
      return {
        ok: false,
        status: 503,
        error: 'Service momentanément indisponible',
        code: 'SERVICE_UNAVAILABLE',
        retryAfterSeconds: 2,
      };
    }
    throw err;
  }
  // Compte supprimé, désactivé, ou rôle absent du catalogue : la session ne vaut plus rien.
  if (!glAuth) {
    return { ok: false, status: 401, error: 'Session expirée ou compte désactivé' };
  }
  return { ok: true, glAuth };
}

/** Envoie l'échec d'authenticateGl (statut + code transitoire et Retry-After éventuels). */
function sendGlAuthFailure(res, result) {
  if (result.retryAfterSeconds) res.set('Retry-After', String(result.retryAfterSeconds));
  return res
    .status(result.status)
    .json({ error: result.error, ...(result.code ? { code: result.code } : {}) });
}

async function requireGlAuth(req, res, next) {
  let result;
  try {
    result = await authenticateGl(req);
  } catch (err) {
    return next(err);
  }
  if (!result.ok) {
    return sendGlAuthFailure(res, result);
  }
  req.glAuth = attachActor(result.glAuth);
  if (isGlGuest(req.glAuth)) {
    return res.status(403).json({
      error: 'Compte requis pour cette ressource',
      guestBlocked: true,
    });
  }
  if (passwordResetBlocked(req.glAuth, req)) {
    return res.status(403).json({
      error: 'Mot de passe à mettre à jour avant de continuer',
      mustResetPassword: true,
    });
  }
  return next();
}

/**
 * Comme `requireGlAuth`, mais laisse passer une **session d'équipe** valide (tablette de
 * classe, lot 2) : à poser sur les seules routes de partie qu'une tablette peut jouer. Une
 * session révoquée ou expirée reçoit 401 `TEAM_SESSION_TERMINEE` ; un invité ordinaire et une
 * projection restent bloqués.
 */
async function requireGlAuthOrTeam(req, res, next) {
  let result;
  try {
    result = await authenticateGl(req);
    if (result.ok && isGlGuest(result.glAuth) && result.glAuth.teamSession) {
      if (!(await validateTeamSession(result.glAuth))) {
        return res.status(401).json(TEAM_SESSION_ENDED);
      }
    }
  } catch (err) {
    return next(err);
  }
  if (!result.ok) {
    return sendGlAuthFailure(res, result);
  }
  req.glAuth = attachActor(result.glAuth);
  if (isGlGuest(req.glAuth) && req.glAuth.actor.kind !== 'team') {
    return res.status(403).json({
      error: 'Compte requis pour cette ressource',
      guestBlocked: true,
    });
  }
  if (passwordResetBlocked(req.glAuth, req)) {
    return res.status(403).json({
      error: 'Mot de passe à mettre à jour avant de continuer',
      mustResetPassword: true,
    });
  }
  return next();
}

/**
 * Comme `requireGlAuth`, mais laisse passer un invité porteur d'un jeton de PROJECTION
 * (« Tenir à deux » § 8.6) pour les seules lectures d'une partie. L'accès à LA partie est
 * ensuite décidé par `canAccessGlGame` (claim `projection.gameId`, non révoqué). Un invité
 * ordinaire reste bloqué (`guestBlocked`).
 */
async function requireGlAuthOrProjection(req, res, next) {
  let result;
  try {
    result = await authenticateGl(req);
    // Une tablette d'équipe lit aussi sa partie (lot 2) : même validation que pour agir.
    if (result.ok && isGlGuest(result.glAuth) && result.glAuth.teamSession) {
      if (!(await validateTeamSession(result.glAuth))) {
        return res.status(401).json(TEAM_SESSION_ENDED);
      }
    }
  } catch (err) {
    return next(err);
  }
  if (!result.ok) {
    return sendGlAuthFailure(res, result);
  }
  req.glAuth = attachActor(result.glAuth);
  if (isGlGuest(req.glAuth) && !req.glAuth.projection && req.glAuth.actor.kind !== 'team') {
    return res.status(403).json({
      error: 'Compte requis pour cette ressource',
      guestBlocked: true,
    });
  }
  if (passwordResetBlocked(req.glAuth, req)) {
    return res.status(403).json({
      error: 'Mot de passe à mettre à jour avant de continuer',
      mustResetPassword: true,
    });
  }
  return next();
}

function requireGlPermission(permission) {
  return async (req, res, next) => {
    let result;
    try {
      result = await authenticateGl(req);
    } catch (err) {
      return next(err);
    }
    if (!result.ok) {
      return sendGlAuthFailure(res, result);
    }
    req.glAuth = attachActor(result.glAuth);
    if (!hasGlPermission(req.glAuth, permission)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    if (passwordResetBlocked(req.glAuth, req)) {
      return res.status(403).json({
        error: 'Mot de passe à mettre à jour avant de continuer',
        mustResetPassword: true,
      });
    }
    return next();
  };
}

module.exports = {
  requireGlAuth,
  requireGlAuthOrTeam,
  requireGlAuthOrProjection,
  requireGlPermission,
  hasGlPermission,
  authenticateGl,
  isGlGuest,
  isMj,
  actorTypeOf,
  GL_GUEST_USER_TYPE,
};
