const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { queryOne, execute } = require('../database');
const {
  JWT_SECRET,
  requireAuth,
  signAuthToken,
  parseBearerToken,
  requirePermission,
  hydrateAuthFromTokenClaims,
} = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const { toPublicUserRow } = require('../lib/publicUser');
const {
  parseDiscoveryTourSeen,
  normalizeDiscoveryTourSeenInput,
  mergeDiscoveryTourSeen,
  serializeDiscoveryTourSeen,
} = require('../lib/discoveryTourSeen');
const logger = require('../lib/logger');
const { emitStudentsChanged } = require('../lib/realtime');
const { sendPasswordResetEmail } = require('../lib/mailer');
const {
  EMAIL_RE,
  PRIVILEGED_PASSWORD_MIN_LEN,
  createPasswordResetToken,
  consumePasswordResetToken,
  getPasswordMinLength,
  getPasswordMinLengthFor,
  makeResetUrl,
  forgotPasswordAllowed,
} = require('../lib/passwordReset');
const {
  buildAuthzPayload,
  consumePendingAutoProfilePromotion,
  getPrimaryRoleForUser,
} = require('../lib/rbac');
const { recomputeUserRole } = require('../lib/effectiveRole');
const { getSettingValue, getAuthJwtTtls } = require('../lib/settings');
const {
  isRegistrationAllowed,
  isGoogleAutoRegistrationAllowed,
} = require('../lib/registrationPolicy');
const {
  countStudentActiveTaskAssignments,
  getEffectiveMaxActiveTaskAssignments,
} = require('../lib/studentTaskEnrollment');
const { logAudit, logSecurityEvent } = require('../lib/auditLog');
const { resolveLoginAccountByIdentifier } = require('../lib/identity');
const {
  getUserTokenEpoch,
  bumpUserTokenEpoch,
  applyImpersonationActorClaims,
} = require('../lib/auth/tokenEpoch');
const {
  shouldRenewAuthToken,
  carrySessionStart,
  resolveSessionStartedAt,
} = require('../lib/auth/slidingSession');
const { loginThrottle, sendLoginThrottled } = require('../lib/loginThrottle');
const { addStudentToGroup } = require('../lib/groupMembers');
const {
  resolveOAuthPublicOrigin,
  resolveOAuthRedirectUri,
  resolveProductReturnOrigin,
  originOfUrl,
} = require('../lib/oauthPublicUrl');
const { PRODUCTS, PRODUCT_IDS } = require('../lib/products');
const { resolveAccountStaffPlanAccess } = require('../lib/staffPlanAccess');

/**
 * Préfixes de host déclarés au registre des produits (`gl.`, `planlyautey.`, `proflyautey.`,
 * `stafflyautey.`). Lu tel quel : un produit peut en déclarer plusieurs (adresses alias).
 */
function listProductHostPrefixes() {
  return PRODUCT_IDS.flatMap((id) => [...PRODUCTS[id].hostPrefixes]);
}
const {
  readProfileFieldFlags,
  resolveVisitMascotUpdate,
  applyAvatarUpdate,
  findProfileUniquenessConflict,
  isDuplicateEntryError,
  verifyCurrentPassword,
} = require('../lib/profileUpdate');

const router = express.Router();
const OAUTH_STATE_COOKIE = 'foretmap_oauth_state';
const OAUTH_MODE_COOKIE = 'foretmap_oauth_mode';
/**
 * Origine réellement visitée au départ du flux OAuth. Google ne rappelle que sur les
 * `redirect_uri` enregistrées, donc toujours sur le même hôte : sans cette mémoire, un
 * personnel parti de `proflyautey.*` revenait sur l'origine de ForetMap, avec un jeton
 * inutilisable là où il l'avait demandé. Validée au retour contre le registre des produits
 * (`resolveProductReturnOrigin`) — jamais suivie telle quelle.
 */
const OAUTH_ORIGIN_COOKIE = 'foretmap_oauth_origin';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const googleOidcClient = new OAuth2Client();
const googleOAuthHooks = {
  exchangeCode: null,
  verifyIdToken: null,
};

const { normalizeOptionalString } = require('../lib/shared/httpHelpers');
const { nowDbTimestamp } = require('../lib/shared/isoTimestamp');
const {
  GOOGLE_ALLOWED_DOMAINS_DEFAULT,
  GOOGLE_ALLOWED_EMAILS_DEFAULT,
  normalizeEmail,
  parseCsvLowercaseSet,
  normalizeOAuthMode,
  googleOauthConfigured,
  splitDisplayName,
  isGoogleEmailAllowed,
  buildOAuthFrontendRedirect,
  buildOAuthFrontendErrorRedirect,
  validateProfileInput,
  exposeAuth,
} = require('../lib/authRouteHelpers');

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

