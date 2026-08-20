'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  detectAvatarExtension,
  detectImageExtensionFromDataUrl,
} = require('../lib/shared/dataUrlImage');
const authHelpers = require('../lib/authRouteHelpers');
const studentHelpers = require('../lib/studentRouteHelpers');
const glProfile = require('../lib/glProfile');
const plantsHelpers = require('../lib/plantsRouteHelpers');
const tutorialHelpers = require('../lib/tutorialRouteHelpers');

test('extension déduite du type MIME, jpeg normalisé en jpg', () => {
  assert.strictEqual(detectAvatarExtension('data:image/png;base64,AAAA'), 'png');
  assert.strictEqual(detectAvatarExtension('data:image/jpeg;base64,AAAA'), 'jpg');
  assert.strictEqual(detectAvatarExtension('data:image/jpg;base64,AAAA'), 'jpg');
  assert.strictEqual(detectAvatarExtension('data:image/WEBP;base64,AAAA'), 'webp');
  assert.strictEqual(detectImageExtensionFromDataUrl('data:image/avif;base64,AAAA'), 'avif');
});

test('formats hors liste refusés — dont le SVG, qui porte du script', () => {
  assert.strictEqual(detectAvatarExtension('data:image/svg+xml;base64,AAAA'), null);
  assert.strictEqual(detectImageExtensionFromDataUrl('data:image/svg+xml;base64,AAAA'), null);
  // Les avatars n'acceptent pas les formats réservés aux illustrations.
  assert.strictEqual(detectAvatarExtension('data:image/gif;base64,AAAA'), null);
  assert.strictEqual(detectImageExtensionFromDataUrl('data:image/gif;base64,AAAA'), 'gif');
});

test('entrées non exploitables : null plutôt qu’une extension inventée', () => {
  for (const value of [null, undefined, '', 'pas-une-data-url', 'data:text/html;base64,AAAA']) {
    assert.strictEqual(detectAvatarExtension(value), null);
    assert.strictEqual(detectImageExtensionFromDataUrl(value), null);
  }
});

test('les cinq modules exposent toujours le même contrôle', () => {
  // Les helpers étaient dupliqués ; leurs exports restent en place, mais pointent
  // désormais vers l'implémentation unique de lib/shared/dataUrlImage.js.
  assert.strictEqual(authHelpers.detectAvatarExtension, detectAvatarExtension);
  assert.strictEqual(studentHelpers.detectAvatarExtension, detectAvatarExtension);
  assert.strictEqual(glProfile.detectAvatarExtension, detectAvatarExtension);
  assert.strictEqual(
    plantsHelpers.detectImageExtensionFromDataUrl,
    detectImageExtensionFromDataUrl,
  );
  assert.strictEqual(
    tutorialHelpers.detectImageExtensionFromDataUrl,
    detectImageExtensionFromDataUrl,
  );
});
