'use strict';

/**
 * Entrée LTI 1.3 depuis un cours Moodle — `/api/lti` (section 21).
 *
 * GET|POST /login  initiation OIDC
 * POST /launch     vérification id_token, rattachement, ticket, redirection /lti/arrivee
 * GET  /.well-known/jwks.json  clé publique de l'outil
 * POST /session    échange ticket → jeton produit (même durée qu'une session Google)
 *
 * Aucun AGS, aucun Deep Linking. Personne inconnue : refus (L6). Jeton jamais loggé.
 */

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { logAudit } = require('../lib/auditLog');
const { z, validate } = require('../lib/validate');
const { readLtiEnv, notConfiguredError } = require('../lib/lti/config');
const { loadLtiSettings } = require('../lib/lti/settings');
const {
  newOidcPair,
  setOidcCookie,
  readOidcCookie,
  clearOidcCookie,
  rememberNonce,
  buildPlatformAuthRedirect,
} = require('../lib/lti/oidc');
const { verifyLaunchToken, toolPublicJwk, launchView } = require('../lib/lti/launch');
const { resolveLtiUser, isN3beurUser } = require('../lib/lti/identity');
const { resolveLaunchDestination } = require('../lib/lti/bindings');
const { issueTicket, exchangeTicket, arrivalUrl } = require('../lib/lti/session');

const router = express.Router();

function requireEnv() {
  const env = readLtiEnv();
  if (!env.configured) throw notConfiguredError();
  return env;
}

function loginParams(req) {
  const src = { ...(req.query || {}), ...(req.body || {}) };
  return {
    iss: String(src.iss || '').trim(),
    loginHint: String(src.login_hint || '').trim(),
    targetLinkUri: String(src.target_link_uri || '').trim(),
    clientId: String(src.client_id || '').trim(),
    messageHint: String(src.lti_message_hint || '').trim(),
  };
}

async function handleLogin(req, res) {
  const env = requireEnv();
  const settings = await loadLtiSettings();
  if (!settings.enabled) {
    const err = new Error('Entrée depuis le cours désactivée');
    err.status = 403;
    throw err;
  }
  const params = loginParams(req);
  if (params.iss !== env.issuer) {
    return res.status(400).json({ error: 'Issuer LTI inattendu' });
  }
  if (params.clientId && params.clientId !== env.clientId) {
    return res.status(400).json({ error: 'client_id LTI inattendu' });
  }
  if (!params.targetLinkUri) {
    return res.status(400).json({ error: 'target_link_uri manquant' });
  }
  const pair = newOidcPair();
  setOidcCookie(res, pair);
  return res.redirect(buildPlatformAuthRedirect({ env, pair, ...params }));
}

router.get('/login', asyncHandler(handleLogin));
router.post('/login', asyncHandler(handleLogin));

router.get(
  '/.well-known/jwks.json',
  asyncHandler(async (_req, res) => {
    const env = requireEnv();
    const jwk = await toolPublicJwk(env);
    res.json({ keys: [jwk] });
  }),
);

router.post(
  '/launch',
  asyncHandler(async (req, res) => {
    const env = requireEnv();
    const settings = await loadLtiSettings();
    if (!settings.enabled) {
      const err = new Error('Entrée depuis le cours désactivée');
      err.status = 403;
      throw err;
    }
    const idToken = String(req.body?.id_token || '').trim();
    const state = String(req.body?.state || '').trim();
    const cookie = readOidcCookie(req);
    if (!cookie || cookie.state !== state) {
      return res.status(401).json({ error: 'État OIDC LTI invalide ou expiré' });
    }
    clearOidcCookie(res);
    const payload = await verifyLaunchToken(idToken, { env, expectedNonce: cookie.nonce });
    if (!rememberNonce(payload.nonce || cookie.nonce)) {
      return res.status(401).json({ error: 'Nonce LTI invalide ou rejoué', code: 'LTI_NONCE' });
    }
    const view = launchView(payload);
    const { user, via } = await resolveLtiUser({
      sub: view.sub,
      email: view.email,
      issuer: env.issuer,
    });
    const n3 = await isN3beurUser(user.id);
    const destination = resolveLaunchDestination({
      claims: payload,
      settings,
      isN3beur: n3 && String(user.user_type) === 'student',
    });
    if (!destination.ok) {
      return res.status(403).json({ error: destination.error });
    }
    const report = {
      source: destination.source,
      courseId: destination.courseId,
      chapterId: destination.chapterId,
      instructor: destination.instructor,
      via,
      userId: user.id,
    };
    const ticket = issueTicket({ userId: user.id, destination, report });
    await logAudit('lti_launch', 'user', String(user.id), destination.source, {
      req,
      payload: { courseId: destination.courseId, via, instructor: destination.instructor },
    });
    const origin = settings.publicOrigin || `${req.protocol}://${req.get('host')}`;
    return res.redirect(arrivalUrl(origin, ticket));
  }),
);

const sessionBody = z.object({
  ticket: z.string().min(10).max(4096),
  destinationId: z.string().trim().min(1).max(64).optional(),
  instructorPick: z.enum(['fm', 'gl']).optional(),
});

router.post(
  '/session',
  validate({ body: sessionBody }),
  asyncHandler(async (req, res) => {
    const settings = await loadLtiSettings().catch(() => ({ publicOrigin: '' }));
    const fmOrigin = settings.publicOrigin || `${req.protocol}://${req.get('host')}`;
    const result = await exchangeTicket({
      ticket: req.body.ticket,
      destinationId: req.body.destinationId,
      instructorPick: req.body.instructorPick,
      fmOrigin,
    });
    res.json(result);
  }),
);

router.use((err, req, res, next) => {
  if (
    err?.code === 'LTI_NOT_CONFIGURED' ||
    err?.code === 'LTI_UNKNOWN_USER' ||
    (err?.status && err.status < 500)
  ) {
    req.log?.warn?.({ path: req.path, code: err.code }, 'LTI');
    return res.status(err.status || 503).json({ error: err.message, code: err.code });
  }
  return next(err);
});

module.exports = router;