function getGoogleOauthConfig(req) {
  const clientId = normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = normalizeOptionalString(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const redirectUri = resolveOAuthRedirectUri(req, {
    envRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    callbackPath: '/api/auth/google/callback',
  });
  const frontendOrigin =
    resolveOAuthPublicOrigin(req, process.env.FRONTEND_ORIGIN) ||
    resolveOAuthPublicOrigin(req, process.env.PASSWORD_RESET_BASE_URL);
  const allowedDomains = parseCsvLowercaseSet(
    process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS,
    GOOGLE_ALLOWED_DOMAINS_DEFAULT,
  );
  const allowedEmails = parseCsvLowercaseSet(
    process.env.GOOGLE_OAUTH_ALLOWED_EMAILS,
    GOOGLE_ALLOWED_EMAILS_DEFAULT,
  );
  return { clientId, clientSecret, redirectUri, frontendOrigin, allowedDomains, allowedEmails };
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

const { ensureTeacherAdminFromEnv } = require('../lib/teacherAdminSeed');

let seedTeacherChecked = false;
async function ensureTeacherSeedFromEnv() {
  if (seedTeacherChecked) return;
  seedTeacherChecked = true;
  // Plancher enseignant (12) : le compte administrateur initial ne fait pas exception (CDG-41).
  await ensureTeacherAdminFromEnv({ minPasswordLength: PRIVILEGED_PASSWORD_MIN_LEN });
}

async function buildSessionPayload(userType, userId) {
  const authz = await buildAuthzPayload(userType, userId);
  if (!authz) return null;
  // Époque de jeton : un changement de mot de passe l'incrémente et invalide les sessions.
  const tokenEpoch = await getUserTokenEpoch(userId);
  // Nom du compte (jamais le nom du profil) pour l'en-tête et les bandeaux (CDG-30).
  const named = await queryOne(
    'SELECT display_name, first_name, last_name, pseudo, email FROM users WHERE id = ? LIMIT 1',
    [String(userId)],
  );
  const displayName =
    normalizeOptionalString(named?.display_name) ||
    `${named?.first_name || ''} ${named?.last_name || ''}`.trim() ||
    normalizeOptionalString(named?.pseudo) ||
    normalizeOptionalString(named?.email) ||
    null;
  return {
    tokenPayload: {
      userType,
      userId,
      tokenEpoch,
      displayName,
      roleId: authz.roleId,
      roleSlug: authz.roleSlug,
      roleDisplayName: authz.roleDisplayName,
      permissions: authz.permissions,
      nativePrivileged: !!authz.nativePrivileged,
    },
    authz,
  };
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

async function resolveLoginUserType(user) {
  const explicit = normalizeOptionalString(user?.user_type)?.toLowerCase();
  const primary = await queryOne(
    `SELECT ur.user_type
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND ur.is_primary = 1
      ORDER BY r.\`rank\` DESC, ur.assigned_at ASC
      LIMIT 1`,
    [user?.id],
  );
  if (primary?.user_type) return String(primary.user_type).toLowerCase();
  if (explicit) return explicit;
  return 'student';
}

router.get('/me', requireAuth, async (req, res) => {
  const body = { auth: exposeAuth(req.auth) };
  // Claims du jeton présenté, partagés par les deux chemins de ré-émission ci-dessous
  // (renouvellement / resynchronisation de groupe) pour leur reconduire `sessionStartedAt`.
  let tokenClaims = null;
  try {
    const tokenIn = parseBearerToken(req);
    if (tokenIn && req.auth) {
      const claims = verifyJwtToken(tokenIn, JWT_SECRET);
      tokenClaims = claims;
      const roleChanged =
        String(claims.roleId) !== String(req.auth.roleId) ||
        String(claims.roleSlug || '').toLowerCase() !==
          String(req.auth.roleSlug || '').toLowerCase();
      const claimPerms = Array.isArray(claims.permissions)
        ? [...claims.permissions].map(String).sort()
        : [];
      const authPerms = Array.isArray(req.auth.permissions)
        ? [...req.auth.permissions].map(String).sort()
        : [];
      const permissionsChanged = JSON.stringify(claimPerms) !== JSON.stringify(authPerms);
      // Renouvellement glissant : un jeton entré dans son dernier tiers de vie est ré-émis,
      // tant que la session n'a pas dépassé son plafond absolu. Sans cela une session active
      // mourait à `security.jwt_ttl_base_seconds` (1 h 30 par défaut), en plein travail.
      const { slidingMaxSeconds } = await getAuthJwtTtls();
      const slidingRenewal = shouldRenewAuthToken(claims, { slidingMaxSeconds });
      // Un changement de rôle ou de permissions ré-émet le jeton, mais jamais au-delà du
      // plafond absolu de session : sinon la durée effective valait plafond + TTL (CDG-47).
      const sessionStartedAt = resolveSessionStartedAt(claims);
      const nowSec = Math.floor(Date.now() / 1000);
      const overSessionCap =
        slidingMaxSeconds > 0 &&
        sessionStartedAt > 0 &&
        nowSec - sessionStartedAt >= slidingMaxSeconds;
      if ((roleChanged || permissionsChanged || slidingRenewal) && !overSessionCap) {
        const session = await buildSessionPayload(req.auth.userType, req.auth.userId);
        if (session) {
          const tp = carrySessionStart(session.tokenPayload, claims);
          applyImpersonationActorClaims(tp, claims);
          body.refreshedToken = await signAuthToken(tp);
          body.auth = exposeAuth({
            ...tp,
            impersonating: req.auth.impersonating,
            impersonatedBy: req.auth.impersonatedBy,
          });
        }
      }
    }
  } catch (_) {
    /* Jeton déjà validé par requireAuth ; ignorer les écarts de décodage marginaux */
  }
  if (req.auth?.userId) {
    // Filet de sécurité : le profil effectif est recalculé (profil attribué ⊕ groupes) à
    // chaque `/me`, pour un compte modifié hors connexion (membre ajouté, groupe réglé).
    const roleSync = await recomputeUserRole(req.auth.userId);
    if (roleSync.changed) {
      const session = await buildSessionPayload(req.auth.userType, req.auth.userId);
      if (session) {
        const tp = carrySessionStart(session.tokenPayload, tokenClaims);
        // La prise de contrôle est reconduite ici aussi : sinon l'administrateur se
        // retrouvait avec un jeton ordinaire du compte contrôlé, sans issue (CDG-08).
        applyImpersonationActorClaims(tp, tokenClaims);
        body.refreshedToken = await signAuthToken(tp);
        body.auth = exposeAuth({
          ...tp,
          impersonating: req.auth.impersonating,
          impersonatedBy: req.auth.impersonatedBy,
        });
      }
    }
  }
  if (req.auth?.userType === 'student' && req.auth?.userId) {
    const promo = consumePendingAutoProfilePromotion(req.auth.userId);
    if (promo) body.autoProfilePromotion = promo;
    const u = await queryOne(
      `SELECT u.first_name, u.last_name,
              COALESCE(r.forum_participate, 1) AS forum_participate,
              COALESCE(r.context_comment_participate, 1) AS context_comment_participate
         FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'student' AND ur.is_primary = 1
    LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ? AND u.user_type = 'student' LIMIT 1`,
      [req.auth.userId],
    );
    if (u) {
      const maxActive = await getEffectiveMaxActiveTaskAssignments(req.auth.userId);
      const current = await countStudentActiveTaskAssignments(
        req.auth.userId,
        u.first_name,
        u.last_name,
      );
      body.taskEnrollment = {
        maxActiveAssignments: maxActive,
        currentActiveAssignments: current,
        atLimit: maxActive > 0 && current >= maxActive,
      };
      body.forumParticipate = Number(u.forum_participate) !== 0;
      body.contextCommentParticipate = Number(u.context_comment_participate) !== 0;
    }
  }
  // Progression des visites guidées (accueil OLU + onglets) : liée au compte, pas au navigateur.
  if (req.auth?.userId) {
    try {
      const seenRow = await queryOne(
        'SELECT discovery_tour_seen_json FROM users WHERE id = ? LIMIT 1',
        [req.auth.userId],
      );
      body.discoveryTourSeen = parseDiscoveryTourSeen(seenRow?.discovery_tour_seen_json);
    } catch (_) {
      body.discoveryTourSeen = {};
    }
  }
  res.json(body);
});

/**
 * Marque des parcours de visite guidée comme déjà vus pour le compte connecté.
 * Merge (union) : les clés déjà vraies restent vraies. Sans mot de passe actuel
 * (route étroite, comme la préférence mascotte).
 */
router.put(
  '/discovery-tour-seen',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth || {};
    if (!auth.userId) return res.status(401).json({ error: 'Authentification requise' });
    const normalized = normalizeDiscoveryTourSeenInput(req.body?.seen);
    if (!normalized.ok) return res.status(400).json({ error: normalized.error });
    const row = await queryOne('SELECT discovery_tour_seen_json FROM users WHERE id = ? LIMIT 1', [
      auth.userId,
    ]);
    if (!row) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const merged = mergeDiscoveryTourSeen(
      parseDiscoveryTourSeen(row.discovery_tour_seen_json),
      normalized.seen,
    );
    await execute(
      'UPDATE users SET discovery_tour_seen_json = ?, updated_at = NOW() WHERE id = ?',
      [serializeDiscoveryTourSeen(merged), String(auth.userId)],
    );
    res.json({ ok: true, discoveryTourSeen: merged });
  }),
);

router.patch(
  '/me/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const auth = req.auth || {};
    // Projection explicite (audit §2.4/§3.7) : champs consommés par le handler ;
    // password_hash requis ici pour vérifier le mot de passe actuel (bcrypt), jamais renvoyé au client.
    const account = await queryOne(
      `SELECT id, user_type, email, pseudo, description,
              visit_mascot_catalog_id, avatar_path, password_hash
         FROM users WHERE id = ? LIMIT 1`,
      [auth.userId],
    );
    if (!account) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const reauth = await verifyCurrentPassword(account, body);
    if (!reauth.ok) return res.status(reauth.status).json({ error: reauth.error });

    // Blocs communs avec PATCH /api/students/:id/profile extraits dans lib/profileUpdate.js
    // (drapeaux, mascotte visite, avatar, unicité) — mêmes gardes et messages.
    const flags = readProfileFieldFlags(body);
    const {
      hasPseudo,
      hasEmail,
      hasDescription,
      hasVisitMascotCatalogId,
      hasAvatarData,
      removeAvatar,
    } = flags;
    if (!flags.hasAny) {
      return res.status(400).json({ error: 'Aucun champ de profil à mettre à jour' });
    }

    const pseudo = hasPseudo ? normalizeOptionalString(body.pseudo) : account.pseudo;
    const email = hasEmail ? normalizeEmail(body.email ?? body.mail) : account.email;
    const description = hasDescription
      ? normalizeOptionalString(body.description)
      : account.description;
    const mascotRes = await resolveVisitMascotUpdate(
      hasVisitMascotCatalogId,
      body.visit_mascot_catalog_id,
      account.visit_mascot_catalog_id,
    );
    if (!mascotRes.ok) return res.status(400).json({ error: mascotRes.error });
    const visitMascotCatalogId = mascotRes.value;

    const profileError = validateProfileInput({ pseudo, email, description });
    if (profileError) return res.status(400).json({ error: profileError });
    const avatarRes = await applyAvatarUpdate({
      hasAvatarData,
      avatarDataRaw: body.avatarData,
      removeAvatar,
      currentPath: account.avatar_path,
      folder: String(account.user_type || 'users').toLowerCase(),
      userId: account.id,
    });
    if (!avatarRes.ok) return res.status(400).json({ error: avatarRes.error });
    const avatarPath = avatarRes.avatarPath;

    const conflict = await findProfileUniquenessConflict(pseudo, email, account.id);
    if (conflict) return res.status(409).json({ error: conflict });

    try {
      await execute(
        `UPDATE users
            SET pseudo = ?, email = ?, description = ?, visit_mascot_catalog_id = ?, avatar_path = ?, updated_at = NOW()
          WHERE id = ?`,
        [pseudo, email, description, visitMascotCatalogId, avatarPath, account.id],
      );
    } catch (err) {
      if (isDuplicateEntryError(err)) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }

    // Toutes les colonnes SAUF password_hash : l'objet est renvoyé tel quel au front (profil complet).
    const updated = await queryOne(
      `SELECT id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
              description, avatar_path, visit_mascot_catalog_id, auth_provider,
              is_active, last_seen, created_at, updated_at
         FROM users WHERE id = ? LIMIT 1`,
      [account.id],
    );
    logAudit(
      'update_user_profile',
      'user',
      account.id,
      `${updated?.first_name || ''} ${updated?.last_name || ''}`.trim() ||
        updated?.display_name ||
        account.id,
      {
        req,
        actorUserType: account.user_type,
        actorUserId: account.id,
        payload: {
          pseudo: !!hasPseudo,
          email: !!hasEmail,
          description: !!hasDescription,
          visit_mascot_catalog_id: !!hasVisitMascotCatalogId,
          avatar: !!(hasAvatarData || removeAvatar),
        },
      },
    );
    if (String(account.user_type || '').toLowerCase() === 'student') {
      emitStudentsChanged({ reason: 'student_profile_update', studentId: account.id });
    }
    res.json(toPublicUserRow(updated));
  }),
);

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    if (!(await isRegistrationAllowed()))
      return res.status(403).json({ error: 'La création de compte est désactivée.' });
    const { firstName, lastName, password } = req.body;
    const pseudo = normalizeOptionalString(req.body?.pseudo);
    const email = normalizeEmail(req.body?.email ?? req.body?.mail);
    const description = normalizeOptionalString(req.body?.description);
    if (!firstName?.trim() || !lastName?.trim())
      return res.status(400).json({ error: 'Prénom et nom requis' });
    // F2-A — code de classe optionnel : validé AVANT la création du compte pour
    // qu'une faute de frappe soit corrigeable (pas de compte visiteur orphelin).
    const classCode = normalizeOptionalString(req.body?.classCode);
    let classCodeGroup = null;
    if (classCode) {
      classCodeGroup = await queryOne(
        'SELECT id, name FROM `groups` WHERE class_code = ? AND is_active = 1 LIMIT 1',
        [classCode.toUpperCase()],
      );
      if (!classCodeGroup) {
        await logSecurityEvent('auth.register.class_code_invalid', {
          req,
          payload: { code_length: classCode.length },
        });
        return res.status(400).json({ error: 'Code de classe invalide' });
      }
    }
    const minPasswordLen = await getPasswordMinLength();
    if (typeof password !== 'string' || password.length < minPasswordLen)
      return res
        .status(400)
        .json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    const profileError = validateProfileInput({ pseudo, email, description });
    if (profileError) return res.status(400).json({ error: profileError });

    const existing = await queryOne(
      "SELECT id FROM users WHERE user_type = 'student' AND first_name = ? AND last_name = ?",
      [firstName.trim(), lastName.trim()],
    );
    if (existing) return res.status(409).json({ error: 'Un compte avec ce nom existe déjà' });
    if (pseudo) {
      const existingPseudo = await queryOne('SELECT id FROM users WHERE pseudo = ?', [pseudo]);
      if (existingPseudo) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    if (email) {
      const existingEmail = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (existingEmail) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    const now = nowDbTimestamp();
    try {
      await execute(
        `INSERT INTO users
          (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name, description, avatar_path, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
         VALUES (?, 'student', NULL, ?, ?, ?, ?, ?, ?, NULL, ?, 'local', 1, ?, NOW(), NOW())`,
        [
          id,
          email,
          pseudo,
          firstName.trim(),
          lastName.trim(),
          `${firstName.trim()} ${lastName.trim()}`.trim(),
          description,
          hash,
          now,
        ],
      );
    } catch (err) {
      if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      throw err;
    }
    // Profil attribué par défaut (visiteur) puis, si code de classe, profil conféré par le groupe.
    await recomputeUserRole(id);
    if (classCodeGroup) await addStudentToGroup(id, classCodeGroup.id);
    const student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
      id,
    ]);
    const session = await buildSessionPayload('student', id);
    const token = session ? await signAuthToken(session.tokenPayload) : null;
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
      ...toPublicUserRow(student),
      discoveryTourSeen: parseDiscoveryTourSeen(student?.discovery_tour_seen_json),
      authToken: token,
      auth: session ? exposeAuth(session.tokenPayload) : null,
    });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    // Un mot de passe qui n'est pas une chaîne (`{"password":123}`) faisait planter bcrypt en
    // 500 : il vaut « absent » (CDG-34).
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const identifier = normalizeOptionalString(req.body?.identifier);
    if (!password || !identifier)
      return res
        .status(400)
        .json({ error: 'Identifiant (email ou pseudo) et mot de passe requis' });
    await ensureTeacherSeedFromEnv();

    // Anti-force-brute PAR COMPTE (en plus du limiteur d'IP) : verrou progressif dès le 5ᵉ échec.
    // La clé est le **compte résolu** quand il existe (un même compte répond au pseudo, à
    // l'e-mail et au pseudo G&L : un seul budget d'échecs), l'identifiant saisi sinon (CDG-13).
    const account = await resolveLoginAccountByIdentifier(identifier);
    const throttleKey = account ? `user:${account.id}` : identifier;
    const throttled = loginThrottle.check('login', throttleKey);
    if (throttled.blocked) {
      await logSecurityEvent('auth.login', {
        req,
        actorUserType: account?.user_type,
        actorUserId: account?.id,
        result: 'failure',
        reason: 'throttled',
        payload: { retry_after_seconds: throttled.retryAfterSeconds },
      });
      return sendLoginThrottled(res, throttled);
    }

    // Un seul message d'échec avant la vérification du mot de passe : compte introuvable,
    // sans mot de passe ou mot de passe faux se répondent à l'identique, et chaque cas compte
    // comme un échec — sinon l'existence et l'état d'un compte se devinent sans jamais
    // déclencher le verrou (CDG-13). L'identifiant saisi n'est pas journalisé : un mot de
    // passe tapé dans ce champ serait lisible par `audit.read`.
    const failLogin = async (reason) => {
      loginThrottle.recordFailure('login', throttleKey);
      await logSecurityEvent('auth.login', {
        req,
        actorUserType: account?.user_type,
        actorUserId: account?.id,
        targetType: account?.user_type,
        targetId: account?.id,
        result: 'failure',
        reason,
      });
      logger.warn(
        {
          requestId: req.requestId,
          event: 'auth_login_failure',
          reason,
          userType: account?.user_type,
        },
        'Échec connexion',
      );
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    };
    if (!account) return failLogin('account_not_found');
    if (!account.password_hash) return failLogin('password_not_set');
    const ok = await bcrypt.compare(password, account.password_hash);
    if (!ok) return failLogin('password_invalid');

    // Compte désactivé : dit seulement une fois le mot de passe vérifié (pas d'énumération).
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
      logger.warn(
        { requestId: req.requestId, event: 'auth_login_failure', reason: 'account_inactive' },
        'Échec connexion (compte inactif)',
      );
      return res.status(401).json({ error: 'Compte inactif' });
    }

    if (String(account.password_hash || '').startsWith('$2a$')) {
      try {
        const upgraded = await bcrypt.hash(password, 10);
        await execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [
          upgraded,
          account.id,
        ]);
      } catch (rehashErr) {
        logger.warn(
          { requestId: req.requestId, err: rehashErr, userId: account.id },
          'Re-hash bcrypt $2a$ ignoré',
        );
      }
    }

    loginThrottle.clear('login', throttleKey);
    const userType = await resolveLoginUserType(account);
    // Profil effectif recalculé à la connexion ; un compte sans profil reçoit le défaut de
    // son type (prof de classe / visiteur), jamais n3boss (CDG-46).
    await recomputeUserRole(account.id);
    await execute('UPDATE users SET last_seen = ?, updated_at = NOW() WHERE id = ?', [
      nowDbTimestamp(),
      account.id,
    ]);
    let session = await buildSessionPayload(userType, account.id);
    if (!session && userType !== 'teacher') {
      session = await buildSessionPayload('teacher', account.id);
    }
    if (!session && userType !== 'student') {
      session = await buildSessionPayload('student', account.id);
    }
    if (!session) {
      return res.status(403).json({ error: 'Aucun profil attribué' });
    }
    const token = session ? await signAuthToken(session.tokenPayload) : null;
    await logSecurityEvent('auth.login', {
      req,
      actorUserType: session.tokenPayload.userType,
      actorUserId: account.id,
      targetType: session.tokenPayload.userType,
      targetId: account.id,
      payload: { via: 'identifier' },
    });
    try {
      const { recordAuthenticatedTouch } = require('../lib/userTracking');
      const productHeader = String(req.headers['x-foretmap-product'] || '')
        .trim()
        .toLowerCase();
      void recordAuthenticatedTouch({
        product: productHeader || 'foret',
        userType: session.tokenPayload.userType,
        userId: account.id,
        action: 'login',
      });
    } catch (_) {
      /* ignore */
    }
    res.json({
      ...toPublicUserRow(account),
      discoveryTourSeen: parseDiscoveryTourSeen(account.discovery_tour_seen_json),
      // Mot de passe provisoire (posé par un responsable ou le jeu G&L) : le client invite
      // à en choisir un nouveau (`POST /api/auth/me/password`).
      passwordMustReset: !!Number(account.password_must_reset || 0),
      authToken: token,
      auth: session ? exposeAuth(session.tokenPayload) : null,
    });
  }),
);

