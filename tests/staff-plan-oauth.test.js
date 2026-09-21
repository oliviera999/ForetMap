'use strict';

/**
 * Connexion Google du **plan des personnels** (proflyautey / stafflyautey, `mode=staff`).
 *
 * Régression corrigée ici : la porte de proflyautey lançait `mode=teacher`, qui ne connecte
 * qu'un compte `users.user_type = 'teacher'`. Or le profil « Personnel » est porté par un
 * compte de type élève (`userTypeForRole`), et tout compte promu « Prof de classe » depuis un
 * compte élève garde son type d'origine (l'attribution d'un profil ne touche pas `user_type`).
 * Ces comptes repartaient avec `oauth_teacher_account_not_found` — affiché « La connexion n'a
 * pas abouti. Réessayez. » — alors que la garde du produit (`lib/staffPlanAccess.js`) les
 * autorise. Seuls les comptes enseignants (admin, n3boss) entraient.
 */

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { recomputeUserRole } = require('../lib/effectiveRole');
const { addUserToGroup } = require('../lib/groupMembers');
const authRouter = require('../routes/auth');

const CALLBACK_ORIGIN = 'https://foretmap.olution.info';
const STAFF_ORIGIN = 'https://proflyautey.olution.info';

const savedEnv = {};
const ENV_KEYS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'FRONTEND_ORIGIN',
];

before(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = `${CALLBACK_ORIGIN}/api/auth/google/callback`;
  process.env.FRONTEND_ORIGIN = CALLBACK_ORIGIN;
  await initSchema();
});

after(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  authRouter.__setGoogleOAuthHooks();
});

/**
 * Compte doté d'un profil, avec un `user_type` choisi : c'est tout l'enjeu du correctif —
 * un « Personnel » est un compte élève, un « Prof de classe » peut l'être aussi (promotion).
 */
async function createAccount({ roleSlug, userType }) {
  const id = crypto.randomUUID();
  const email = `staffoauth.${roleSlug}.${userType}.${id.slice(0, 8)}@pedagolyautey.org`;
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `profil ${roleSlug} absent du catalogue RBAC`);
  await execute(
    `INSERT INTO users (id, user_type, assigned_role_id, email, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Test', ?, ?, ?, 'local', 1, NOW(), NOW())`,
    [
      id,
      userType,
      role.id,
      email,
      roleSlug,
      `Test ${roleSlug}`,
      await bcrypt.hash('motdepasse1234', 10),
    ],
  );
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    userType,
    id,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    [userType, id, role.id],
  );
  return { id, email };
}

/** Retour de Google sur l'hôte du rappel, pour une connexion partie de proflyautey. */
async function googleCallback(email, mode) {
  const state = `st-${crypto.randomUUID()}`;
  authRouter.__setGoogleOAuthHooks({
    exchangeCode: async () => ({ id_token: 'id-token-test' }),
    verifyIdToken: async () => ({
      aud: process.env.GOOGLE_OAUTH_CLIENT_ID,
      iss: 'https://accounts.google.com',
      email,
      email_verified: true,
      hd: 'pedagolyautey.org',
    }),
  });
  try {
    const res = await request(app)
      .get(`/api/auth/google/callback?state=${state}&code=code-test`)
      .set('Host', 'foretmap.olution.info')
      .set('X-Forwarded-Host', 'foretmap.olution.info')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', [
        `foretmap_oauth_state=${state}`,
        `foretmap_oauth_mode=${mode}`,
        `foretmap_oauth_origin=${encodeURIComponent(STAFF_ORIGIN)}`,
      ])
      .expect(302);
    const location = String(res.headers.location || '');
    const hash = new URLSearchParams(location.split('#')[1] || '');
    const error = hash.get('oauth_error');
    const raw = hash.get('oauth');
    return {
      location,
      error,
      role: hash.get('role'),
      payload: raw ? JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) : null,
    };
  } finally {
    authRouter.__setGoogleOAuthHooks();
  }
}

/** La charge du plan des personnels, signée par le jeton du retour OAuth. */
function staffPlanContent(token) {
  return request(app)
    .get('/api/staff-plan/content')
    .set('Host', 'proflyautey.olution.info')
    .set('X-Forwarded-Host', 'proflyautey.olution.info')
    .set('X-Forwarded-Proto', 'https')
    .set('Authorization', `Bearer ${token}`);
}

