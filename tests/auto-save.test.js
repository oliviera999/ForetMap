import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const hookUrl = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), '../src/shared/hooks/useDebouncedAutoSave.js'),
).href;

describe('useDebouncedAutoSave (serializeAutoSaveValue)', () => {
  test('serializeAutoSaveValue produit un JSON stable', async () => {
    const mod = await import(hookUrl);
    const a = mod.serializeAutoSaveValue({ x: 1, y: [2, 3] });
    const b = mod.serializeAutoSaveValue({ y: [2, 3], x: 1 });
    assert.notEqual(a, b);
    assert.equal(a, JSON.stringify({ x: 1, y: [2, 3] }));
  });

  test('DEFAULT_AUTO_SAVE_DEBOUNCE_MS vaut 800', async () => {
    const mod = await import(hookUrl);
    assert.equal(mod.DEFAULT_AUTO_SAVE_DEBOUNCE_MS, 800);
  });
});
