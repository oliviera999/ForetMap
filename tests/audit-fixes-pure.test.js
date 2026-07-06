'use strict';

// Tests unitaires (sans BDD) des correctifs d'audit à logique pure :
// - validation d'hôte du lien de réinitialisation (anti password-reset poisoning)
// - détection binaire du conteneur MP4 (offset « ftyp » corrigé)

const test = require('node:test');
const assert = require('node:assert/strict');

const { detectMimeFromBuffer } = require('../lib/mediaLibrary');

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test('getGlPasswordResetBaseUrl: env prioritaire', () => {
  withEnv({ GL_PASSWORD_RESET_BASE_URL: 'https://gl.example.org/' }, () => {
    // require après avoir posé l'env (module lit process.env à l'appel, pas au chargement)
    const { getGlPasswordResetBaseUrl } = require('../lib/passwordReset');
    const req = { protocol: 'https', get: () => 'attacker.evil' };
    assert.equal(getGlPasswordResetBaseUrl(req), 'https://gl.example.org');
  });
});

test('getGlPasswordResetBaseUrl: Host forgé rejeté en prod, repli sur base configurée', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      GL_PASSWORD_RESET_BASE_URL: undefined,
      GL_FRONTEND_ORIGIN: 'https://gl.example.org',
      PASSWORD_RESET_BASE_URL: 'https://foret.example.org',
      FRONTEND_ORIGIN: undefined,
      FRONTEND_ORIGINS: undefined,
    },
    () => {
      const { getGlPasswordResetBaseUrl } = require('../lib/passwordReset');
      const forged = { protocol: 'https', get: () => 'attacker.evil' };
      // GL_FRONTEND_ORIGIN est posé -> il est utilisé directement (fromEnv), Host ignoré.
      assert.equal(getGlPasswordResetBaseUrl(forged), 'https://gl.example.org');
    },
  );
});

test('getGlPasswordResetBaseUrl: sans base GL configurée, Host non autorisé -> repli, Host autorisé -> accepté', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      GL_PASSWORD_RESET_BASE_URL: undefined,
      GL_FRONTEND_ORIGIN: undefined,
      PASSWORD_RESET_BASE_URL: 'https://foret.example.org',
      FRONTEND_ORIGINS: 'https://gl.example.org,https://foret.example.org',
      FRONTEND_ORIGIN: undefined,
    },
    () => {
      const { getGlPasswordResetBaseUrl } = require('../lib/passwordReset');
      const forged = { protocol: 'https', get: () => 'attacker.evil' };
      // Host forgé -> non présent dans les origines autorisées -> repli base foret.
      assert.equal(getGlPasswordResetBaseUrl(forged), 'https://foret.example.org');
      const legit = { protocol: 'https', get: () => 'gl.example.org' };
      // Host correspondant à une origine configurée -> accepté.
      assert.equal(getGlPasswordResetBaseUrl(legit), 'https://gl.example.org');
    },
  );
});

test('detectMimeFromBuffer: MP4 détecté avec « ftyp » à l’offset 4 (pas 0)', () => {
  // Box ftyp : [taille sur 4 octets][ftyp][major brand...]
  const mp4 = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypmp42', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
  assert.equal(detectMimeFromBuffer(mp4, 'clip'), 'video/mp4');
});

test('detectMimeFromBuffer: « ftyp » à l’offset 0 n’est PAS un MP4 valide', () => {
  const bogus = Buffer.concat([Buffer.from('ftyp', 'ascii'), Buffer.alloc(8)]);
  // Pas de signature valide ni extension connue -> null.
  assert.equal(detectMimeFromBuffer(bogus, 'x.bin'), null);
});