router.get('/google/start', async (req, res) => {
  const mode = normalizeOAuthMode(req.query?.mode);
  const googleEnabled = await getSettingValue('integration.google.enabled', true);
  const allowStudent = await getSettingValue('ui.auth.allow_google_student', true);
  const allowTeacher = await getSettingValue('ui.auth.allow_google_teacher', true);
  // Le plan des personnels accueille les deux types de compte — « Personnel » est un profil,
  // porté aussi bien par un compte `student` que par un compte `teacher` : il suffit que l'une
  // des deux portes Google soit ouverte ici, le type réel du compte étant revérifié au retour
  // de Google.
  const modeAllowed =
    mode === 'teacher'
      ? allowTeacher
      : mode === 'staff'
        ? allowTeacher || allowStudent
        : allowStudent;
  if (!googleEnabled || !modeAllowed) {
    return res.status(403).json({ error: 'Connexion Google désactivée par l’administrateur' });
  }
  const cfg = getGoogleOauthConfig(req);
  if (!googleOauthConfigured(cfg)) {
    return res.status(503).json({ error: 'OAuth Google non configuré' });
  }
  /**
   * Rebond par l'hôte du rappel, quand la connexion part d'un autre sous-domaine produit.
   *
   * Google ne rappelle que sur les `redirect_uri` enregistrées : en production il n'y en a
   * qu'une, donc le rappel arrive toujours sur le même hôte. Or les trois cookies de la
   * poignée de main ci-dessous sont posés **sans `Domain`** : ils sont liés à l'hôte qui les
   * pose. Partir de `proflyautey.*` les rendait donc invisibles au rappel arrivant sur l'hôte
   * de ForetMap — plus de `state` (« session expirée »), et plus d'origine de retour non plus,
   * si bien que l'utilisateur atterrissait sur ForetMap avec une erreur.
   *
   * On renvoie donc d'abord le navigateur sur `/api/auth/google/start` de l'hôte du rappel, en
   * lui passant l'origine de départ. Toute la poignée de main se joue alors sur un seul hôte,
   * et `Domain=` reste inutile — un cookie de session élargi à tout le domaine parent serait
   * lisible par chaque sous-produit, ce qu'on ne veut pas.
   *
   * Sans `GOOGLE_OAUTH_REDIRECT_URI`, l'URI est dérivée de la requête : les deux origines
   * coïncident, aucun rebond, comportement inchangé. Le second passage coïncide lui aussi,
   * donc pas de boucle.
   */
  const startOrigin = resolveOAuthPublicOrigin(req);
  const callbackOrigin = originOfUrl(cfg.redirectUri);
  // `return_origin` déjà présent = on **est** le second saut : ne jamais rebondir une seconde
  // fois. Garde-fou dur, indépendant de la normalisation des deux origines : une boucle de
  // redirection sur la page de connexion serait bien pire que l'absence de rebond.
  const alreadyBounced = Boolean(String(req.query?.return_origin || '').trim());
  if (!alreadyBounced && callbackOrigin && startOrigin && callbackOrigin !== startOrigin) {
    const bounce = new URL('/api/auth/google/start', callbackOrigin);
    bounce.searchParams.set('mode', mode);
    bounce.searchParams.set('return_origin', startOrigin);
    return res.redirect(bounce.toString());
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
  /**
   * Origine de retour : celle transmise par le rebond ci-dessus quand la connexion vient d'un
   * autre produit, sinon l'origine vue ici même. `return_origin` arrive par l'URL, donc
   * potentiellement d'un tiers : il n'est retenu que s'il désigne un produit du registre sur
   * le même domaine parent que cet hôte (`resolveProductReturnOrigin`), sans quoi on retombe
   * sur l'origine courante. Un flux qui transporte un jeton ne doit pas devenir une
   * redirection ouverte.
   */
  const returnOrigin = resolveProductReturnOrigin(req.query?.return_origin, {
    requestHost: req.get('host'),
    fallbackOrigin: startOrigin,
    productHostPrefixes: listProductHostPrefixes(),
  });
  if (returnOrigin) {
    res.cookie(OAUTH_ORIGIN_COOKIE, returnOrigin, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: OAUTH_STATE_TTL_MS,
      path: '/api/auth/google',
    });
  }
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
    return res.redirect(
      buildOAuthFrontendErrorRedirect(
        normalizeOptionalString(process.env.FRONTEND_ORIGIN) ||
          `${req.protocol}://${req.get('host')}`,
        'oauth_not_configured',
        normalizeOAuthMode(req.query?.mode),
      ),
    );
  }
  const baseCfg = getGoogleOauthConfig(req);
  const stateCookie = readCookie(req, OAUTH_STATE_COOKIE);
  const modeCookie = normalizeOAuthMode(readCookie(req, OAUTH_MODE_COOKIE));
  const mode = normalizeOAuthMode(modeCookie || req.query?.mode);
  // Renvoi vers le produit d'où l'utilisateur est parti, si et seulement si cette origine est
  // celle d'un produit du registre sur le même domaine parent que le rappel.
  const cfg = {
    ...baseCfg,
    frontendOrigin: resolveProductReturnOrigin(readCookie(req, OAUTH_ORIGIN_COOKIE), {
      requestHost: req.get('host'),
      fallbackOrigin: baseCfg.frontendOrigin,
      productHostPrefixes: listProductHostPrefixes(),
    }),
  };
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth/google' });
  res.clearCookie(OAUTH_MODE_COOKIE, { path: '/api/auth/google' });
  res.clearCookie(OAUTH_ORIGIN_COOKIE, { path: '/api/auth/google' });

  if (!googleOauthConfigured(cfg)) {
    return res.redirect(
      buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_not_configured', mode),
    );
  }
  if (normalizeOptionalString(req.query?.error)) {
    return res.redirect(
      buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_google_refused', mode),
    );
  }
  const state = normalizeOptionalString(req.query?.state);
  if (!state || !stateCookie || state !== stateCookie) {
    return res.redirect(
      buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_invalid_state', mode),
    );
  }
  const code = normalizeOptionalString(req.query?.code);
  if (!code) {
    return res.redirect(
      buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_missing_code', mode),
    );
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
      return res.redirect(
        buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_missing_id_token', mode),
      );
    }
    const payload = await verifyGoogleIdToken({ idToken, audience: cfg.clientId });
    if (!payload) {
      return res.redirect(
        buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_invalid_token', mode),
      );
    }
    const email = normalizeEmail(payload.email);
    const issuer = String(payload.iss || '');
    const emailVerified =
      payload.email_verified === true || String(payload.email_verified) === 'true';
    const audience = String(payload.aud || '');
    if (
      !email ||
      !emailVerified ||
      audience !== cfg.clientId ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(issuer)
    ) {
      return res.redirect(
        buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_claims_invalid', mode),
      );
    }
    if (!isGoogleEmailAllowed(email, payload.hd, cfg.allowedDomains, cfg.allowedEmails)) {
      return res.redirect(
        buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_email_not_allowed', mode),
      );
    }

    const googleSub = normalizeOptionalString(payload.sub);
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
    if (teacher) {
      // Le réglage « connexion Google enseignant » se relit ici, quel que soit le `mode` :
      // `/google/start?mode=student` ne le contournait pas moins (CDG-14).
      const allowTeacher = await getSettingValue('ui.auth.allow_google_teacher', true);
      if (!allowTeacher) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(
            cfg.frontendOrigin,
            'oauth_teacher_google_disabled',
            mode,
          ),
        );
      }
      if (googleSub && teacher.google_sub && teacher.google_sub !== googleSub) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_account_mismatch', mode),
        );
      }
      if (!teacher.is_active) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_teacher_inactive', mode),
        );
      }
      await recomputeUserRole(teacher.id);
      const now = nowDbTimestamp();
      await execute(
        "UPDATE users SET last_seen = ?, google_sub = COALESCE(google_sub, ?), updated_at = NOW() WHERE id = ? AND user_type = 'teacher'",
        [now, googleSub, teacher.id],
      );
      const session = await buildSessionPayload('teacher', teacher.id);
      if (!session) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_teacher_no_role', mode),
        );
      }
      if (mode === 'staff') {
        const staffAccess = await mayOpenStaffPlan(session.tokenPayload);
        if (!staffAccess.ok) {
          await logSecurityEvent('auth.login.staff_plan.oauth_google', {
            req,
            result: 'failure',
            reason: 'oauth_staff_no_access',
            actorUserType: 'teacher',
            actorUserId: teacher.id,
            payload: { role_slug: staffAccess.roleSlug || null },
          });
          return res.redirect(
            buildOAuthFrontendErrorRedirect(
              cfg.frontendOrigin,
              'oauth_staff_no_access',
              mode,
              session.tokenPayload.roleDisplayName || staffAccess.roleSlug,
            ),
          );
        }
      }
      const token = await signAuthToken(session.tokenPayload);
      await logSecurityEvent('auth.login.teacher.oauth_google', {
        req,
        actorUserType: 'teacher',
        actorUserId: teacher.id,
        targetType: 'teacher',
        targetId: teacher.id,
      });
      try {
        const { recordAuthenticatedTouch } = require('../lib/userTracking');
        void recordAuthenticatedTouch({
          product: 'foret',
          userType: 'teacher',
          userId: teacher.id,
          action: 'login',
        });
      } catch (_) {
        /* ignore */
      }
      return res.redirect(
        buildOAuthFrontendRedirect(cfg.frontendOrigin, {
          // En mode `staff`, le produit de retour est le plan des personnels : il attend un
          // jeton, pas une session de console. Le type le dit, et le front n'a pas à deviner
          // le type de compte qui se cache derrière un personnel autorisé.
          type: mode === 'staff' ? 'staff' : 'teacher',
          token,
          auth: exposeAuth(session.tokenPayload),
        }),
      );
    }

    /**
     * Plan des personnels : un compte **non enseignant** autorisé (profil « Personnel »,
     * ou tout profil coché dans `ui.staff_plan.allowed_role_slugs`) entre ici.
     *
     * Régression corrigée : la porte de proflyautey lançait `mode=teacher`, et tout compte de
     * type `student` — ce qu'est un « Personnel » par construction, ainsi que tout compte
     * promu « Prof de classe » depuis un compte élève (l'attribution d'un profil ne change
     * pas `users.user_type`) — repartait avec `oauth_teacher_account_not_found`, affiché
     * « La connexion n'a pas abouti ». Seuls les comptes enseignants (admin, n3boss) entraient.
     *
     * Aucune création de compte ici, comme en mode enseignant : un plan de personnels ne
     * s'ouvre pas à qui n'a pas déjà de compte — c'est le rôle du code partagé.
     */
    if (mode === 'staff') {
      const staffUser =
        bySub && bySub.user_type === 'student'
          ? bySub
          : await queryOne(
              "SELECT id, email, is_active, google_sub FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?) LIMIT 1",
              [email],
            );
      if (!staffUser) {
        await logSecurityEvent('auth.login.staff_plan.oauth_google', {
          req,
          result: 'failure',
          reason: 'oauth_staff_account_not_found',
          payload: { email },
        });
        return res.redirect(
          buildOAuthFrontendErrorRedirect(
            cfg.frontendOrigin,
            'oauth_staff_account_not_found',
            mode,
          ),
        );
      }
      // Le jeton délivré est un jeton ForetMap ordinaire : le réglage qui ferme la connexion
      // Google des élèves vaut donc ici aussi (même raison que CDG-14 côté enseignant).
      const allowStudentGoogle = await getSettingValue('ui.auth.allow_google_student', true);
      if (!allowStudentGoogle) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(
            cfg.frontendOrigin,
            'oauth_student_google_disabled',
            mode,
          ),
        );
      }
      if (googleSub && staffUser.google_sub && staffUser.google_sub !== googleSub) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_account_mismatch', mode),
        );
      }
      if (!Number(staffUser.is_active)) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_account_inactive', mode),
        );
      }
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
          req,
          result: 'failure',
          reason: 'oauth_staff_no_access',
          actorUserType: 'student',
          actorUserId: staffUser.id,
          payload: { role_slug: staffAccess.roleSlug || null },
        });
        return res.redirect(
          buildOAuthFrontendErrorRedirect(
            cfg.frontendOrigin,
            'oauth_staff_no_access',
            mode,
            session?.tokenPayload?.roleDisplayName || staffAccess.roleSlug,
          ),
        );
      }
      const token = await signAuthToken(session.tokenPayload);
      await logSecurityEvent('auth.login.staff_plan.oauth_google', {
        req,
        actorUserType: 'student',
        actorUserId: staffUser.id,
        targetType: 'student',
        targetId: staffUser.id,
      });
      try {
        const { recordAuthenticatedTouch } = require('../lib/userTracking');
        void recordAuthenticatedTouch({
          product: 'foret',
          userType: 'student',
          userId: staffUser.id,
          action: 'login',
        });
      } catch (_) {
        /* ignore */
      }
      return res.redirect(
        buildOAuthFrontendRedirect(cfg.frontendOrigin, {
          type: 'staff',
          token,
          auth: exposeAuth(session.tokenPayload),
        }),
      );
    }

    // Mode enseignant : ne jamais créer / connecter un élève par repli — message d'échec explicite.
    if (mode === 'teacher') {
      const studentSameEmail = await queryOne(
        "SELECT id FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?) LIMIT 1",
        [email],
      );
      const errorCode = studentSameEmail
        ? 'oauth_teacher_email_is_student'
        : 'oauth_teacher_account_not_found';
      await logSecurityEvent('auth.login.teacher.oauth_google', {
        req,
        result: 'failure',
        reason: errorCode,
        payload: { email },
      });
      return res.redirect(buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, errorCode, mode));
    }

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
      return res.redirect(
        buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_account_mismatch', mode),
      );
    }
    let accountJustCreated = false;
    if (!student) {
      // Subordonné à `ui.auth.allow_register` depuis le lot I (constat S11) : fermer les
      // inscriptions ferme aussi ce chemin-ci.
      if (!(await isGoogleAutoRegistrationAllowed())) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_account_not_found', mode),
        );
      }
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
      student = await queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [id]);
      accountJustCreated = true;
    } else {
      // Même règle que la connexion par mot de passe : un compte désactivé n'obtient pas de
      // jeton (il tombait sinon en 401 à la première requête, CDG-47).
      if (!Number(student.is_active)) {
        return res.redirect(
          buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_account_inactive', mode),
        );
      }
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
      req,
      actorUserType: 'student',
      actorUserId: student.id,
      targetType: 'student',
      targetId: student.id,
      payload: accountJustCreated ? { account_created: true } : undefined,
    });
    try {
      const { recordAuthenticatedTouch } = require('../lib/userTracking');
      void recordAuthenticatedTouch({
        product: 'foret',
        userType: 'student',
        userId: student.id,
        action: 'login',
      });
    } catch (_) {
      /* ignore */
    }
    return res.redirect(
      buildOAuthFrontendRedirect(cfg.frontendOrigin, {
        type: 'student',
        accountCreated: accountJustCreated,
        student: {
          ...toPublicUserRow(student),
          discoveryTourSeen: parseDiscoveryTourSeen(student?.discovery_tour_seen_json),
          authToken: token,
          auth: session ? exposeAuth(session.tokenPayload) : null,
        },
      }),
    );
  } catch (e) {
    logRouteError(e, req);
    return res.redirect(
      buildOAuthFrontendErrorRedirect(cfg.frontendOrigin, 'oauth_server_error', mode),
    );
  }
});

