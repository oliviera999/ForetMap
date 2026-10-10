'use strict';

/**
 * Double authentification (TOTP) — routes `/api/auth/totp/*`.
 *
 * Deux façons d'y entrer :
 *   - avec le **jeton intermédiaire** (`mfaToken`, `lib/auth/mfaPending.js`) remis par une
 *     connexion dont le premier facteur est validé : vérification d'un code (`/verify`) ou
 *     enrôlement imposé (`/enroll/*`, étape `enroll`) ; le succès émet la session ;
 *   - avec une **session** (`Authorization: Bearer`) : état, activation volontaire ou
 *     changement d'appareil, régénération des codes de secours.
 *
 * Réponses d'erreur : `{ error, code }` — `MFA_TOKEN_INVALID` (étape expirée, déjà utilisée
 * ou compte modifié : se reconnecter), `MFA_CODE_INVALID`, `MFA_CODE_REQUIRED`,
 * `MFA_LOCKED` (429 + `Retry-After`), `MFA_DISABLED`, `MFA_NOT_SUBJECT`, `MFA_NOT_ENROLLED`,
 * `MFA_ALREADY_ENROLLED`, `MFA_ENROLL_EXPIRED`, `MFA_ENROLL_NOT_STARTED`, `TOTP_KEY_MISSING` (503).
 * Les réponses qui portent un secret ou des codes de secours sont en `Cache-Control: no-store`.
 */

const express = require('express');
const QRCode = require('qrcode');
const { queryOne } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const { logSecurityEvent } = require('../lib/auditLog');
const { getBrand } = require('../lib/brand');
const { exposeAuth } = require('../lib/authRouteHelpers');
const {
  requireAuth,
  resolveAuthOrRespond,
  signAuthToken,
} = require('../middleware/requireTeacher');
const { buildSessionPayload } = require('../lib/auth/sessionPayload');
const { bumpUserTokenEpoch } = require('../lib/auth/tokenEpoch');
const { getMfaEnforcement, isMfaSubjectRole } = require('../lib/auth/mfaPolicy');
const { readMfaPendingToken, consumeMfaPendingToken } = require('../lib/auth/mfaPending');
const { markSessionMfa } = require('../lib/auth/mfaClaims');
const { notifyTotpChange } = require('../lib/auth/mfaLogin');
const { buildLoginResponseBody, recordLoginTouch } = require('../lib/auth/loginResponse');
const { isTotpKeyConfigured } = require('../lib/auth/totpCrypto');
const { buildOtpauthUri, base32Encode } = require('../lib/auth/totp');
const store = require('../lib/auth/totpStore');
const { buildAuthzPayload } = require('../lib/rbac');

const router = express.Router();

function noStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
}

function invalidStep(res) {
  return res.status(401).json({
    error: 'Étape de connexion expirée ou déjà utilisée : reconnectez-vous.',
    code: 'MFA_TOKEN_INVALID',
  });
}

/**
 * Jeton intermédiaire → compte, après relecture de l'état du compte (actif, époque de jeton
 * inchangée). `null` si irrecevable.
 */
async function loadPendingContext(rawToken, expectedStage) {
  const claims = readMfaPendingToken(normalizeOptionalString(rawToken));
  if (!claims || (expectedStage && claims.stage !== expectedStage)) return null;
  const account = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [
    String(claims.userId),
  ]);
  if (!account || !Number(account.is_active)) return null;
  if (Number(account.token_epoch || 0) !== Number(claims.tokenEpoch || 0)) return null;
  return { claims, account, userId: String(account.id), userType: String(claims.userType) };
}

