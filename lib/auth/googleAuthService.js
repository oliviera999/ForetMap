'use strict';

/**
 * Connexion Google ForetMap — règles métier du rappel OAuth (`GET /api/auth/google/callback`).
 *
 * Extrait de `routes/auth.js` (piste B, étape B6 ; ligne 11 du § 3.3 de
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`) **sans changement de comportement** : même ordre
 * des lectures et écritures, mêmes codes d'échec, mêmes lignes `security_events`. Le routeur
 * garde tout ce qui est HTTP (cookies de la poignée de main, `state`, configuration dérivée de
 * la requête, redirections) ; ce service ne connaît ni `res` ni les cookies.
 *
 * Contrat : `completeGoogleLogin` rend un **résultat**, jamais une redirection —
 *   - `{ ok: false, error, roleLabel? }` : code d'échec affiché par le front (`#oauth_error=`),
 *     `roleLabel` nommant le profil refusé quand il y en a un ;
 *   - `{ ok: true, payload }` : charge encodée par le routeur dans `#oauth=`.
 * Une exception est laissée au routeur, qui la journalise et répond `oauth_server_error`.
 *
 * Modes (`normalizeOAuthMode`) : `teacher` (console, comptes enseignants seulement), `staff`
 * (plan des personnels, comptes existants autorisés, quel que soit leur type) et `student`
 * (défaut, seul mode où un compte peut être créé).
 */

const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { queryOne, execute } = require('../../database');
const { signAuthToken } = require('../../middleware/requireTeacher');
const { toPublicUserRow } = require('../publicUser');
const { parseDiscoveryTourSeen } = require('../discoveryTourSeen');
const { emitStudentsChanged } = require('../realtime');
const { recomputeUserRole } = require('../effectiveRole');
const { getSettingValue } = require('../settings');
const { isGoogleAutoRegistrationAllowed } = require('../registrationPolicy');
const { logSecurityEvent } = require('../auditLog');
const { resolveAccountStaffPlanAccess } = require('../staffPlanAccess');
const { normalizeOptionalString } = require('../shared/httpHelpers');
const { nowDbTimestamp } = require('../shared/isoTimestamp');
const {
  normalizeEmail,
  splitDisplayName,
  isGoogleEmailAllowed,
  exposeAuth,
} = require('../authRouteHelpers');
const { buildSessionPayload } = require('./sessionPayload');
const logger = require('../logger');

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

const googleOidcClient = new OAuth2Client();
/** Crochets de test : simulent l'échange du code et la vérification du jeton d'identité. */
const googleOAuthHooks = {
  exchangeCode: null,
  verifyIdToken: null,
};

function setGoogleOAuthHooks({ exchangeCode, verifyIdToken } = {}) {
  googleOAuthHooks.exchangeCode = typeof exchangeCode === 'function' ? exchangeCode : null;
  googleOAuthHooks.verifyIdToken = typeof verifyIdToken === 'function' ? verifyIdToken : null;
}

/**
 * Échec de l'échange du code chez Google. Porte le code d'erreur OAuth rendu par le point de
 * jeton (RFC 6749 §5.2, champ `error`) : sans lui, un code expiré ou des identifiants OAuth
 * refusés se fondaient dans « Erreur serveur », et le journal ne disait pas pourquoi.
 */
class GoogleTokenExchangeError extends Error {
  constructor(message, { status = null, oauthError = null, description = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'GoogleTokenExchangeError';
    this.status = status;
    this.oauthError = oauthError;
    this.oauthErrorDescription = description;
    this.unreachable = !!cause;
  }
}

/**
 * Codes d'erreur de l'échange qui ont une cause nommable côté utilisateur.
 * - `invalid_grant` : code expiré ou déjà utilisé (retour lent, double validation, bouton
 *   « Précédent ») — relancer la connexion suffit.
 * - `invalid_client`, `unauthorized_client`, `redirect_uri_mismatch` : identifiants OAuth du
 *   serveur refusés par Google — seul un administrateur peut corriger.
 */
const EXCHANGE_FAILURE_CODES = Object.freeze({
  invalid_grant: 'oauth_code_expired',
  invalid_client: 'oauth_client_rejected',
  unauthorized_client: 'oauth_client_rejected',
  redirect_uri_mismatch: 'oauth_client_rejected',
});

/** Code d'échec affichable pour une erreur d'échange, `null` si elle reste inexpliquée. */
function exchangeFailureCode(err) {
  if (!(err instanceof GoogleTokenExchangeError)) return null;
  if (err.unreachable) return 'oauth_google_unreachable';
  return EXCHANGE_FAILURE_CODES[err.oauthError] || null;
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
  let tokenRes;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
  } catch (err) {
    throw new GoogleTokenExchangeError('Google injoignable pour l’échange du code', {
      cause: err,
    });
  }
  if (!tokenRes.ok) {
    let body = null;
    try {
      body = await tokenRes.json();
    } catch (_) {
      body = null;
    }
    throw new GoogleTokenExchangeError('Échange OAuth Google échoué', {
      status: tokenRes.status,
      oauthError: normalizeOptionalString(body?.error),
      description: normalizeOptionalString(body?.error_description),
    });
  }
  return tokenRes.json();
}

