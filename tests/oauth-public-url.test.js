'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOAuthPublicHost,
  resolveOAuthPublicOrigin,
  resolveOAuthRedirectUri,
  resolveProductReturnOrigin,
} = require('../lib/oauthPublicUrl');
const { PRODUCTS, PRODUCT_IDS } = require('../lib/products');

function mockReq({ host, proto, forwardedHost, forwardedProto } = {}) {
  const headers = {};
  if (forwardedHost) headers['x-forwarded-host'] = forwardedHost;
  if (forwardedProto) headers['x-forwarded-proto'] = forwardedProto;
  return {
    protocol: proto || 'http',
    get(name) {
      const key = String(name || '').toLowerCase();
      if (key === 'host') return host || '';
      return headers[key] || '';
    },
  };
}

test('normalizeOAuthPublicHost retire www. et conserve le port', () => {
  assert.equal(normalizeOAuthPublicHost('www.gl.olution.info'), 'gl.olution.info');
  assert.equal(
    normalizeOAuthPublicHost('WWW.Foretmap.olution.info:443'),
    'foretmap.olution.info:443',
  );
  assert.equal(normalizeOAuthPublicHost('localhost:3000'), 'localhost:3000');
});

test('resolveOAuthRedirectUri utilise GL_GOOGLE_OAUTH_REDIRECT_URI si défini', () => {
  const uri = resolveOAuthRedirectUri(mockReq({ host: 'www.gl.olution.info' }), {
    envRedirectUri: 'https://gl.olution.info/api/gl/auth/google/callback',
    callbackPath: '/api/gl/auth/google/callback',
  });
  assert.equal(uri, 'https://gl.olution.info/api/gl/auth/google/callback');
});

test('resolveOAuthRedirectUri dérive https sans www depuis X-Forwarded-*', () => {
  const uri = resolveOAuthRedirectUri(
    mockReq({
      host: 'www.gl.olution.info',
      proto: 'http',
      forwardedHost: 'www.gl.olution.info',
      forwardedProto: 'https',
    }),
    { callbackPath: '/api/gl/auth/google/callback' },
  );
  assert.equal(uri, 'https://gl.olution.info/api/gl/auth/google/callback');
});

test('resolveOAuthPublicOrigin respecte FRONTEND_ORIGIN', () => {
  const origin = resolveOAuthPublicOrigin(
    mockReq({ host: 'gl.olution.info' }),
    'https://gl.olution.info',
  );
  assert.equal(origin, 'https://gl.olution.info');
});

/**
 * Retour OAuth vers le produit d'où l'utilisateur est parti. Google ne rappelle que sur des
 * `redirect_uri` enregistrées : sans cette résolution, un personnel parti de `proflyautey.*`
 * revenait sur l'origine de ForetMap avec un jeton inutilisable là où il l'avait demandé.
 */
const PRODUCT_PREFIXES = PRODUCT_IDS.flatMap((id) => [...PRODUCTS[id].hostPrefixes]);
const RETURN_OPTS = {
  requestHost: 'foretmap.olution.info',
  fallbackOrigin: 'https://foretmap.olution.info',
  productHostPrefixes: PRODUCT_PREFIXES,
};

test('resolveProductReturnOrigin accepte un produit du registre sur le même domaine parent', () => {
  assert.equal(
    resolveProductReturnOrigin('https://proflyautey.olution.info', RETURN_OPTS),
    'https://proflyautey.olution.info',
  );
  assert.equal(
    resolveProductReturnOrigin('https://planlyautey.olution.info', RETURN_OPTS),
    'https://planlyautey.olution.info',
  );
});

test('resolveProductReturnOrigin refuse tout le reste et retombe sur l’origine de repli', () => {
  // Un domaine étranger portant le bon préfixe : c'est exactement la redirection ouverte
  // qu'un flux transportant un jeton ne doit jamais offrir.
  assert.equal(
    resolveProductReturnOrigin('https://proflyautey.attaquant.test', RETURN_OPTS),
    RETURN_OPTS.fallbackOrigin,
  );
  // Un hôte du bon domaine mais qui n'est pas un produit déclaré.
  assert.equal(
    resolveProductReturnOrigin('https://autre.olution.info', RETURN_OPTS),
    RETURN_OPTS.fallbackOrigin,
  );
  for (const bogus of ['', null, 'javascript:alert(1)', 'pas-une-url', '//proflyautey.evil.test']) {
    assert.equal(resolveProductReturnOrigin(bogus, RETURN_OPTS), RETURN_OPTS.fallbackOrigin);
  }
});