/**
 * Changement de mot de passe authentifié (CDG-42) : tout compte connecté, élève ou
 * enseignant, hors prise de contrôle. Un compte sans mot de passe (Google) s'en dote sans
 * `currentPassword`. Les autres sessions sont révoquées (`token_epoch`) ; la réponse porte
 * un jeton neuf pour que la session courante survive.
 */
router.post(
  '/me/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.auth?.impersonating) {
      return res
        .status(403)
        .json({ error: 'Pas de changement de mot de passe en prise de contrôle' });
    }
    const nextPassword = String(req.body?.newPassword ?? '');
    if (!nextPassword.trim()) return res.status(400).json({ error: 'Nouveau mot de passe requis' });
    const account = await queryOne(
      'SELECT id, user_type, password_hash, is_active FROM users WHERE id = ? LIMIT 1',
      [String(req.auth.userId)],
    );
    if (!account) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const reauth = await verifyCurrentPassword(account, req.body);
    if (!reauth.ok) return res.status(reauth.status).json({ error: reauth.error });
    const minPasswordLen = await getPasswordMinLengthFor(account.user_type);
    if (nextPassword.length < minPasswordLen) {
      return res
        .status(400)
        .json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    }
    const hash = await bcrypt.hash(nextPassword, 10);
    await execute(
      'UPDATE users SET password_hash = ?, password_must_reset = 0, updated_at = NOW() WHERE id = ?',
      [hash, account.id],
    );
    await bumpUserTokenEpoch(account.id);
    await logSecurityEvent('auth.password_change', {
      req,
      actorUserType: account.user_type,
      actorUserId: account.id,
      targetType: account.user_type,
      targetId: account.id,
      payload: { had_password: !!account.password_hash },
    });
    const session = await buildSessionPayload(req.auth.userType, account.id);
    if (!session) return res.status(403).json({ error: 'Aucun profil attribué' });
    res.json({
      ok: true,
      authToken: await signAuthToken(session.tokenPayload),
      auth: exposeAuth(session.tokenPayload),
    });
  }),
);

