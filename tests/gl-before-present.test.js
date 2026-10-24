'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

describe('awaitBeforePresent', () => {
  it('ne bloque pas si beforePresent ne se résout jamais', async () => {
    const mod = await import(
      pathToFileURL(path.join(__dirname, '../src/gl/utils/glBeforePresent.js')).href
    );
    const started = Date.now();
    await mod.awaitBeforePresent(
      () => new Promise(() => {}),
      { zoneId: 'zf-p1-01' },
      { timeoutMs: 40 },
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 35, `délai trop court (${elapsed} ms)`);
    assert.ok(elapsed < 500, `délai trop long (${elapsed} ms)`);
  });

  it('se résout dès que beforePresent termine', async () => {
    const mod = await import(
      pathToFileURL(path.join(__dirname, '../src/gl/utils/glBeforePresent.js')).href
    );
    const started = Date.now();
    await mod.awaitBeforePresent(
      () => Promise.resolve(),
      { zoneId: 'zf-p1-01' },
      { timeoutMs: 2000 },
    );
    assert.ok(Date.now() - started < 200);
  });

  it('ignore une absence de callback', async () => {
    const mod = await import(
      pathToFileURL(path.join(__dirname, '../src/gl/utils/glBeforePresent.js')).href
    );
    await mod.awaitBeforePresent(null, { zoneId: 'zf-p1-01' });
  });
});