describe('Connexion Google du plan des personnels (mode=staff)', () => {
  it('un compte « Personnel » (type élève) entre et obtient la charge', async () => {
    const { email } = await createAccount({ roleSlug: 'personnel', userType: 'student' });
    const out = await googleCallback(email, 'staff');
    assert.strictEqual(out.error, null, `refus inattendu : ${out.error}`);
    assert.strictEqual(out.payload?.type, 'staff');
    assert.ok(out.payload?.token, 'jeton absent du retour');
    assert.strictEqual(out.payload?.auth?.roleSlug, 'personnel');
    assert.ok(out.location.startsWith(STAFF_ORIGIN), 'retour hors du produit de départ');
    await staffPlanContent(out.payload.token).expect(200);
  });

  it('un « Prof de classe » promu depuis un compte élève entre aussi', async () => {
    const { email } = await createAccount({ roleSlug: 'prof_classe', userType: 'student' });
    const out = await googleCallback(email, 'staff');
    assert.strictEqual(out.error, null, `refus inattendu : ${out.error}`);
    assert.strictEqual(out.payload?.type, 'staff');
    await staffPlanContent(out.payload.token).expect(200);
  });

  it('un compte enseignant (Prof de classe) entre, avec un retour de type `staff`', async () => {
    const { email } = await createAccount({ roleSlug: 'prof_classe', userType: 'teacher' });
    const out = await googleCallback(email, 'staff');
    assert.strictEqual(out.error, null, `refus inattendu : ${out.error}`);
    assert.strictEqual(out.payload?.type, 'staff');
    await staffPlanContent(out.payload.token).expect(200);
  });

  it('un « Personnel » rattaché à un groupe de classe entre quand même', async () => {
    // Le groupe confère son profil dès qu'il est de rang supérieur, et « Personnel » est le
    // plus bas du catalogue : sans le repli sur le profil attribué, ce compte était refusé à
    // sa propre porte alors que sa fiche affiche « Personnel ».
    const { id, email } = await createAccount({ roleSlug: 'personnel', userType: 'student' });
    const groupId = crypto.randomUUID();
    const groupRole = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
    await execute(
      'INSERT INTO `groups` (id, name, slug, default_role_id, force_default_role, is_active, created_at) VALUES (?, ?, ?, ?, 0, 1, NOW())',
      [groupId, `Classe ${groupId.slice(0, 8)}`, `cls-${groupId.slice(0, 8)}`, groupRole.id],
    );
    const attach = await addUserToGroup(id, groupId);
    assert.ok(attach.ok, `rattachement refusé : ${attach.error || ''}`);
    await recomputeUserRole(id);

    const out = await googleCallback(email, 'staff');
    assert.strictEqual(out.error, null, `refus inattendu : ${out.error}`);
    assert.strictEqual(out.payload?.type, 'staff');
    await staffPlanContent(out.payload.token).expect(200);
  });

  it('un compte sans accès (visiteur) est refusé, et le refus nomme son profil', async () => {
    const { email } = await createAccount({ roleSlug: 'visiteur', userType: 'student' });
    const out = await googleCallback(email, 'staff');
    assert.strictEqual(out.payload, null);
    assert.strictEqual(out.error, 'oauth_staff_no_access');
    // Le profil refusé voyage avec le code : « ce compte n'a pas l'accès » sans dire lequel
    // n'apprend rien à la personne ni à l'administrateur qu'elle va voir.
    assert.ok(out.role, 'le profil refusé n’est pas nommé dans le retour');
  });

  it('aucune création de compte : une adresse inconnue est refusée', async () => {
    const email = `staffoauth.inconnu.${crypto.randomUUID().slice(0, 8)}@pedagolyautey.org`;
    const out = await googleCallback(email, 'staff');
    assert.strictEqual(out.error, 'oauth_staff_account_not_found');
    const created = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [
      email,
    ]);
    assert.ok(!created?.id, 'un compte a été créé par le mode staff');
  });

  it('un compte désactivé est refusé', async () => {
    const { id, email } = await createAccount({ roleSlug: 'personnel', userType: 'student' });
    await execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    const out = await googleCallback(email, 'staff');
    assert.strictEqual(out.error, 'oauth_account_inactive');
  });

  it('mode enseignant inchangé : un compte élève n’y entre toujours pas', async () => {
    const { email } = await createAccount({ roleSlug: 'personnel', userType: 'student' });
    const out = await googleCallback(email, 'teacher');
    assert.strictEqual(out.error, 'oauth_teacher_email_is_student');
  });

  it('GET /api/auth/google/start accepte `mode=staff` et le mémorise', async () => {
    const res = await request(app)
      .get(`/api/auth/google/start?mode=staff&return_origin=${encodeURIComponent(STAFF_ORIGIN)}`)
      .set('Host', 'foretmap.olution.info')
      .set('X-Forwarded-Host', 'foretmap.olution.info')
      .set('X-Forwarded-Proto', 'https')
      .expect(302);
    assert.ok(String(res.headers.location).startsWith('https://accounts.google.com/'));
    const cookies = [].concat(res.headers['set-cookie'] || []);
    assert.ok(
      cookies.some((c) => c.startsWith('foretmap_oauth_mode=staff')),
      'le mode staff n’est pas mémorisé dans le cookie de la poignée de main',
    );
  });

  it('le rebond inter-produits conserve `mode=staff`', async () => {
    const res = await request(app)
      .get('/api/auth/google/start?mode=staff')
      .set('Host', 'proflyautey.olution.info')
      .set('X-Forwarded-Host', 'proflyautey.olution.info')
      .set('X-Forwarded-Proto', 'https')
      .expect(302);
    const location = new URL(String(res.headers.location));
    assert.strictEqual(location.origin, CALLBACK_ORIGIN);
    assert.strictEqual(location.searchParams.get('mode'), 'staff');
    assert.strictEqual(location.searchParams.get('return_origin'), STAFF_ORIGIN);
  });
});
