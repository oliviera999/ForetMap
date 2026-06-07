'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeIntroConfig,
  buildPublicIntroPayload,
  loadDefaultIntroConfig,
} = require('../lib/glIntro');

test('normalizeIntroConfig conserve 9 scènes et les voix autorisées', () => {
  const defaults = loadDefaultIntroConfig();
  const normalized = normalizeIntroConfig(defaults);
  assert.strictEqual(normalized.scenes.length, 9);
  assert.strictEqual(normalized.scenes[0].id, 'boite');
  assert.ok(normalized.scenes.every((scene) => ['copiste', 'selene', 'passeur'].includes(scene.voice)));
});

test('buildPublicIntroPayload résout les URLs de repli', () => {
  const payload = buildPublicIntroPayload(loadDefaultIntroConfig());
  assert.strictEqual(payload.enabled, true);
  assert.ok(payload.images.boite.includes('/gl/intro/assets/img/boite.png'));
  assert.ok(payload.audio.loopUrl.includes('/gl/intro/assets/audio/loop.mp3'));
  assert.ok(Array.isArray(payload.scenes) && payload.scenes.length === 9);
});

test('normalizeIntroConfig ignore les scènes inconnues', () => {
  const normalized = normalizeIntroConfig({
    scenes: [{ id: 'invalid', voice: 'copiste', kicker: 'x', text: 'y' }],
  });
  assert.strictEqual(normalized.scenes.length, 9);
  assert.ok(!normalized.scenes.some((scene) => scene.id === 'invalid'));
});
