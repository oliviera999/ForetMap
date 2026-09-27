'use strict';

/**
 * Caractérisation de `GET /api/auth/google/callback` (piste B, étape B6 de
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`, ligne 11 du § 3.3).
 *
 * Ces tests figent le comportement **actuel** du rappel Google avant son extraction vers
 * `lib/auth/googleAuthService.js` : redirection exacte (origine, code d'erreur, mode, profil
 * refusé), charge `#oauth=` décodée, cookies de la poignée de main effacés, écritures en
 * base (`users.google_sub`, `last_seen`, création de compte) et lignes `security_events`.
 * Ils doivent passer **avant et après** l'extraction, sans modification.
 *
 * Google est simulé par les crochets `__setGoogleOAuthHooks` du routeur (aucun appel réseau).
 * Tous les comptes sont fictifs.
 */

require('./helpers/setup');
const crypto = require('crypto');
const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { app } = require('../server');
const authRouter = require('../routes/auth');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { setSetting, getSettingValue } = require('../lib/settings');
const { JWT_SECRET } = require('../middleware/requireTeacher');
const { verifyJwtToken } = require('../lib/auth/jwtPipeline');
const { toPublicUserRow } = require('../lib/publicUser');
const { parseDiscoveryTourSeen } = require('../lib/discoveryTourSeen');
const { exposeAuth } = require('../lib/authRouteHelpers');
const { deleteStudentById } = require('../lib/studentDeletion');

const ORIGIN = 'http://localhost:3000';
const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
const ENV_KEYS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'GOOGLE_OAUTH_ALLOWED_DOMAINS',
  'GOOGLE_OAUTH_ALLOWED_EMAILS',
  'FRONTEND_ORIGIN',
];
const SETTING_KEYS = [
  'integration.google.enabled',
  'ui.auth.allow_google_teacher',
  'ui.auth.allow_google_student',
  'ui.auth.allow_register',
  'ui.auth.allow_google_auto_register',
];
const savedEnv = {};
const savedSettings = {};

/** Effacement des trois cookies de la poignée de main, dans cet ordre. */
const CLEARED_COOKIES = [
  'foretmap_oauth_state=; Path=/api/auth/google; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  'foretmap_oauth_mode=; Path=/api/auth/google; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  'foretmap_oauth_origin=; Path=/api/auth/google; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
];

before(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = `${ORIGIN}/api/auth/google/callback`;
  process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS = 'pedagolyautey.org,lyceelyautey.org';
  process.env.GOOGLE_OAUTH_ALLOWED_EMAILS = 'derogation.carac@example.com';
  process.env.FRONTEND_ORIGIN = ORIGIN;
  await initSchema();
  for (const key of SETTING_KEYS) savedSettings[key] = await getSettingValue(key, undefined);
  await setDefaults();
});

after(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const key of SETTING_KEYS) {
    if (savedSettings[key] !== undefined) await setSetting(key, savedSettings[key], {});
  }
  authRouter.__setGoogleOAuthHooks();
});

afterEach(async () => {
  authRouter.__setGoogleOAuthHooks();
  await setDefaults();
});

async function setDefaults() {
  await setSetting('integration.google.enabled', true, {});
  await setSetting('ui.auth.allow_google_teacher', true, {});
  await setSetting('ui.auth.allow_google_student', true, {});
  await setSetting('ui.auth.allow_register', true, {});
  await setSetting('ui.auth.allow_google_auto_register', false, {});
}

function uniq(prefix) {
  return `${prefix}${crypto.randomUUID().slice(0, 8)}`;
}

/** Revendications d'un jeton Google valide, surchargeables. */
function claims(overrides = {}) {
  return {
    aud: CLIENT_ID,
    iss: 'https://accounts.google.com',
    email_verified: true,
    ...overrides,
  };
}

/** Simule Google : échange du code, puis vérification du jeton d'identité. */
function mockGoogle({ tokenData = { id_token: 'id-token-carac' }, payload, exchangeError } = {}) {
  authRouter.__setGoogleOAuthHooks({
    exchangeCode: async () => {
      if (exchangeError) throw exchangeError;
      return tokenData;
    },
    verifyIdToken: async () => payload,
  });
}

