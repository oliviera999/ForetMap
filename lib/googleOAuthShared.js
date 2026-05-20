'use strict';

const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const googleOidcClient = new OAuth2Client();

let googleOAuthHooks = {
  exchangeCode: null,
  verifyIdToken: null,
};

function setGoogleOAuthHooks(hooks = {}) {
  googleOAuthHooks = {
    exchangeCode: hooks.exchangeCode || null,
    verifyIdToken: hooks.verifyIdToken || null,
  };
}

function makeGoogleOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

function encodeOAuthPayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function buildOAuthFrontendRedirect(frontendOrigin, payload) {
  const base = String(frontendOrigin || '').replace(/\/+$/, '');
  return `${base}/#oauth=${encodeURIComponent(encodeOAuthPayload(payload))}`;
}

function buildOAuthFrontendErrorRedirect(frontendOrigin, code) {
  const base = String(frontendOrigin || '').replace(/\/+$/, '');
  return `${base}/#oauth_error=${encodeURIComponent(code)}`;
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

module.exports = {
  setGoogleOAuthHooks,
  makeGoogleOAuthState,
  encodeOAuthPayload,
  buildOAuthFrontendRedirect,
  buildOAuthFrontendErrorRedirect,
  exchangeGoogleCode,
  verifyGoogleIdToken,
};
