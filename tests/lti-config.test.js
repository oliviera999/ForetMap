'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeToolPrivateKey, readLtiEnv } = require('../lib/lti/config');

const SAMPLE_PEM = `-----BEGIN PRIVATE KEY-----
MIIEtest
-----END PRIVATE KEY-----`;

test('normalizeToolPrivateKey : enlève les guillemets et développe \\n littéraux (cPanel)', () => {
  const fromCpanel = `"-----BEGIN PRIVATE KEY-----\\nMIIEtest\\n-----END PRIVATE KEY-----\\n"`;
  assert.equal(normalizeToolPrivateKey(fromCpanel), SAMPLE_PEM);
});

test('normalizeToolPrivateKey : PEM déjà multiligne inchangée', () => {
  assert.equal(normalizeToolPrivateKey(SAMPLE_PEM), SAMPLE_PEM);
});

test('readLtiEnv : applique la normalisation à LTI_TOOL_PRIVATE_KEY', () => {
  const env = readLtiEnv({
    LTI_ISSUER: 'https://olution.info',
    LTI_CLIENT_ID: 'abc',
    LTI_DEPLOYMENT_ID: '1',
    LTI_PLATFORM_AUTH_URL: 'https://olution.info/mod/lti/auth.php',
    LTI_PLATFORM_JWKS_URL: 'https://olution.info/mod/lti/certs.php',
    LTI_TOOL_PRIVATE_KEY: `"-----BEGIN PRIVATE KEY-----\\nMIIEtest\\n-----END PRIVATE KEY-----"`,
  });
  assert.equal(env.toolPrivateKey, SAMPLE_PEM);
  assert.equal(env.configured, true);
});