router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? req.body?.mail);
    if (!email || !EMAIL_RE.test(email)) {
      return res.json({
        ok: true,
        message: 'Si un compte existe, un email de réinitialisation a été envoyé.',
      });
    }
    // Un compte sans mot de passe (Google) peut s'en donner un par ce chemin (CDG-42) ; un
    // compte désactivé ne reçoit rien, comme côté enseignant.
    const student = await queryOne(
      "SELECT id, first_name, last_name, email, is_active FROM users WHERE user_type = 'student' AND email = ? LIMIT 1",
      [email],
    );
    if (student && Number(student.is_active) !== 0 && forgotPasswordAllowed(email)) {
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
    res.json({
      ok: true,
      message: 'Si un compte existe, un email de réinitialisation a été envoyé.',
    });
  }),
);

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const token = normalizeOptionalString(req.body?.token);
    const password = req.body?.password;
    if (!token || !password) return res.status(400).json({ error: 'Champs requis' });
    const minPasswordLen = await getPasswordMinLength();
    if (String(password).length < minPasswordLen) {
      return res
        .status(400)
        .json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    }
    const studentId = await consumePasswordResetToken('student', token);
    if (!studentId) return res.status(400).json({ error: 'Token invalide ou expiré' });
    const hash = await bcrypt.hash(password, 10);
    await execute(
      "UPDATE users SET password_hash = ?, password_must_reset = 0, updated_at = NOW() WHERE id = ? AND user_type = 'student'",
      [hash, studentId],
    );
    await bumpUserTokenEpoch(studentId);
    await logSecurityEvent('auth.password_reset.confirm.student', {
      req,
      actorUserType: 'student',
      actorUserId: studentId,
      targetType: 'student',
      targetId: studentId,
    });
    res.json({ ok: true });
  }),
);

