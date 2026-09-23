'use strict';

/**
 * Interrupteur général de création de comptes — filet du lot I de
 * `docs/AUDIT_SECURITE_2026-09-22.md` (constat **S11**).
 *
 * Le constat : deux réglages indépendants gardaient deux chemins de création de compte, si
 * bien que décocher « autoriser l'inscription » laissait ouverte l'auto-inscription à la
 * première connexion Google. Ce n'était pas une faille — les deux gardes étaient réelles —
 * mais un piège de configuration : une garde qu'un administrateur croit avoir posée.
 *
 * Les trois cas ci-dessous fixent la subordination dans les deux sens : fermé ferme les deux
 * chemins, ouvert ne rouvre pas ce que le second réglage ferme de son côté.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');
const authRouter = require('../routes/auth');
const { setSetting, invalidateSettingsCache } = require('../lib/settings');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const {
  isRegistrationAllowed,
  isGoogleAutoRegistrationAllowed,
} = require('../lib/registrationPolicy');

const stamp = Date.now();
const snapshots = [];
const createdEmails = [];

async function setRegistration({ selfService, googleAuto }) {
  const by = { userType: 'teacher', userId: 'test' };
  await setSetting('ui.auth.allow_register', selfService, by);
  await setSetting('ui.auth.allow_google_auto_register', googleAuto, by);
  invalidateSettingsCache();
}

/**
 * Rejoue un retour Google pour une adresse **inconnue** : c'est le seul cas où le callback
 * crée un compte, donc le seul que la politique concerne.
 * @returns {Promise<string>} l'adresse utilisée, pour vérifier qu'aucun compte n'existe.
 */
async function googleCallbackForUnknownStudent(label) {
  const email = `autoreg.${label}.${stamp}@lyceelyautey.org`;
  createdEmails.push(email);
  authRouter.__setGoogleOAuthHooks({
    exchangeCode: async () => ({ id_token: `token-${label}` }),
    verifyIdToken: async () => ({
      aud: process.env.GOOGLE_OAUTH_CLIENT_ID,
      iss: 'accounts.google.com',
      email,
      email_verified: true,
      hd: 'lyceelyautey.org',
      given_name: 'Auto',
      family_name: 'Register',
      name: 'Auto Register',
    }),
  });
  try {
    const res = await request(app)
      .get(`/api/auth/google/callback?state=${label}&code=code-${label}`)
      .set('Cookie', [`foretmap_oauth_state=${label}`, 'foretmap_oauth_mode=student'])
      .expect(302);
    return { email, location: String(res.headers.location || '') };
  } finally {
    authRouter.__setGoogleOAuthHooks();
  }
}

async function studentExists(email) {
  const row = await queryOne(
    "SELECT id FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?) LIMIT 1",
    [email],
  );
  return Boolean(row?.id);
}

test.before(async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
  process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS = 'pedagolyautey.org,lyceelyautey.org';
  process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
  await initSchema();
  for (const key of ['ui.auth.allow_register', 'ui.auth.allow_google_auto_register']) {
    snapshots.push(await snapshotSetting(key));
  }
});

test.after(async () => {
  for (const email of createdEmails) {
    await execute("DELETE FROM users WHERE user_type = 'student' AND LOWER(email) = LOWER(?)", [
      email,
    ]);
  }
  for (const snap of snapshots) await restoreSetting(snap);
  invalidateSettingsCache();
});

test('inscriptions fermées : le formulaire ET l’auto-inscription Google sont refusés (S11)', async () => {
  // La combinaison piégeuse : l'administrateur a fermé les inscriptions, mais le réglage
  // Google est resté coché. Avant le lot I, ce second chemin restait ouvert.
  await setRegistration({ selfService: false, googleAuto: true });

  const form = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Ferme', lastName: `Inscription${stamp}`, password: 'MotDePasse!2026' });
  assert.equal(form.status, 403, 'le formulaire doit refuser');

  const { email, location } = await googleCallbackForUnknownStudent('ferme');
  assert.match(location, /oauth_account_not_found/, 'le callback ne doit pas créer de compte');
  assert.equal(await studentExists(email), false, `un compte a été créé pour ${email}`);

  // Et la règle est lisible depuis la politique elle-même, sans rejouer une route.
  assert.equal(await isRegistrationAllowed(), false);
  assert.equal(await isGoogleAutoRegistrationAllowed(), false);
});

test('inscriptions ouvertes : le réglage Google garde son rôle propre', async () => {
  // La subordination ne doit pas rendre le second réglage inopérant : inscriptions ouvertes,
  // il doit continuer de n'autoriser que la **connexion** des comptes déjà existants.
  await setRegistration({ selfService: true, googleAuto: false });
  assert.equal(await isRegistrationAllowed(), true);
  assert.equal(await isGoogleAutoRegistrationAllowed(), false);

  const { email, location } = await googleCallbackForUnknownStudent('ouvert-sans-google');
  assert.match(location, /oauth_account_not_found/);
  assert.equal(await studentExists(email), false);
});

test('inscriptions ouvertes et auto-inscription Google active : le compte est bien créé', async () => {
  // Le cas nominal, sans lequel les deux précédents ne prouveraient rien : la garde doit
  // laisser passer ce qu'elle est censée laisser passer.
  await setRegistration({ selfService: true, googleAuto: true });
  assert.equal(await isGoogleAutoRegistrationAllowed(), true);

  const { email } = await googleCallbackForUnknownStudent('ouvert-avec-google');
  assert.equal(await studentExists(email), true, 'le compte aurait dû être créé');
});
