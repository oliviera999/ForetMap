'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeToolPrivateKey, readLtiEnv, loadToolPrivateKey } = require('../lib/lti/config');

const SAMPLE_PEM = `-----BEGIN PRIVATE KEY-----
MIIEtest
-----END PRIVATE KEY-----`;

const BASE_ENV = {
  LTI_ISSUER: 'https://olution.info',
  LTI_CLIENT_ID: 'abc',
  LTI_DEPLOYMENT_ID: '1',
  LTI_PLATFORM_AUTH_URL: 'https://olution.info/mod/lti/auth.php',
  LTI_PLATFORM_JWKS_URL: 'https://olution.info/mod/lti/certs.php',
};

test('normalizeToolPrivateKey : enlève les guillemets et développe \\n littéraux (cPanel)', () => {
  const fromCpanel = `"-----BEGIN PRIVATE KEY-----\\nMIIEtest\\n-----END PRIVATE KEY-----\\n"`;
  assert.equal(normalizeToolPrivateKey(fromCpanel), SAMPLE_PEM);
});

test('normalizeToolPrivateKey : PEM déjà multiligne inchangée', () => {
  assert.equal(normalizeToolPrivateKey(SAMPLE_PEM), SAMPLE_PEM);
});

test('readLtiEnv : applique la normalisation à LTI_TOOL_PRIVATE_KEY', () => {
  const env = readLtiEnv({
    ...BASE_ENV,
    LTI_TOOL_PRIVATE_KEY: `"-----BEGIN PRIVATE KEY-----\\nMIIEtest\\n-----END PRIVATE KEY-----"`,
  });
  assert.equal(env.toolPrivateKey, SAMPLE_PEM);
  assert.equal(env.toolPrivateKeySource, 'env');
  assert.equal(env.configured, true);
});

test('loadToolPrivateKey : priorite fichier sur variable env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lti-key-'));
  const file = path.join(dir, 'tool.pem');
  try {
    fs.writeFileSync(file, SAMPLE_PEM, 'utf8');
    const loaded = loadToolPrivateKey({
      LTI_TOOL_PRIVATE_KEY_FILE: file,
      LTI_TOOL_PRIVATE_KEY: 'ignore-me',
    });
    assert.equal(loaded.source, 'file');
    assert.equal(loaded.pem, SAMPLE_PEM);
    assert.equal(loaded.error, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadToolPrivateKey : base64 si pas de fichier', () => {
  const b64 = Buffer.from(SAMPLE_PEM, 'utf8').toString('base64');
  const loaded = loadToolPrivateKey({ LTI_TOOL_PRIVATE_KEY_B64: b64 });
  assert.equal(loaded.source, 'b64');
  assert.equal(loaded.pem, SAMPLE_PEM);
});

test('readLtiEnv : erreur lisible si fichier manquant', () => {
  const env = readLtiEnv({
    ...BASE_ENV,
    LTI_TOOL_PRIVATE_KEY_FILE: path.join(os.tmpdir(), 'lti-missing-nope.pem'),
  });
  assert.equal(env.configured, false);
  assert.equal(env.toolPrivateKeySource, 'file');
  assert.match(env.toolPrivateKeyError || '', /Lecture LTI_TOOL_PRIVATE_KEY_FILE/);
});
