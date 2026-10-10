'use strict';

/**
 * Chiffrement au repos des secrets de double authentification (`lib/auth/totpCrypto.js`) :
 * AES-256-GCM, clé dédiée `TOTP_ENCRYPTION_KEY` (distincte de `JWT_SECRET`), identifiant de
 * clé stocké avec chaque chiffré, rotation par clés précédentes, chiffré lié au compte (AAD).
 * Tests purs : aucune base de données.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const totpCrypto = require('../lib/auth/totpCrypto');

const KEY_A = crypto.randomBytes(32).toString('hex');
const KEY_B = crypto.randomBytes(32).toString('base64');

function envWith(vars) {
  return { ...vars };
}

test('clé absente : statut « missing », chiffrement refusé avec un code explicite', () => {
  const env = envWith({});
  assert.equal(totpCrypto.describeTotpKeyStatus(env).status, 'missing');
  assert.equal(totpCrypto.isTotpKeyConfigured(env), false);
  assert.throws(
    () => totpCrypto.encryptTotpSecret(crypto.randomBytes(20), 'u1', env),
    (err) => err.code === 'TOTP_KEY_MISSING',
  );
});

test('clé invalide (longueur) : statut « invalid », jamais acceptée', () => {
  const env = envWith({ TOTP_ENCRYPTION_KEY: 'trop-courte' });
  assert.equal(totpCrypto.describeTotpKeyStatus(env).status, 'invalid');
  assert.equal(totpCrypto.isTotpKeyConfigured(env), false);
  assert.throws(
    () => totpCrypto.encryptTotpSecret(crypto.randomBytes(20), 'u1', env),
    (err) => err.code === 'TOTP_KEY_MISSING',
  );
});

test('clé hexadécimale ou base64 de 32 octets : acceptée', () => {
  assert.equal(totpCrypto.describeTotpKeyStatus({ TOTP_ENCRYPTION_KEY: KEY_A }).status, 'ok');
  assert.equal(totpCrypto.describeTotpKeyStatus({ TOTP_ENCRYPTION_KEY: KEY_B }).status, 'ok');
});

test('aller-retour : le secret déchiffré est identique, le chiffré ne le contient pas', () => {
  const env = envWith({ TOTP_ENCRYPTION_KEY: KEY_A });
  const secret = crypto.randomBytes(20);
  const sealed = totpCrypto.encryptTotpSecret(secret, 'user-42', env);
  assert.match(sealed.ciphertext, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.match(sealed.keyId, /^[0-9a-f]{12}$/);
  for (const encoding of ['hex', 'base64', 'base64url']) {
    assert.ok(
      !sealed.ciphertext.includes(secret.toString(encoding)),
      `le chiffré ne doit pas contenir le secret en ${encoding}`,
    );
  }
  assert.ok(!sealed.ciphertext.includes(totpCrypto.__test.base32Of(secret)));
  const opened = totpCrypto.decryptTotpSecret(sealed, 'user-42', env);
  assert.ok(Buffer.isBuffer(opened));
  assert.ok(opened.equals(secret));
});

test('deux chiffrements du même secret diffèrent (IV aléatoire)', () => {
  const env = envWith({ TOTP_ENCRYPTION_KEY: KEY_A });
  const secret = crypto.randomBytes(20);
  const a = totpCrypto.encryptTotpSecret(secret, 'u', env);
  const b = totpCrypto.encryptTotpSecret(secret, 'u', env);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('chiffré lié au compte : recopié sur un autre compte, il ne se déchiffre pas', () => {
  const env = envWith({ TOTP_ENCRYPTION_KEY: KEY_A });
  const sealed = totpCrypto.encryptTotpSecret(crypto.randomBytes(20), 'alice', env);
  assert.throws(
    () => totpCrypto.decryptTotpSecret(sealed, 'mallory', env),
    (err) => err.code === 'TOTP_DECRYPT_FAILED',
  );
});

test('chiffré altéré : refusé (authentification GCM)', () => {
  const env = envWith({ TOTP_ENCRYPTION_KEY: KEY_A });
  const sealed = totpCrypto.encryptTotpSecret(crypto.randomBytes(20), 'u', env);
  const parts = sealed.ciphertext.split('.');
  const ct = Buffer.from(parts[2], 'base64url');
  ct[0] ^= 0x01;
  parts[2] = ct.toString('base64url');
  assert.throws(
    () => totpCrypto.decryptTotpSecret({ ...sealed, ciphertext: parts.join('.') }, 'u', env),
    (err) => err.code === 'TOTP_DECRYPT_FAILED',
  );
});

test('rotation : l’ancienne clé, déclarée « précédente », déchiffre encore ; le rechiffrement passe sur la nouvelle', () => {
  const oldEnv = envWith({ TOTP_ENCRYPTION_KEY: KEY_A });
  const secret = crypto.randomBytes(20);
  const sealed = totpCrypto.encryptTotpSecret(secret, 'u', oldEnv);

  const rotatedEnv = envWith({ TOTP_ENCRYPTION_KEY: KEY_B, TOTP_ENCRYPTION_KEY_PREVIOUS: KEY_A });
  assert.ok(totpCrypto.decryptTotpSecret(sealed, 'u', rotatedEnv).equals(secret));
  assert.equal(totpCrypto.needsReencryption(sealed, rotatedEnv), true);
  const resealed = totpCrypto.reencryptTotpSecret(sealed, 'u', rotatedEnv);
  assert.notEqual(resealed.keyId, sealed.keyId);
  assert.equal(totpCrypto.needsReencryption(resealed, rotatedEnv), false);

  // Ancienne clé retirée : le vieux chiffré devient illisible, le nouveau reste lisible.
  const newOnly = envWith({ TOTP_ENCRYPTION_KEY: KEY_B });
  assert.throws(
    () => totpCrypto.decryptTotpSecret(sealed, 'u', newOnly),
    (err) => err.code === 'TOTP_KEY_UNKNOWN',
  );
  assert.ok(totpCrypto.decryptTotpSecret(resealed, 'u', newOnly).equals(secret));
});

test('identifiant de clé : stable, et ne révèle pas la clé', () => {
  const id1 = totpCrypto.describeTotpKeyStatus({ TOTP_ENCRYPTION_KEY: KEY_A }).keyId;
  const id2 = totpCrypto.describeTotpKeyStatus({ TOTP_ENCRYPTION_KEY: KEY_A }).keyId;
  assert.equal(id1, id2);
  assert.ok(!KEY_A.includes(id1));
});

test('clé identique à JWT_SECRET : signalée (les deux secrets doivent être distincts)', () => {
  const status = totpCrypto.describeTotpKeyStatus({
    TOTP_ENCRYPTION_KEY: KEY_A,
    JWT_SECRET: KEY_A,
  });
  assert.equal(status.status, 'ok');
  assert.equal(status.sameAsJwtSecret, true);
  assert.equal(
    totpCrypto.describeTotpKeyStatus({ TOTP_ENCRYPTION_KEY: KEY_A, JWT_SECRET: 'autre' })
      .sameAsJwtSecret,
    false,
  );
});