router.post('/teacher/login', async (req, res) => {
  return res.status(410).json({ error: 'Endpoint supprimé. Utilisez /api/auth/login.' });
});

router.post(
  '/teacher/forgot-password',
  asyncHandler(async (req, res) => {
    await ensureTeacherSeedFromEnv();
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_RE.test(email)) {
      return res.json({
        ok: true,
        message: 'Si un compte existe, un email de réinitialisation a été envoyé.',
      });
    }
    const teacher = await queryOne(
      "SELECT id, email, is_active FROM users WHERE user_type = 'teacher' AND email = ? LIMIT 1",
      [email],
    );
    if (teacher && teacher.is_active && forgotPasswordAllowed(email)) {
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
    res.json({
      ok: true,
      message: 'Si un compte existe, un email de réinitialisation a été envoyé.',
    });
  }),
);

router.post(
  '/teacher/reset-password',
  asyncHandler(async (req, res) => {
    const token = normalizeOptionalString(req.body?.token);
    const password = req.body?.password;
    if (!token || !password) return res.status(400).json({ error: 'Champs requis' });
    const minPasswordLen = await getPasswordMinLengthFor('teacher');
    if (String(password).length < minPasswordLen) {
      return res
        .status(400)
        .json({ error: `Mot de passe trop court (min ${minPasswordLen} caractères)` });
    }
    const teacherId = await consumePasswordResetToken('teacher', token);
    if (!teacherId) return res.status(400).json({ error: 'Token invalide ou expiré' });
    const hash = await bcrypt.hash(password, 10);
    await execute(
      "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ? AND user_type = 'teacher'",
      [hash, teacherId],
    );
    await bumpUserTokenEpoch(teacherId);
    await logSecurityEvent('auth.password_reset.confirm.teacher', {
      req,
      actorUserType: 'teacher',
      actorUserId: teacherId,
      targetType: 'teacher',
      targetId: teacherId,
    });
    res.json({ ok: true });
  }),
);