async function verifyGoogleIdToken({ idToken, audience }) {
  if (googleOAuthHooks.verifyIdToken) {
    return googleOAuthHooks.verifyIdToken({ idToken, audience });
  }
  const ticket = await googleOidcClient.verifyIdToken({ idToken, audience });
  return ticket.getPayload() || null;
}

/** La connexion Google est-elle ouverte par l'administrateur ? */
async function isGoogleLoginEnabled() {
  return getSettingValue('integration.google.enabled', true);
}

function fail(error, roleLabel) {
  return roleLabel === undefined ? { ok: false, error } : { ok: false, error, roleLabel };
}

/**
 * Ce compte peut-il ouvrir le plan des personnels ? Même règle que la garde de
 * `/api/staff-plan/*` (`lib/staffPlanAccess.js`) : permission RBAC `staff_plan.access`, ou
 * profil coché dans **Réglages → Plan Lyautey → Plan des personnels**. Vérifiée ici pour que
 * l'échec soit dit à la connexion, plutôt qu'au premier appel refusé derrière un jeton valide.
 *
 * Le profil **attribué** compte autant que le profil effectif : un groupe confère le sien dès
 * qu'il est de rang supérieur, et « Personnel » est le plus bas du catalogue — sans cela, un
 * personnel rattaché à une classe était refusé à sa propre porte
 * (`resolveAccountStaffPlanAccess`).
 *
 * @param {{ roleSlug?: string, permissions?: string[], userId?: string, userType?: string }} tokenPayload
 * @returns {Promise<{ ok: boolean, roleSlug: string, via?: string }>}
 */
async function mayOpenStaffPlan(tokenPayload) {
  return resolveAccountStaffPlanAccess(tokenPayload);
}

