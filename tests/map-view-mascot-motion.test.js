import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const motionUrl = pathToFileURL(
  path.join(process.cwd(), 'src/utils/mapViewMascotMotion.js'),
).href;

describe('mapViewMascotMotion', () => {
  it('clampMapMascotPctForViewport remonte Y si trop bas sur petit viewport', async () => {
    const { clampMapMascotPctForViewport } = await import(motionUrl);
    const r = clampMapMascotPctForViewport(50, 8, 120);
    assert.ok(r.yp >= 6);
    assert.ok(r.yp > 8);
    assert.equal(r.xp, 50);
  });

  it('clampMapMascotPctForViewport laisse Y inchangé sans hauteur fit', async () => {
    const { clampMapMascotPctForViewport } = await import(motionUrl);
    const r = clampMapMascotPctForViewport(12, 88, 0);
    assert.equal(r.xp, 12);
    assert.equal(r.yp, 88);
  });
});