// L'élévation par PIN a été supprimée : un utilisateur connecté possède directement toutes les
// permissions de son rôle. Ces endpoints sont conservés en 410 Gone pour signaler explicitement
// leur disparition aux clients/JWT obsolètes (cf. /teacher/login).
router.post('/elevate', (req, res) => {
  return res
    .status(410)
    .json({ error: 'Élévation PIN supprimée. Les droits du rôle sont accordés à la connexion.' });
});

router.post('/teacher', (req, res) => {
  return res
    .status(410)
    .json({ error: 'Élévation PIN supprimée. Les droits du rôle sont accordés à la connexion.' });
});

router.post(
  '/admin/impersonate',
  requirePermission('admin.impersonate'),
  asyncHandler(async (req, res) => {
    const targetUserType = normalizeOptionalString(req.body?.userType)?.toLowerCase();
    const rawId = req.body?.userId;
    const targetUserId = rawId == null ? '' : String(rawId).trim();
    if (!['student', 'teacher'].includes(targetUserType)) {
      return res.status(400).json({ error: 'Type utilisateur invalide (student ou teacher)' });
    }
    if (!targetUserId) {
      return res.status(400).json({ error: 'Identifiant utilisateur requis' });
    }
    if (
      String(req.auth.userType) === targetUserType &&
      String(req.auth.userId) === String(targetUserId)
    ) {
      return res
        .status(400)
        .json({ error: 'Impossible de prendre le contrôle de votre propre compte' });
    }
    const account = await queryOne('SELECT * FROM users WHERE id = ? AND user_type = ? LIMIT 1', [
      targetUserId,
      targetUserType,
    ]);
    if (!account) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!Number(account.is_active)) {
      return res.status(409).json({ error: 'Ce compte est désactivé : réactivez-le avant' });
    }
    // On ne prend la main que sur un compte de rang strictement inférieur au sien : la
    // permission `admin.impersonate` ne vaut pas les pouvoirs d'un administrateur (CDG-08).
    const targetRole = await getPrimaryRoleForUser(targetUserType, targetUserId);
    if (Number(targetRole?.rank || 0) >= Number(req.auth.roleRank || 0)) {
      return res.status(403).json({
        error:
          'Prise de contrôle refusée : ce compte a un profil de rang égal ou supérieur au vôtre',
      });
    }

    const tokenIn = parseBearerToken(req);
    if (!tokenIn) return res.status(401).json({ error: 'Token requis' });
    let claims;
    try {
      claims = verifyJwtToken(tokenIn, JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    if (claims.impersonating) {
      return res.status(400).json({ error: 'Quittez d’abord la prise de contrôle en cours' });
    }
    const session = await buildSessionPayload(targetUserType, targetUserId);
    if (!session) return res.status(403).json({ error: 'Aucun profil attribué pour ce compte' });

    const tokenPayload = {
      ...session.tokenPayload,
      impersonating: true,
      actorUserType: req.auth.userType,
      actorUserId: req.auth.userId,
      actorTokenEpoch: await getUserTokenEpoch(req.auth.userId),
    };
    const token = await signAuthToken(tokenPayload);
    let hydrated;
    try {
      hydrated = await hydrateAuthFromTokenClaims(verifyJwtToken(token, JWT_SECRET));
    } catch (err) {
      logRouteError(err, req);
      return res.status(500).json({ error: 'Erreur lors de l’émission du jeton' });
    }
    if (!hydrated) return res.status(500).json({ error: 'Session impersonation invalide' });

    await logAudit(
      'auth_impersonate_start',
      targetUserType,
      targetUserId,
      `Prise de contrôle ${targetUserType}#${targetUserId}`,
      {
        req,
        actorUserType: req.auth.userType,
        actorUserId: req.auth.userId,
        payload: { target_user_type: targetUserType, target_user_id: targetUserId },
      },
    );

    const { password_hash: _passwordHash, ...profile } = account;
    void _passwordHash;
    res.json({
      authToken: token,
      auth: exposeAuth(hydrated),
      profile,
    });
  }),
);

router.post(
  '/admin/impersonate/stop',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth?.impersonating || !req.auth?.impersonatedBy) {
      return res.status(400).json({ error: 'Aucune prise de contrôle en cours' });
    }
    const tokenIn = parseBearerToken(req);
    if (!tokenIn) return res.status(401).json({ error: 'Token requis' });
    try {
      verifyJwtToken(tokenIn, JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    const actor = req.auth.impersonatedBy;
    const actorAuthz = await buildAuthzPayload(actor.userType, actor.userId);
    if (!actorAuthz || !actorAuthz.permissions?.includes('admin.impersonate')) {
      return res.status(403).json({ error: 'Permission de reprise refusée' });
    }
    const session = await buildSessionPayload(actor.userType, actor.userId);
    if (!session) return res.status(403).json({ error: 'Session administrateur introuvable' });
    const token = await signAuthToken(session.tokenPayload);
    let hydrated;
    try {
      hydrated = await hydrateAuthFromTokenClaims(verifyJwtToken(token, JWT_SECRET));
    } catch (err) {
      logRouteError(err, req);
      return res.status(500).json({ error: 'Erreur lors de l’émission du jeton' });
    }

    await logAudit('auth_impersonate_stop', 'auth', actor.userId, 'Fin prise de contrôle compte', {
      req,
      actorUserType: actor.userType,
      actorUserId: actor.userId,
      payload: { target_user_type: req.auth.userType, target_user_id: req.auth.userId },
    });

    res.json({ authToken: token, auth: exposeAuth(hydrated) });
  }),
);

router.__setGoogleOAuthHooks = function setGoogleOAuthHooks({ exchangeCode, verifyIdToken } = {}) {
  googleOAuthHooks.exchangeCode = typeof exchangeCode === 'function' ? exchangeCode : null;
  googleOAuthHooks.verifyIdToken = typeof verifyIdToken === 'function' ? verifyIdToken : null;
};

module.exports = router;