/** Échec d'un second facteur : journal, puis réponse normalisée. */
async function respondFactorFailure(req, res, result, { userId, userType, action }) {
  await logSecurityEvent(action, {
    req,
    actorUserType: userType,
    actorUserId: userId,
    targetType: userType,
    targetId: userId,
    result: 'failure',
    reason: result.reason,
    payload: result.method ? { method: result.method } : undefined,
  });
  if (result.reason === 'locked') {
    const retry = Math.max(1, Number(result.retryAfterSeconds || 1));
    res.set('Retry-After', String(retry));
    return res.status(429).json({
      error: `Trop d’essais pour ce compte : réessayez dans ${retry} s.`,
      code: 'MFA_LOCKED',
      retryAfterSeconds: retry,
    });
  }
  if (result.reason === 'key_unavailable') {
    return res.status(503).json({
      error: 'Double authentification momentanément indisponible : prévenez un administrateur.',
      code: 'TOTP_KEY_MISSING',
    });
  }
  if (result.reason === 'not_enrolled') {
    return res
      .status(409)
      .json({ error: 'Double authentification non activée', code: 'MFA_NOT_ENROLLED' });
  }
  return res
    .status(401)
    .json({ error: 'Code incorrect ou déjà utilisé', code: 'MFA_CODE_INVALID' });
}

/** Session complète après un second facteur validé, au format de `POST /api/auth/login`. */
async function issueValidatedLogin(req, { claims, account, userId, userType, method }) {
  const session = await buildSessionPayload(userType, userId);
  if (!session) return null;
  const tokenPayload = markSessionMfa(session.tokenPayload, method);
  const token = await signAuthToken(tokenPayload);
  await logSecurityEvent('auth.login', {
    req,
    actorUserType: userType,
    actorUserId: userId,
    targetType: userType,
    targetId: userId,
    payload: { via: claims.via === 'password' ? 'identifier' : claims.via, mfa: method },
  });
  recordLoginTouch(req, userType, userId);
  return {
    ...(await buildLoginResponseBody({ account, tokenPayload, token })),
    sessionKind: claims.next || userType,
    mfaMethod: method,
  };
}

/**
 * Contexte d'enrôlement : jeton intermédiaire (étape `enroll`) ou session. Répond lui-même
 * en cas de refus et rend `null`.
 */
async function resolveEnrollmentContext(req, res) {
  const rawToken = normalizeOptionalString(req.body?.mfaToken);
  let ctx;
  if (rawToken) {
    const pending = await loadPendingContext(rawToken, 'enroll');
    if (!pending) {
      invalidStep(res);
      return null;
    }
    const authz = await buildAuthzPayload(pending.userType, pending.userId);
    ctx = { mode: 'pending', ...pending, authz };
  } else {
    const auth = await resolveAuthOrRespond(req, res);
    if (!auth) return null;
    if (auth.impersonating) {
      res.status(403).json({ error: 'Indisponible pendant une prise de contrôle' });
      return null;
    }
    const account = await queryOne('SELECT * FROM users WHERE id = ? LIMIT 1', [
      String(auth.userId),
    ]);
    if (!account) {
      res.status(404).json({ error: 'Utilisateur introuvable' });
      return null;
    }
    ctx = {
      mode: 'session',
      account,
      userId: String(auth.userId),
      userType: String(auth.userType),
      authz: auth,
      claims: null,
    };
  }
  if ((await getMfaEnforcement()) === 'off') {
    res
      .status(403)
      .json({ error: 'Double authentification désactivée sur ce serveur', code: 'MFA_DISABLED' });
    return null;
  }
  if (!isMfaSubjectRole(ctx.authz)) {
    res.status(403).json({
      error: 'La double authentification concerne les comptes administrateur et n3boss.',
      code: 'MFA_NOT_SUBJECT',
    });
    return null;
  }
  return ctx;
}

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const enforcement = await getMfaEnforcement();
    const subject = isMfaSubjectRole(req.auth);
    const status = await store.getTotpStatus(req.auth.userId);
    const keyConfigured = isTotpKeyConfigured();
    res.json({
      enforcement,
      subject,
      required: subject && enforcement === 'required',
      enrolled: status.enabled,
      enabledAt: status.enabledAt,
      backupCodesRemaining: status.backupCodesRemaining,
      keyConfigured,
      setupAvailable: subject && enforcement !== 'off' && keyConfigured,
      sessionValidated: !!req.auth.mfa,
    });
  }),
);

