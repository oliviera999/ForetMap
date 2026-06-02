'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const path = require('path');

test('IMAGE_COMPRESSION_PRESETS : presets documentés', async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'image.js')).href);
  assert.ok(mod.IMAGE_COMPRESSION_PRESETS.taskLog);
  assert.ok(mod.IMAGE_COMPRESSION_PRESETS.glChapter);
  assert.equal(mod.IMAGE_COMPRESSION_PRESETS.taskLog.maxPx, 1600);
});
