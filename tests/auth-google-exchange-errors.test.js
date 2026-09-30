'use strict';

/**
 * Rappel Google : un échec de l'échange du code est **nommé** (30/09/2026).
 *
 * Avant, toute réponse non 2xx du point de jeton de Google levait une erreur sans détail :
 * l'utilisateur lisait « Erreur serveur pendant la connexion Google » et le journal ne
 * gardait pas la raison donnée par Google (`error`, RFC 6749 §5.2). Un code expiré et des
 * identifiants OAuth refusés étaient indiscernables.
 *
 * Le `fetch` global est simulé (aucun appel réseau) : c'est la lecture réelle de la réponse
 * de Google qui est vérifiée, pas un crochet de test.
 */

require('./helpers/setup');
const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app } = require('../server');
const authRouter = require('../routes/auth');
const { initSchema } = require('../database');
const { setSetting, getSettingValue } = require('../lib/settings');

const ORIGIN = 'http://localhost:3000';
const ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'test-exchange-client-id.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'test-exchange-secret',
  GOOGLE_OAUTH_REDIRECT_URI: `${ORIGIN}/api/auth/google/callback`,
  FRONTEND_ORIGIN: ORIGIN,
};
const savedEnv = {};
let savedGoogleEnabled;
const realFetch = global.fetch;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
  await initSchema();
  savedGoogleEnabled = await getSettingValue('integration.google.enabled', undefined);
  await setSetting('integration.google.enabled', true, {});
  authRouter.__setGoogleOAuthHooks();
});

afterEach(() => {
  global.fetch = realFetch;
});

after(async () => {
  global.fetch = realFetch;
  for (const key of Object.keys(ENV)) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (savedGoogleEnabled !== undefined) {
    await setSetting('integration.google.enabled', savedGoogleEnabled, {});
  }
});

/** Point de jeton simulé ; les autres appels (aucun attendu) échouent bruyamment. */
function mockTokenEndpoint(respond) {
  global.fetch = async (url, init) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') return respond(init);
    throw new Error(`fetch inattendu : ${url}`);
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function callback() {
  const res = await request(app)
    .get('/api/auth/google/callback?state=st-exchange&code=code-exchange')
    .set('Cookie', ['foretmap_oauth_state=st-exchange', 'foretmap_oauth_mode=student'])
    .expect(302);
  return String(res.headers.location || '');
}

function errorLocation(code) {
  return `${ORIGIN}/#oauth_error=${code}&mode=student`;
}

describe('échange du code Google', () => {
  it('code expiré ou déjà utilisé (invalid_grant) : oauth_code_expired', async () => {
    let sentBody = '';
    mockTokenEndpoint((init) => {
      sentBody = String(init?.body || '');
      return jsonResponse(400, { error: 'invalid_grant', error_description: 'Bad Request' });
    });
    assert.equal(await callback(), errorLocation('oauth_code_expired'));
    assert.match(sentBody, /grant_type=authorization_code/);
  });

  it('identifiants OAuth refusés : oauth_client_rejected', async () => {
    for (const error of ['invalid_client', 'unauthorized_client', 'redirect_uri_mismatch']) {
      mockTokenEndpoint(() => jsonResponse(401, { error }));
      assert.equal(await callback(), errorLocation('oauth_client_rejected'), error);
    }
  });

  it('Google injoignable : oauth_google_unreachable', async () => {
    global.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    assert.equal(await callback(), errorLocation('oauth_google_unreachable'));
  });

  it('refus inexpliqué (corps illisible ou code inconnu) : oauth_server_error', async () => {
    mockTokenEndpoint(() => new Response('<html>erreur</html>', { status: 500 }));
    assert.equal(await callback(), errorLocation('oauth_server_error'));
    mockTokenEndpoint(() => jsonResponse(400, { error: 'invalid_request' }));
    assert.equal(await callback(), errorLocation('oauth_server_error'));
  });
});
