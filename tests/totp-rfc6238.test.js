'use strict';

/**
 * TOTP (`lib/auth/totp.js`) et codes de secours (`lib/auth/totpBackupCodes.js`) : fonctions
 * pures, sans base. Vecteurs officiels RFC 4226 (annexe D, HOTP) et RFC 6238 (annexe B,
 * TOTP SHA-1), vecteurs Base32 RFC 4648 (§ 10), fenêtre ±1 pas et refus du rejeu.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const totp = require('../lib/auth/totp');
const backupCodes = require('../lib/auth/totpBackupCodes');

// Secret des annexes : la chaîne ASCII « 12345678901234567890 » (20 octets).
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

test('RFC 4226, annexe D : HOTP sur 6 chiffres, compteurs 0 à 9', () => {
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];
  expected.forEach((value, counter) => {
    assert.equal(totp.hotp(RFC_SECRET, counter, 6), value, `compteur ${counter}`);
  });
});

test('RFC 6238, annexe B : TOTP SHA-1 sur 8 chiffres, pas de 30 s', () => {
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [seconds, value] of vectors) {
    assert.equal(totp.totpAt(RFC_SECRET, seconds * 1000, { digits: 8 }), value, `T = ${seconds}`);
  }
});

test('RFC 6238 : en 6 chiffres, le code est la troncature décimale du vecteur', () => {
  assert.equal(totp.totpAt(RFC_SECRET, 59 * 1000), '287082');
  assert.equal(totp.totpAt(RFC_SECRET, 1111111109 * 1000), '081804');
  assert.equal(totp.totpAt(RFC_SECRET, 1234567890 * 1000), '005924');
});

test('Base32 RFC 4648 § 10 (sans bourrage) : encodage et décodage', () => {
  const vectors = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];
  for (const [plain, encoded] of vectors) {
    assert.equal(totp.base32Encode(Buffer.from(plain, 'ascii')), encoded);
    assert.equal(totp.base32Decode(encoded).toString('ascii'), plain);
  }
  // Saisie tolérante : minuscules, espaces et bourrage acceptés.
  assert.equal(totp.base32Decode('mzxw 6ytb oi======').toString('ascii'), 'foobar');
  assert.throws(() => totp.base32Decode('MZXW1'), /Base32/);
});

test('vérification : fenêtre de ±1 pas (±30 s), refus au-delà', () => {
  const now = 1_700_000_000_000;
  const at = (offsetSeconds) => totp.totpAt(RFC_SECRET, now + offsetSeconds * 1000);
  assert.equal(totp.verifyTotp(RFC_SECRET, at(0), { nowMs: now }).ok, true);
  assert.equal(totp.verifyTotp(RFC_SECRET, at(-30), { nowMs: now }).ok, true);
  assert.equal(totp.verifyTotp(RFC_SECRET, at(30), { nowMs: now }).ok, true);
  const tooOld = totp.verifyTotp(RFC_SECRET, at(-90), { nowMs: now });
  assert.equal(tooOld.ok, false);
  assert.equal(tooOld.reason, 'invalid');
  assert.equal(totp.verifyTotp(RFC_SECRET, at(90), { nowMs: now }).ok, false);
});

test('vérification : le pas reconnu est renvoyé, un pas déjà utilisé est un rejeu', () => {
  const now = 1_700_000_000_000;
  const code = totp.totpAt(RFC_SECRET, now);
  const first = totp.verifyTotp(RFC_SECRET, code, { nowMs: now });
  assert.equal(first.ok, true);
  assert.equal(first.step, Math.floor(now / 30000));
  const replay = totp.verifyTotp(RFC_SECRET, code, { nowMs: now, afterStep: first.step });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'replay');
  // Le code suivant (pas + 1) reste accepté après ce dernier pas.
  const next = totp.totpAt(RFC_SECRET, now + 30000);
  assert.equal(
    totp.verifyTotp(RFC_SECRET, next, { nowMs: now + 30000, afterStep: first.step }).ok,
    true,
  );
});

test('vérification : formats invalides refusés sans calcul', () => {
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, '12 34 5x']) {
    const res = totp.verifyTotp(RFC_SECRET, bad, { nowMs: 1_700_000_000_000 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'format');
  }
  // Espaces et tiret tolérés (« 123 456 », « 123-456 »).
  const now = 1_700_000_000_000;
  const code = totp.totpAt(RFC_SECRET, now);
  assert.equal(
    totp.verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { nowMs: now }).ok,
    true,
  );
});

test('secret : 20 octets aléatoires ; URI otpauth conforme', () => {
  const a = totp.generateTotpSecret();
  const b = totp.generateTotpSecret();
  assert.equal(a.length, 20);
  assert.ok(!a.equals(b));
  const uri = totp.buildOtpauthUri({
    secret: RFC_SECRET,
    issuer: 'Forêt Test',
    accountName: 'prof@example.com',
  });
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, 'otpauth:');
  assert.equal(parsed.host, 'totp');
  assert.equal(decodeURIComponent(parsed.pathname), '/Forêt Test:prof@example.com');
  assert.equal(parsed.searchParams.get('secret'), totp.base32Encode(RFC_SECRET));
  assert.equal(parsed.searchParams.get('issuer'), 'Forêt Test');
  assert.equal(parsed.searchParams.get('algorithm'), 'SHA1');
  assert.equal(parsed.searchParams.get('digits'), '6');
  assert.equal(parsed.searchParams.get('period'), '30');
});

test('codes de secours : 10 codes distincts, format xxxxx-xxxxx, sans caractère ambigu', () => {
  const codes = backupCodes.generateBackupCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[2-9a-hjkmnp-z]{5}-[2-9a-hjkmnp-z]{5}$/);
    assert.ok(!/[01ilo]/.test(code));
  }
});

test('codes de secours : saisie normalisée (casse, espaces, tirets), refus sinon', () => {
  assert.equal(backupCodes.normalizeBackupCode(' AB2CD-EF3GH '), 'ab2cdef3gh');
  assert.equal(backupCodes.normalizeBackupCode('ab2cd ef3gh'), 'ab2cdef3gh');
  assert.equal(backupCodes.normalizeBackupCode('ab2cd-ef3g'), null);
  assert.equal(backupCodes.normalizeBackupCode('ab2cd-ef3g0'), null);
  assert.equal(backupCodes.normalizeBackupCode(''), null);
});

test('codes de secours : hachage bcrypt, jamais le code en clair', async () => {
  const [code] = backupCodes.generateBackupCodes(1);
  const hash = await backupCodes.hashBackupCode(code);
  assert.match(hash, /^\$2[aby]\$10\$/);
  assert.ok(!hash.includes(backupCodes.normalizeBackupCode(code)));
  assert.equal(await backupCodes.backupCodeMatches(code.toUpperCase(), hash), true);
  assert.equal(await backupCodes.backupCodeMatches('zzzzz-zzzzz', hash), false);
});
