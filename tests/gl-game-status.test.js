'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

test('formatGameStatus et gameStatusTone', async () => {
  const mod = await import('../src/gl/utils/glGameStatus.js');
  assert.strictEqual(mod.formatGameStatus('draft'), 'Brouillon');
  assert.strictEqual(mod.formatGameStatus('live'), 'En cours');
  assert.strictEqual(mod.gameStatusTone('live'), 'success');
});

test('règles d’édition partie', async () => {
  const mod = await import('../src/gl/utils/glGameStatus.js');
  assert.strictEqual(mod.canEditGameChapter('draft'), true);
  assert.strictEqual(mod.canEditGameChapter('paused'), true);
  assert.strictEqual(mod.canEditGameChapter('live'), false);
  assert.strictEqual(mod.canEditGameClass('draft'), true);
  assert.strictEqual(mod.canEditGameClass('paused'), false);
  assert.strictEqual(mod.gameLifecycleAction('live', 'pause'), true);
  assert.strictEqual(mod.gameLifecycleAction('draft', 'end'), false);
});
