'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { SETTINGS_REGISTRY } = require('../lib/settings');

const modUrl = pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'appCredits.js')).href;

test('défauts front alignés sur le registre des réglages', async () => {
  const { DEFAULT_CREDITS } = await import(modUrl);
  for (const field of ['author', 'contributor', 'message']) {
    const meta = SETTINGS_REGISTRY[`content.auth.credit_${field}`];
    assert.ok(meta, field);
    assert.equal(meta.scope, 'public', field);
    assert.equal(meta.default, DEFAULT_CREDITS[field], field);
  }
});

test('réglages absents → défauts ; chaîne vide → mention masquée ; espaces retirés', async () => {
  const { getAppCredits, DEFAULT_CREDITS } = await import(modUrl);
  assert.deepEqual(getAppCredits(null), { ...DEFAULT_CREDITS });
  assert.deepEqual(getAppCredits({ content: {} }), { ...DEFAULT_CREDITS });
  assert.deepEqual(
    getAppCredits({
      content: {
        auth: { credit_author: '  Ada  ', credit_contributor: '', credit_message: ' Bonjour ' },
      },
    }),
    { author: 'Ada', contributor: '', message: 'Bonjour' },
  );
});

test('crédits tiers : La Fresque du Climat (CC BY-NC-ND) figure dans « À propos »', async () => {
  const { THIRD_PARTY_CREDITS } = await import(modUrl);
  const fresque = THIRD_PARTY_CREDITS.find((c) => c.id === 'fresque-climat-junior');
  assert.ok(fresque);
  assert.match(fresque.title, /Fresque du Climat/);
  assert.equal(fresque.author, 'Cédric Ringenbach');
  assert.match(fresque.licenceName, /CC BY-NC-ND/);
  assert.equal(fresque.licenceUrl, 'https://fresqueduclimat.org/licence/');
});