/**
 * Appel du rappel. `mode` et `state` passent par les cookies, comme après `/google/start`.
 * L'agent utilisateur est propre à chaque appel : il retrouve les lignes `security_events`.
 */
async function callback({ mode = 'student', state, cookieState, query, originCookie } = {}) {
  const st = state ?? uniq('st-');
  const ua = uniq('carac-ua-');
  const cookies = [];
  if (cookieState !== null) cookies.push(`foretmap_oauth_state=${cookieState ?? st}`);
  if (mode) cookies.push(`foretmap_oauth_mode=${mode}`);
  if (originCookie) cookies.push(`foretmap_oauth_origin=${encodeURIComponent(originCookie)}`);
  const qs = query ?? `state=${encodeURIComponent(st)}&code=code-carac`;
  const res = await request(app)
    .get(`/api/auth/google/callback?${qs}`)
    .set('User-Agent', ua)
    .set('Cookie', cookies)
    .expect(302);
  const location = String(res.headers.location || '');
  const hash = new URLSearchParams(location.split('#')[1] || '');
  const raw = hash.get('oauth');
  return {
    res,
    ua,
    location,
    cookies: [].concat(res.headers['set-cookie'] || []),
    payload: raw ? JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) : null,
  };
}

function errorLocation(code, mode = 'student', role) {
  const r = role ? `&role=${encodeURIComponent(role)}` : '';
  return `${ORIGIN}/#oauth_error=${code}&mode=${mode}${r}`;
}

/** Lignes du journal de sécurité écrites par un appel (retrouvées par l'agent utilisateur). */
async function securityEventsFor(ua) {
  const rows = await queryAll(
    `SELECT action, actor_user_type, actor_user_id, target_type, target_id, result, reason, payload_json
       FROM security_events WHERE user_agent = ? ORDER BY id ASC`,
    [ua],
  );
  return rows.map((r) => ({
    ...r,
    payload_json: typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json,
  }));
}

async function createUser({
  userType = 'student',
  email,
  googleSub = null,
  isActive = 1,
  roleSlug = null,
  firstName = 'Carac',
  lastName = 'Compte',
}) {
  const id = crypto.randomUUID();
  const role = roleSlug
    ? await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug])
    : null;
  await execute(
    `INSERT INTO users
      (id, user_type, assigned_role_id, email, pseudo, first_name, last_name, display_name, password_hash,
       auth_provider, is_active, google_sub, last_seen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, NULL, NOW(), NOW())`,
    [
      id,
      userType,
      role?.id ?? null,
      email,
      uniq('carac_'),
      firstName,
      lastName,
      `${firstName} ${lastName}`,
      await bcrypt.hash('motdepasse-carac', 4),
      isActive,
      googleSub,
    ],
  );
  if (role?.id) {
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      [userType, id, role.id],
    );
  }
  return id;
}

/** `auth` attendu dans la charge : l'exposition publique des revendications du jeton émis. */
function expectedAuthFromToken(token) {
  const decoded = verifyJwtToken(token, JWT_SECRET);
  return JSON.parse(JSON.stringify(exposeAuth(decoded)));
}

