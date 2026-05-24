'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOAuthPublicHost,
  resolveOAuthPublicOrigin,
  resolveOAuthRedirectUri,
} = require('../lib/oauthPublicUrl');

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
  assert.equal(normalizeOAuthPublicHost('WWW.Foretmap.olution.info:443'), 'foretmap.olution.info:443');
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
    { callbackPath: '/api/gl/auth/google/callback' }
  );
  assert.equal(uri, 'https://gl.olution.info/api/gl/auth/google/callback');
});

test('resolveOAuthPublicOrigin respecte FRONTEND_ORIGIN', () => {
  const origin = resolveOAuthPublicOrigin(
    mockReq({ host: 'gl.olution.info' }),
    'https://gl.olution.info'
  );
  assert.equal(origin, 'https://gl.olution.info');
});