/** Trace d'usage d'une connexion réussie : jamais bloquante. */
function recordLoginTouch(userType, userId) {
  try {
    const { recordAuthenticatedTouch } = require('../userTracking');
    void recordAuthenticatedTouch({
      product: 'foret',
      userType,
      userId,
      action: 'login',
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Échange du code, vérification du jeton d'identité et de ses revendications, puis contrôle
 * de la liste blanche (domaines de l'établissement, dérogations par e-mail).
 * @returns {Promise<{ ok: false, error: string } | { ok: true, payload: object, email: string, googleSub: string|null }>}
 */
async function verifyGoogleIdentity({ code, cfg }) {
  let tokenData;
  try {
    tokenData = await exchangeGoogleCode({
      code,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: cfg.redirectUri,
    });
  } catch (err) {
    const failure = exchangeFailureCode(err);
    if (!failure) throw err;
    // Cause nommée à l'utilisateur ; la réponse de Google (jamais le secret) va au journal.
    logger.warn(
      {
        err,
        failure,
        httpStatus: err.status,
        oauthError: err.oauthError,
        oauthErrorDescription: err.oauthErrorDescription,
        redirectUri: cfg.redirectUri,
      },
      'Connexion Google : échange du code refusé',
    );
    return fail(failure);
  }
  const idToken = normalizeOptionalString(tokenData?.id_token);
  if (!idToken) return fail('oauth_missing_id_token');
  const payload = await verifyGoogleIdToken({ idToken, audience: cfg.clientId });
  if (!payload) return fail('oauth_invalid_token');
  const email = normalizeEmail(payload.email);
  const issuer = String(payload.iss || '');
  const emailVerified =
    payload.email_verified === true || String(payload.email_verified) === 'true';
  const audience = String(payload.aud || '');
  if (!email || !emailVerified || audience !== cfg.clientId || !GOOGLE_ISSUERS.includes(issuer)) {
    return fail('oauth_claims_invalid');
  }
  if (!isGoogleEmailAllowed(email, payload.hd, cfg.allowedDomains, cfg.allowedEmails)) {
    return fail('oauth_email_not_allowed');
  }
  return { ok: true, payload, email, googleSub: normalizeOptionalString(payload.sub) };
}

/**
 * Compte enseignant : connexion seule, jamais de création. En mode `staff`, l'accès au plan
 * des personnels est vérifié avant d'émettre le jeton.
 */
async function loginTeacher({ teacher, googleSub, mode, auditReq }) {
  // Le réglage « connexion Google enseignant » se relit ici, quel que soit le `mode` :
  // `/google/start?mode=student` ne le contournait pas moins (CDG-14).
  const allowTeacher = await getSettingValue('ui.auth.allow_google_teacher', true);
  if (!allowTeacher) return fail('oauth_teacher_google_disabled');
  if (googleSub && teacher.google_sub && teacher.google_sub !== googleSub) {
    return fail('oauth_account_mismatch');
  }
  if (!teacher.is_active) return fail('oauth_teacher_inactive');
  await recomputeUserRole(teacher.id);
  const now = nowDbTimestamp();
  await execute(
    "UPDATE users SET last_seen = ?, google_sub = COALESCE(google_sub, ?), updated_at = NOW() WHERE id = ? AND user_type = 'teacher'",
    [now, googleSub, teacher.id],
  );
  const session = await buildSessionPayload('teacher', teacher.id);
  if (!session) return fail('oauth_teacher_no_role');
  if (mode === 'staff') {
    const staffAccess = await mayOpenStaffPlan(session.tokenPayload);
    if (!staffAccess.ok) {
      await logSecurityEvent('auth.login.staff_plan.oauth_google', {
        req: auditReq,
        result: 'failure',
        reason: 'oauth_staff_no_access',
        actorUserType: 'teacher',
        actorUserId: teacher.id,
        payload: { role_slug: staffAccess.roleSlug || null },
      });
      return fail(
        'oauth_staff_no_access',
        session.tokenPayload.roleDisplayName || staffAccess.roleSlug,
      );
    }
  }
  const token = await signAuthToken(session.tokenPayload);
  await logSecurityEvent('auth.login.teacher.oauth_google', {
    req: auditReq,
    actorUserType: 'teacher',
    actorUserId: teacher.id,
    targetType: 'teacher',
    targetId: teacher.id,
  });
  recordLoginTouch('teacher', teacher.id);
  return {
    ok: true,
    payload: {
      // En mode `staff`, le produit de retour est le plan des personnels : il attend un
      // jeton, pas une session de console. Le type le dit, et le front n'a pas à deviner
      // le type de compte qui se cache derrière un personnel autorisé.
      type: mode === 'staff' ? 'staff' : 'teacher',
      token,
      auth: exposeAuth(session.tokenPayload),
    },
  };
}

/**
 * Plan des personnels : un compte **non enseignant** autorisé (profil « Personnel », ou tout
 * profil coché dans `ui.staff_plan.allowed_role_slugs`) entre ici.
 *
 * Régression corrigée : la porte de proflyautey lançait `mode=teacher`, et tout compte de
 * type `student` — ce qu'est un « Personnel » par construction, ainsi que tout compte promu
 * « Prof de classe » depuis un compte élève (l'attribution d'un profil ne change pas
 * `users.user_type`) — repartait avec `oauth_teacher_account_not_found`, affiché « La
 * connexion n'a pas abouti ». Seuls les comptes enseignants (admin, n3boss) entraient.
 *
 * Aucune création de compte ici, comme en mode enseignant : un plan de personnels ne s'ouvre
 * pas à qui n'a pas déjà de compte — c'est le rôle du code partagé.
 */
async function loginStaffAccount({ bySub, email, googleSub, auditReq }) {
  const staffUser =
    bySub && bySub.user_type === 'student'
      ? bySub
      : await queryOne(
          "SELECT id, email, is_active, google_sub FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?) LIMIT 1",
          [email],
        );
  if (!staffUser) {
    await logSecurityEvent('auth.login.staff_plan.oauth_google', {
      req: auditReq,
      result: 'failure',
      reason: 'oauth_staff_account_not_found',
      payload: { email },
    });
    return fail('oauth_staff_account_not_found');
  }
  // Le jeton délivré est un jeton ForetMap ordinaire : le réglage qui ferme la connexion
  // Google des élèves vaut donc ici aussi (même raison que CDG-14 côté enseignant).
  const allowStudentGoogle = await getSettingValue('ui.auth.allow_google_student', true);
  if (!allowStudentGoogle) return fail('oauth_student_google_disabled');
  if (googleSub && staffUser.google_sub && staffUser.google_sub !== googleSub) {
    return fail('oauth_account_mismatch');
  }
  if (!Number(staffUser.is_active)) return fail('oauth_account_inactive');
  await execute(
    "UPDATE users SET last_seen = ?, google_sub = COALESCE(google_sub, ?), updated_at = NOW() WHERE id = ? AND user_type = 'student'",
    [nowDbTimestamp(), googleSub, staffUser.id],
  );
  await recomputeUserRole(staffUser.id);
  const session = await buildSessionPayload('student', staffUser.id);
  const staffAccess = session
    ? await mayOpenStaffPlan(session.tokenPayload)
    : { ok: false, roleSlug: '' };
  if (!staffAccess.ok) {
    await logSecurityEvent('auth.login.staff_plan.oauth_google', {
      req: auditReq,
      result: 'failure',
      reason: 'oauth_staff_no_access',
      actorUserType: 'student',
      actorUserId: staffUser.id,
      payload: { role_slug: staffAccess.roleSlug || null },
    });
    return fail(
      'oauth_staff_no_access',
      session?.tokenPayload?.roleDisplayName || staffAccess.roleSlug,
    );
  }
  const token = await signAuthToken(session.tokenPayload);
  await logSecurityEvent('auth.login.staff_plan.oauth_google', {
    req: auditReq,
    actorUserType: 'student',
    actorUserId: staffUser.id,
    targetType: 'student',
    targetId: staffUser.id,
  });
  recordLoginTouch('student', staffUser.id);
  return {
    ok: true,
    payload: {
      type: 'staff',
      token,
      auth: exposeAuth(session.tokenPayload),
    },
  };
}

/** Mode enseignant : ne jamais créer / connecter un élève par repli — message d'échec explicite. */
async function rejectTeacherModeWithoutTeacherAccount({ email, auditReq }) {
  const studentSameEmail = await queryOne(
    "SELECT id FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?) LIMIT 1",
    [email],
  );
  const errorCode = studentSameEmail
    ? 'oauth_teacher_email_is_student'
    : 'oauth_teacher_account_not_found';
  await logSecurityEvent('auth.login.teacher.oauth_google', {
    req: auditReq,
    result: 'failure',
    reason: errorCode,
    payload: { email },
  });
  return fail(errorCode);
}

/**
 * Création d'un compte élève à la première connexion Google (subordonnée à
 * `ui.auth.allow_register`, cf. `lib/registrationPolicy.js`).
 * @returns {Promise<object>} la ligne `users` créée
 */
async function registerGoogleStudent({ email, googleSub, payload }) {
  const id = crypto.randomUUID();
  const now = nowDbTimestamp();
  const splitName = splitDisplayName(payload.name);
  const firstName = normalizeOptionalString(payload.given_name) || splitName.firstName;
  const lastName = normalizeOptionalString(payload.family_name) || splitName.lastName;
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
     VALUES (?, 'student', NULL, ?, NULL, ?, ?, ?, 'Compte Google', NULL, NULL, 'google', 1, ?, NOW(), NOW())`,
    [id, email, firstName, lastName, `${firstName} ${lastName}`.trim(), now],
  );
  if (googleSub) {
    await execute("UPDATE users SET google_sub = ? WHERE id = ? AND user_type = 'student'", [
      googleSub,
      id,
    ]);
  }
  await recomputeUserRole(id);
  emitStudentsChanged({ reason: 'register_google', studentId: id });
  return queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [id]);
}

/** Compte élève : connexion, ou création si l'auto-inscription Google est ouverte. */
async function loginOrRegisterStudent({ bySub, email, googleSub, payload, auditReq }) {
  let student =
    bySub && bySub.user_type === 'student'
      ? await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [bySub.id])
      : await queryOne(
          "SELECT * FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?) LIMIT 1",
          [email],
        );
  // Liaison par e-mail (compte non encore lié) : une adresse saisie par l'élève lui-même
  // n'ouvre pas un compte déjà rattaché à une **autre** identité Google (CDG-15).
  if (student && googleSub && student.google_sub && student.google_sub !== googleSub) {
    return fail('oauth_account_mismatch');
  }
  let accountJustCreated = false;
  if (!student) {
    // Subordonné à `ui.auth.allow_register` depuis le lot I (constat S11) : fermer les
    // inscriptions ferme aussi ce chemin-ci.
    if (!(await isGoogleAutoRegistrationAllowed())) return fail('oauth_account_not_found');
    student = await registerGoogleStudent({ email, googleSub, payload });
    accountJustCreated = true;
  } else {
    // Même règle que la connexion par mot de passe : un compte désactivé n'obtient pas de
    // jeton (il tombait sinon en 401 à la première requête, CDG-47).
    if (!Number(student.is_active)) return fail('oauth_account_inactive');
    await execute(
      "UPDATE users SET last_seen = ?, google_sub = COALESCE(google_sub, ?) WHERE id = ? AND user_type = 'student'",
      [nowDbTimestamp(), googleSub, student.id],
    );
    student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      student.id,
    ]);
    await recomputeUserRole(student.id);
  }

  const session = await buildSessionPayload('student', student.id);
  const token = session ? await signAuthToken(session.tokenPayload) : null;
  await logSecurityEvent('auth.login.student.oauth_google', {
    req: auditReq,
    actorUserType: 'student',
    actorUserId: student.id,
    targetType: 'student',
    targetId: student.id,
    payload: accountJustCreated ? { account_created: true } : undefined,
  });
  recordLoginTouch('student', student.id);
  return {
    ok: true,
    payload: {
      type: 'student',
      accountCreated: accountJustCreated,
      student: {
        ...toPublicUserRow(student),
        discoveryTourSeen: parseDiscoveryTourSeen(student?.discovery_tour_seen_json),
        authToken: token,
        auth: session ? exposeAuth(session.tokenPayload) : null,
      },
    },
  };
}

/**
 * Fin de la connexion Google, après validation HTTP du `state` et du `code` par le routeur.
 *
 * @param {object} params
 * @param {string} params.code code d'autorisation renvoyé par Google
 * @param {'teacher'|'staff'|'student'} params.mode mode normalisé de la poignée de main
 * @param {{ clientId: string, clientSecret: string, redirectUri: string, allowedDomains: Set<string>, allowedEmails: Set<string> }} params.cfg
 * @param {object} [params.auditReq] requête transmise telle quelle au journal de sécurité
 *   (adresse IP, agent utilisateur) — le service n'en lit rien d'autre
 * @returns {Promise<{ ok: false, error: string, roleLabel?: string } | { ok: true, payload: object }>}
 */
async function completeGoogleLogin({ code, mode, cfg, auditReq }) {
  const identity = await verifyGoogleIdentity({ code, cfg });
  if (!identity.ok) return identity;
  const { payload, email, googleSub } = identity;

  // Le compte déjà lié à cette identité Google (`users.google_sub`) fait foi avant l'e-mail :
  // un changement d'adresse côté Google ne détourne pas la liaison (CDG-15).
  const bySub = googleSub
    ? await queryOne(
        "SELECT id, user_type, email, is_active, google_sub FROM users WHERE google_sub = ? AND user_type IN ('teacher', 'student') LIMIT 1",
        [googleSub],
      )
    : null;
  const teacher =
    bySub && bySub.user_type === 'teacher'
      ? bySub
      : await queryOne(
          "SELECT id, email, is_active, google_sub FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
          [email],
        );
  if (teacher) return loginTeacher({ teacher, googleSub, mode, auditReq });
  if (mode === 'staff') return loginStaffAccount({ bySub, email, googleSub, auditReq });
  if (mode === 'teacher') return rejectTeacherModeWithoutTeacherAccount({ email, auditReq });
  return loginOrRegisterStudent({ bySub, email, googleSub, payload, auditReq });
}

module.exports = {
  GoogleTokenExchangeError,
  completeGoogleLogin,
  isGoogleLoginEnabled,
  mayOpenStaffPlan,
  setGoogleOAuthHooks,
};