describe('GET /api/auth/google/callback — caractérisation', () => {
  it('connexion Google désactivée : redirection immédiate, mode lu dans la requête, cookies intacts', async () => {
    await setSetting('integration.google.enabled', false, {});
    const out = await callback({ query: 'state=x&code=y&mode=teacher', mode: null });
    assert.equal(out.location, errorLocation('oauth_not_configured', 'teacher'));
    assert.deepEqual(out.cookies, []);
  });

  it('OAuth non configuré : oauth_not_configured, cookies effacés', async () => {
    const saved = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    try {
      const out = await callback({ mode: 'teacher' });
      assert.equal(out.location, errorLocation('oauth_not_configured', 'teacher'));
      assert.deepEqual(out.cookies, CLEARED_COOKIES);
    } finally {
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = saved;
    }
  });

  it('refus côté Google (`error=`) : oauth_google_refused', async () => {
    const out = await callback({ query: 'error=access_denied&state=s&code=c' });
    assert.equal(out.location, errorLocation('oauth_google_refused'));
    assert.deepEqual(out.cookies, CLEARED_COOKIES);
  });

  it('état invalide, absent ou sans cookie : oauth_invalid_state', async () => {
    const mismatch = await callback({ state: 'bon', cookieState: 'autre', mode: 'staff' });
    assert.equal(mismatch.location, errorLocation('oauth_invalid_state', 'staff'));
    assert.deepEqual(mismatch.cookies, CLEARED_COOKIES);
    const noCookie = await callback({ cookieState: null });
    assert.equal(noCookie.location, errorLocation('oauth_invalid_state'));
    const noState = await callback({ query: 'code=c', cookieState: 'st' });
    assert.equal(noState.location, errorLocation('oauth_invalid_state'));
  });

  it('code absent : oauth_missing_code', async () => {
    const out = await callback({ state: 'st1', query: 'state=st1' });
    assert.equal(out.location, errorLocation('oauth_missing_code'));
  });

  it('échange sans id_token : oauth_missing_id_token ; jeton non vérifié : oauth_invalid_token', async () => {
    mockGoogle({ tokenData: {}, payload: claims({ email: 'x@lyceelyautey.org' }) });
    assert.equal((await callback()).location, errorLocation('oauth_missing_id_token'));
    mockGoogle({ payload: null });
    assert.equal((await callback()).location, errorLocation('oauth_invalid_token'));
  });

  it('e-mail non vérifié, audience ou émetteur inattendus, e-mail absent : oauth_claims_invalid', async () => {
    const email = `${uniq('nonverif.')}@lyceelyautey.org`;
    for (const payload of [
      claims({ email, email_verified: false }),
      claims({ email, email_verified: 'false' }),
      claims({ email, aud: 'autre-client' }),
      claims({ email, iss: 'https://evil.example.com' }),
      claims({ email: '' }),
    ]) {
      mockGoogle({ payload });
      const out = await callback();
      assert.equal(out.location, errorLocation('oauth_claims_invalid'));
    }
    // `email_verified` sous forme de chaîne « true » est accepté (et `iss` court aussi).
    await setSetting('ui.auth.allow_register', false, {});
    mockGoogle({ payload: claims({ email, email_verified: 'true', iss: 'accounts.google.com' }) });
    assert.equal((await callback()).location, errorLocation('oauth_account_not_found'));
  });

  it('domaine refusé : oauth_email_not_allowed ; dérogation par e-mail acceptée', async () => {
    mockGoogle({ payload: claims({ email: 'intrus.carac@example.com', hd: 'example.com' }) });
    const out = await callback({ mode: 'teacher' });
    assert.equal(out.location, errorLocation('oauth_email_not_allowed', 'teacher'));
    assert.deepEqual(await securityEventsFor(out.ua), []);

    await setSetting('ui.auth.allow_register', false, {});
    mockGoogle({ payload: claims({ email: 'Derogation.Carac@Example.com' }) });
    const derog = await callback();
    assert.equal(derog.location, errorLocation('oauth_account_not_found'));
  });

  it('erreur à l’échange du code : oauth_server_error', async () => {
    mockGoogle({ exchangeError: new Error('panne simulée') });
    const out = await callback({ mode: 'staff' });
    assert.equal(out.location, errorLocation('oauth_server_error', 'staff'));
    assert.deepEqual(out.cookies, CLEARED_COOKIES);
  });

  it('origine de retour : une origine tierce en cookie est ignorée (repli sur FRONTEND_ORIGIN)', async () => {
    const out = await callback({
      state: 'st-o',
      cookieState: 'autre',
      originCookie: 'https://evil.example.com',
    });
    assert.equal(out.location, errorLocation('oauth_invalid_state'));
  });

  describe('enseignant', () => {
    it('parcours nominal : jeton, google_sub lié, last_seen posé, événement de sécurité', async () => {
      const email = `${uniq('prof.carac.')}@pedagolyautey.org`;
      const id = await createUser({ userType: 'teacher', email, roleSlug: 'prof' });
      mockGoogle({ payload: claims({ email: email.toUpperCase(), sub: `sub-${id}` }) });
      const out = await callback({ mode: 'teacher' });
      assert.ok(out.location.startsWith(`${ORIGIN}/#oauth=`), out.location);
      assert.deepEqual(out.cookies, CLEARED_COOKIES);
      assert.deepEqual(Object.keys(out.payload), ['type', 'token', 'auth']);
      assert.equal(out.payload.type, 'teacher');
      assert.deepEqual(out.payload.auth, expectedAuthFromToken(out.payload.token));
      assert.equal(out.payload.auth.userId, id);
      assert.equal(out.payload.auth.userType, 'teacher');
      assert.equal(out.payload.auth.roleSlug, 'prof');
      const row = await queryOne('SELECT google_sub, last_seen FROM users WHERE id = ?', [id]);
      assert.equal(row.google_sub, `sub-${id}`);
      assert.ok(row.last_seen);
      assert.deepEqual(await securityEventsFor(out.ua), [
        {
          action: 'auth.login.teacher.oauth_google',
          actor_user_type: 'teacher',
          actor_user_id: id,
          target_type: 'teacher',
          target_id: id,
          result: 'success',
          reason: null,
          payload_json: null,
        },
      ]);
    });

    it('compte lié : l’identité Google fait foi avant l’e-mail (adresse changée côté Google)', async () => {
      const email = `${uniq('prof.lie.')}@pedagolyautey.org`;
      const sub = uniq('sub-prof-');
      const id = await createUser({ userType: 'teacher', email, googleSub: sub, roleSlug: 'prof' });
      mockGoogle({ payload: claims({ email: `${uniq('nouvelle.')}@pedagolyautey.org`, sub }) });
      const out = await callback({ mode: 'student' });
      assert.equal(out.payload?.type, 'teacher');
      assert.equal(out.payload.auth.userId, id);
    });

    it('autre identité Google sur la même adresse : oauth_account_mismatch', async () => {
      const email = `${uniq('prof.mm.')}@pedagolyautey.org`;
      await createUser({ userType: 'teacher', email, googleSub: uniq('sub-a-'), roleSlug: 'prof' });
      mockGoogle({ payload: claims({ email, sub: uniq('sub-b-') }) });
      const out = await callback({ mode: 'teacher' });
      assert.equal(out.location, errorLocation('oauth_account_mismatch', 'teacher'));
    });

    it('compte désactivé : oauth_teacher_inactive, rien n’est lié', async () => {
      const email = `${uniq('prof.off.')}@pedagolyautey.org`;
      const id = await createUser({ userType: 'teacher', email, isActive: 0, roleSlug: 'prof' });
      mockGoogle({ payload: claims({ email, sub: uniq('sub-') }) });
      const out = await callback({ mode: 'teacher' });
      assert.equal(out.location, errorLocation('oauth_teacher_inactive', 'teacher'));
      const row = await queryOne('SELECT google_sub, last_seen FROM users WHERE id = ?', [id]);
      assert.equal(row.google_sub, null);
      assert.equal(row.last_seen, null);
    });

    it('connexion Google enseignant fermée : oauth_teacher_google_disabled', async () => {
      const email = `${uniq('prof.ferme.')}@pedagolyautey.org`;
      await createUser({ userType: 'teacher', email, roleSlug: 'prof' });
      await setSetting('ui.auth.allow_google_teacher', false, {});
      mockGoogle({ payload: claims({ email }) });
      const out = await callback({ mode: 'staff' });
      assert.equal(out.location, errorLocation('oauth_teacher_google_disabled', 'staff'));
    });

    it('mode enseignant, compte absent ou élève : échec journalisé, aucune création', async () => {
      await setSetting('ui.auth.allow_google_auto_register', true, {});
      const missing = `${uniq('prof.absent.')}@pedagolyautey.org`;
      mockGoogle({ payload: claims({ email: missing }) });
      const out = await callback({ mode: 'teacher' });
      assert.equal(out.location, errorLocation('oauth_teacher_account_not_found', 'teacher'));
      assert.deepEqual(await securityEventsFor(out.ua), [
        {
          action: 'auth.login.teacher.oauth_google',
          actor_user_type: null,
          actor_user_id: null,
          target_type: null,
          target_id: null,
          result: 'failure',
          reason: 'oauth_teacher_account_not_found',
          payload_json: { email: missing },
        },
      ]);
      const none = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [missing]);
      assert.equal(none, undefined);

      const studentEmail = `${uniq('eleve.prof.')}@lyceelyautey.org`;
      await createUser({ userType: 'student', email: studentEmail });
      mockGoogle({ payload: claims({ email: studentEmail }) });
      const asStudent = await callback({ mode: 'teacher' });
      assert.equal(asStudent.location, errorLocation('oauth_teacher_email_is_student', 'teacher'));
      assert.equal(
        (await securityEventsFor(asStudent.ua))[0].reason,
        'oauth_teacher_email_is_student',
      );
    });

    it('mode staff, enseignant sans accès au plan : refus nommant le profil, journalisé', async () => {
      const email = `${uniq('prof.staff.')}@pedagolyautey.org`;
      const id = await createUser({ userType: 'teacher', email, roleSlug: 'eleve_novice' });
      mockGoogle({ payload: claims({ email }) });
      const out = await callback({ mode: 'staff' });
      const hash = new URLSearchParams(out.location.split('#')[1]);
      assert.equal(hash.get('oauth_error'), 'oauth_staff_no_access');
      assert.equal(hash.get('mode'), 'staff');
      assert.ok(hash.get('role'));
      const events = await securityEventsFor(out.ua);
      assert.equal(events.length, 1);
      assert.equal(events[0].action, 'auth.login.staff_plan.oauth_google');
      assert.equal(events[0].result, 'failure');
      assert.equal(events[0].reason, 'oauth_staff_no_access');
      assert.equal(events[0].actor_user_id, id);
      assert.deepEqual(Object.keys(events[0].payload_json), ['role_slug']);
    });
  });

  describe('plan des personnels (compte non enseignant)', () => {
    it('parcours nominal : type staff, google_sub lié, événement de succès', async () => {
      const email = `${uniq('perso.')}@pedagolyautey.org`;
      const id = await createUser({ userType: 'student', email, roleSlug: 'personnel' });
      mockGoogle({ payload: claims({ email, sub: `sub-${id}` }) });
      const out = await callback({ mode: 'staff' });
      assert.deepEqual(Object.keys(out.payload), ['type', 'token', 'auth']);
      assert.equal(out.payload.type, 'staff');
      assert.deepEqual(out.payload.auth, expectedAuthFromToken(out.payload.token));
      const row = await queryOne('SELECT google_sub, last_seen FROM users WHERE id = ?', [id]);
      assert.equal(row.google_sub, `sub-${id}`);
      assert.ok(row.last_seen);
      assert.deepEqual(await securityEventsFor(out.ua), [
        {
          action: 'auth.login.staff_plan.oauth_google',
          actor_user_type: 'student',
          actor_user_id: id,
          target_type: 'student',
          target_id: id,
          result: 'success',
          reason: null,
          payload_json: null,
        },
      ]);
    });

    it('compte absent : oauth_staff_account_not_found journalisé avec l’e-mail', async () => {
      const email = `${uniq('perso.absent.')}@pedagolyautey.org`;
      mockGoogle({ payload: claims({ email }) });
      const out = await callback({ mode: 'staff' });
      assert.equal(out.location, errorLocation('oauth_staff_account_not_found', 'staff'));
      assert.deepEqual(await securityEventsFor(out.ua), [
        {
          action: 'auth.login.staff_plan.oauth_google',
          actor_user_type: null,
          actor_user_id: null,
          target_type: null,
          target_id: null,
          result: 'failure',
          reason: 'oauth_staff_account_not_found',
          payload_json: { email },
        },
      ]);
    });

    it('connexion Google élève fermée, identité différente, compte désactivé', async () => {
      const email = `${uniq('perso.regles.')}@pedagolyautey.org`;
      const subA = uniq('sub-perso-a-');
      const id = await createUser({
        userType: 'student',
        email,
        googleSub: subA,
        roleSlug: 'personnel',
      });
      await setSetting('ui.auth.allow_google_student', false, {});
      mockGoogle({ payload: claims({ email, sub: subA }) });
      assert.equal(
        (await callback({ mode: 'staff' })).location,
        errorLocation('oauth_student_google_disabled', 'staff'),
      );
      await setSetting('ui.auth.allow_google_student', true, {});
      mockGoogle({ payload: claims({ email, sub: uniq('sub-perso-b-') }) });
      assert.equal(
        (await callback({ mode: 'staff' })).location,
        errorLocation('oauth_account_mismatch', 'staff'),
      );
      await execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
      mockGoogle({ payload: claims({ email, sub: subA }) });
      assert.equal(
        (await callback({ mode: 'staff' })).location,
        errorLocation('oauth_account_inactive', 'staff'),
      );
    });

    it('compte élève sans accès : refus nommant le profil, google_sub tout de même lié', async () => {
      const email = `${uniq('eleve.staff.')}@lyceelyautey.org`;
      const id = await createUser({ userType: 'student', email, roleSlug: 'visiteur' });
      mockGoogle({ payload: claims({ email, sub: `sub-${id}` }) });
      const out = await callback({ mode: 'staff' });
      const hash = new URLSearchParams(out.location.split('#')[1]);
      assert.equal(hash.get('oauth_error'), 'oauth_staff_no_access');
      assert.ok(hash.get('role'));
      const row = await queryOne('SELECT google_sub, last_seen FROM users WHERE id = ?', [id]);
      assert.equal(row.google_sub, `sub-${id}`);
      assert.ok(row.last_seen);
      const events = await securityEventsFor(out.ua);
      assert.equal(events.length, 1);
      assert.equal(events[0].reason, 'oauth_staff_no_access');
      assert.equal(events[0].actor_user_type, 'student');
    });
  });

  describe('élève', () => {
    it('parcours nominal (compte existant) : charge élève complète, identité liée au 1er passage', async () => {
      const email = `${uniq('eleve.carac.')}@lyceelyautey.org`;
      const id = await createUser({ userType: 'student', email, roleSlug: 'eleve_novice' });
      mockGoogle({ payload: claims({ email, sub: `sub-${id}` }) });
      const out = await callback();
      assert.deepEqual(out.cookies, CLEARED_COOKIES);
      assert.deepEqual(Object.keys(out.payload), ['type', 'accountCreated', 'student']);
      assert.equal(out.payload.type, 'student');
      assert.equal(out.payload.accountCreated, false);
      const dbRow = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
      assert.equal(dbRow.google_sub, `sub-${id}`);
      assert.ok(dbRow.last_seen);
      const { authToken, ...student } = out.payload.student;
      assert.equal(typeof authToken, 'string');
      assert.deepEqual(
        student,
        JSON.parse(
          JSON.stringify({
            ...toPublicUserRow(dbRow),
            discoveryTourSeen: parseDiscoveryTourSeen(dbRow.discovery_tour_seen_json),
            auth: expectedAuthFromToken(authToken),
          }),
        ),
      );
      assert.equal(student.auth.roleSlug, 'eleve_novice');
      assert.deepEqual(await securityEventsFor(out.ua), [
        {
          action: 'auth.login.student.oauth_google',
          actor_user_type: 'student',
          actor_user_id: id,
          target_type: 'student',
          target_id: id,
          result: 'success',
          reason: null,
          payload_json: null,
        },
      ]);
    });

    it('compte lié : retrouvé par l’identité Google malgré une adresse différente', async () => {
      const email = `${uniq('eleve.lie.')}@lyceelyautey.org`;
      const sub = uniq('sub-eleve-');
      const id = await createUser({ userType: 'student', email, googleSub: sub });
      mockGoogle({ payload: claims({ email: `${uniq('autre.')}@lyceelyautey.org`, sub }) });
      const out = await callback();
      assert.equal(out.payload?.student?.id, id);
      assert.equal(out.payload.student.email, email);
    });

    it('autre identité Google sur la même adresse : oauth_account_mismatch', async () => {
      const email = `${uniq('eleve.mm.')}@lyceelyautey.org`;
      await createUser({ userType: 'student', email, googleSub: uniq('sub-x-') });
      mockGoogle({ payload: claims({ email, sub: uniq('sub-y-') }) });
      assert.equal((await callback()).location, errorLocation('oauth_account_mismatch'));
    });

    it('compte désactivé : oauth_account_inactive, rien n’est lié', async () => {
      const email = `${uniq('eleve.off.')}@lyceelyautey.org`;
      const id = await createUser({ userType: 'student', email, isActive: 0 });
      mockGoogle({ payload: claims({ email, sub: uniq('sub-') }) });
      assert.equal((await callback()).location, errorLocation('oauth_account_inactive'));
      const row = await queryOne('SELECT google_sub, last_seen FROM users WHERE id = ?', [id]);
      assert.equal(row.google_sub, null);
      assert.equal(row.last_seen, null);
    });

    it('compte supprimé : non recréé si l’auto-inscription est fermée, recréé sinon', async () => {
      const email = `${uniq('eleve.suppr.')}@lyceelyautey.org`;
      const sub = uniq('sub-suppr-');
      const oldId = await createUser({ userType: 'student', email, googleSub: sub });
      const deletion = await deleteStudentById(oldId);
      assert.equal(deletion.ok, true);

      mockGoogle({
        payload: claims({ email, sub, given_name: 'Nouveau', family_name: 'Compte', name: 'X Y' }),
      });
      const closed = await callback();
      assert.equal(closed.location, errorLocation('oauth_account_not_found'));
      assert.equal(await queryOne('SELECT id FROM users WHERE google_sub = ?', [sub]), undefined);

      // Inscriptions fermées : l'auto-inscription Google est fermée aussi (S11).
      await setSetting('ui.auth.allow_google_auto_register', true, {});
      await setSetting('ui.auth.allow_register', false, {});
      assert.equal((await callback()).location, errorLocation('oauth_account_not_found'));

      await setSetting('ui.auth.allow_register', true, {});
      const reopened = await callback();
      assert.equal(reopened.payload?.type, 'student');
      assert.equal(reopened.payload.accountCreated, true);
      const created = await queryOne('SELECT * FROM users WHERE google_sub = ?', [sub]);
      assert.ok(created);
      assert.notEqual(created.id, oldId);
      assert.equal(reopened.payload.student.id, created.id);
      assert.equal(created.user_type, 'student');
      assert.equal(created.email, email);
      assert.equal(created.first_name, 'Nouveau');
      assert.equal(created.last_name, 'Compte');
      assert.equal(created.display_name, 'Nouveau Compte');
      assert.equal(created.description, 'Compte Google');
      assert.equal(created.auth_provider, 'google');
      assert.equal(created.password_hash, null);
      assert.equal(created.pseudo, null);
      assert.equal(Number(created.is_active), 1);
      assert.ok(created.last_seen);
      const { authToken, ...student } = reopened.payload.student;
      assert.deepEqual(
        student,
        JSON.parse(
          JSON.stringify({
            ...toPublicUserRow(created),
            discoveryTourSeen: parseDiscoveryTourSeen(created.discovery_tour_seen_json),
            auth: expectedAuthFromToken(authToken),
          }),
        ),
      );
      assert.deepEqual(await securityEventsFor(reopened.ua), [
        {
          action: 'auth.login.student.oauth_google',
          actor_user_type: 'student',
          actor_user_id: created.id,
          target_type: 'student',
          target_id: created.id,
          result: 'success',
          reason: null,
          payload_json: { account_created: true },
        },
      ]);
    });

    it('création sans prénom ni nom Google : découpage du nom affiché', async () => {
      await setSetting('ui.auth.allow_google_auto_register', true, {});
      const email = `${uniq('eleve.nom.')}@lyceelyautey.org`;
      mockGoogle({ payload: claims({ email, name: 'Jean Paul Carac' }) });
      const out = await callback();
      assert.equal(out.payload?.accountCreated, true);
      const created = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      assert.equal(created.first_name, 'Jean Paul');
      assert.equal(created.last_name, 'Carac');
      assert.equal(created.google_sub, null);

      const email2 = `${uniq('eleve.sansnom.')}@lyceelyautey.org`;
      mockGoogle({ payload: claims({ email: email2 }) });
      await callback();
      const created2 = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [
        email2,
      ]);
      assert.equal(created2.first_name, 'Google');
      assert.equal(created2.last_name, 'Utilisateur');
    });
  });
});