router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const ctx = await loadPendingContext(req.body?.mfaToken, 'verify');
    if (!ctx) return invalidStep(res);
    const code = normalizeOptionalString(req.body?.code);
    const backupCode = normalizeOptionalString(req.body?.backupCode);
    if (!code && !backupCode) {
      return res.status(400).json({ error: 'Code requis', code: 'MFA_CODE_REQUIRED' });
    }
    const result = await store.verifySecondFactor(ctx.userId, { code, backupCode });
    if (!result.ok) {
      return respondFactorFailure(req, res, result, { ...ctx, action: 'auth.totp.verify' });
    }
    consumeMfaPendingToken(ctx.claims);
    await logSecurityEvent('auth.totp.verify', {
      req,
      actorUserType: ctx.userType,
      actorUserId: ctx.userId,
      targetType: ctx.userType,
      targetId: ctx.userId,
      payload: { method: result.method, via: ctx.claims.via },
    });
    if (result.method === 'backup_code') {
      await logSecurityEvent('auth.totp.backup_code_used', {
        req,
        actorUserType: ctx.userType,
        actorUserId: ctx.userId,
        targetType: ctx.userType,
        targetId: ctx.userId,
        payload: { remaining: result.remaining },
      });
      notifyTotpChange(ctx.userId, 'backup_code_used');
    }
    const body = await issueValidatedLogin(req, { ...ctx, method: result.method });
    if (!body) return res.status(403).json({ error: 'Aucun profil attribué' });
    noStore(res);
    res.json({
      ...body,
      ...(result.method === 'backup_code' ? { backupCodesRemaining: result.remaining } : {}),
    });
  }),
);

router.post(
  '/enroll/start',
  asyncHandler(async (req, res) => {
    const ctx = await resolveEnrollmentContext(req, res);
    if (!ctx) return;
    if (!isTotpKeyConfigured()) {
      return res.status(503).json({
        error:
          'La double authentification n’est pas encore configurée sur ce serveur : prévenez un administrateur.',
        code: 'TOTP_KEY_MISSING',
      });
    }
    const enrolled = await store.isTotpEnabled(ctx.userId);
    if (enrolled && ctx.mode === 'pending') {
      return res.status(409).json({
        error: 'Double authentification déjà active : saisissez un code.',
        code: 'MFA_ALREADY_ENROLLED',
      });
    }
    if (enrolled) {
      // Changer d'appareil exige le facteur actuel : une session volée ne le remplace pas.
      const code = normalizeOptionalString(req.body?.code);
      const backupCode = normalizeOptionalString(req.body?.backupCode);
      if (!code && !backupCode) {
        return res.status(401).json({
          error: 'Code actuel requis pour changer d’appareil',
          code: 'MFA_CODE_REQUIRED',
        });
      }
      const current = await store.verifySecondFactor(ctx.userId, { code, backupCode });
      if (!current.ok) {
        return respondFactorFailure(req, res, current, { ...ctx, action: 'auth.totp.verify' });
      }
    }
    const { secret } = await store.startEnrollment(ctx.userId);
    const issuer = getBrand().appName;
    const accountName =
      normalizeOptionalString(ctx.account.email) ||
      normalizeOptionalString(ctx.account.pseudo) ||
      normalizeOptionalString(ctx.account.display_name) ||
      String(ctx.userId);
    const otpauthUri = buildOtpauthUri({ secret, issuer, accountName });
    const secretBase32 = base32Encode(secret);
    secret.fill(0);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    });
    await logSecurityEvent('auth.totp.enroll_start', {
      req,
      actorUserType: ctx.userType,
      actorUserId: ctx.userId,
      targetType: ctx.userType,
      targetId: ctx.userId,
      payload: { via: ctx.mode === 'pending' ? ctx.claims.via : 'session', replace: enrolled },
    });
    noStore(res);
    res.json({
      secret: secretBase32,
      otpauthUri,
      qrDataUrl,
      issuer,
      accountName,
      expiresInSeconds: store.PENDING_TTL_SECONDS,
    });
  }),
);

router.post(
  '/enroll/confirm',
  asyncHandler(async (req, res) => {
    const ctx = await resolveEnrollmentContext(req, res);
    if (!ctx) return;
    const code = normalizeOptionalString(req.body?.code);
    if (!code) return res.status(400).json({ error: 'Code requis', code: 'MFA_CODE_REQUIRED' });
    const result = await store.confirmEnrollment(ctx.userId, code);
    if (!result.ok) {
      if (result.reason === 'pending_expired') {
        return res.status(400).json({
          error: 'Le QR code a expiré : recommencez l’activation.',
          code: 'MFA_ENROLL_EXPIRED',
        });
      }
      if (result.reason === 'no_pending') {
        return res
          .status(409)
          .json({ error: 'Aucune activation en cours', code: 'MFA_ENROLL_NOT_STARTED' });
      }
      return respondFactorFailure(req, res, result, { ...ctx, action: 'auth.totp.enroll' });
    }
    // Toute autre session du compte tombe : elle a été ouverte sans ce second facteur.
    await bumpUserTokenEpoch(ctx.userId);
    await logSecurityEvent('auth.totp.enroll', {
      req,
      actorUserType: ctx.userType,
      actorUserId: ctx.userId,
      targetType: ctx.userType,
      targetId: ctx.userId,
      payload: {
        via: ctx.mode === 'pending' ? ctx.claims.via : 'session',
        replaced_previous: result.replacedPrevious,
      },
    });
    notifyTotpChange(ctx.userId, result.replacedPrevious ? 'device_changed' : 'enabled');
    noStore(res);
    if (ctx.mode === 'pending') {
      consumeMfaPendingToken(ctx.claims);
      const body = await issueValidatedLogin(req, { ...ctx, method: 'totp' });
      if (!body) return res.status(403).json({ error: 'Aucun profil attribué' });
      return res.json({ backupCodes: result.backupCodes, ...body });
    }
    const session = await buildSessionPayload(ctx.userType, ctx.userId);
    if (!session) return res.status(403).json({ error: 'Aucun profil attribué' });
    const tokenPayload = markSessionMfa(session.tokenPayload, 'totp');
    return res.json({
      backupCodes: result.backupCodes,
      authToken: await signAuthToken(tokenPayload),
      auth: exposeAuth(tokenPayload),
    });
  }),
);

router.post(
  '/backup-codes',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.auth.impersonating) {
      return res.status(403).json({ error: 'Indisponible pendant une prise de contrôle' });
    }
    const userId = String(req.auth.userId);
    const userType = String(req.auth.userType);
    if (!(await store.isTotpEnabled(userId))) {
      return res
        .status(409)
        .json({ error: 'Double authentification non activée', code: 'MFA_NOT_ENROLLED' });
    }
    const code = normalizeOptionalString(req.body?.code);
    if (!code) {
      return res.status(400).json({ error: 'Code actuel requis', code: 'MFA_CODE_REQUIRED' });
    }
    const current = await store.verifyTotpForUser(userId, code);
    if (!current.ok) {
      return respondFactorFailure(
        req,
        res,
        { ...current, method: 'totp' },
        { userId, userType, action: 'auth.totp.verify' },
      );
    }
    const backupCodes = await store.regenerateBackupCodes(userId);
    await logSecurityEvent('auth.totp.backup_codes_regenerate', {
      req,
      actorUserType: userType,
      actorUserId: userId,
      targetType: userType,
      targetId: userId,
    });
    notifyTotpChange(userId, 'backup_codes_regenerated');
    noStore(res);
    res.json({ backupCodes });
  }),
);

module.exports = router;
