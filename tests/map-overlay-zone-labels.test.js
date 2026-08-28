const test = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../src/utils/mapOverlayZoneLabels.js');
}

test('polygonAreaAbs calcule une aire positive', async () => {
  const { polygonAreaAbs } = await load();
  const area = polygonAreaAbs([
    { cx: 0, cy: 0 },
    { cx: 100, cy: 0 },
    { cx: 100, cy: 50 },
  ]);
  assert.strictEqual(area, 2500);
});

test('shouldShowZoneNameLabel masque le nom sur une zone minuscule', async () => {
  const { shouldShowZoneNameLabel } = await load();
  const pts = [
    { xp: 0, yp: 0 },
    { xp: 2, yp: 0 },
    { xp: 2, yp: 2 },
  ];
  assert.equal(shouldShowZoneNameLabel({ pts, iw: 200, ih: 100, inv: 1, labelFontPx: 14 }), false);
});

test('shouldShowZoneNameLabel affiche le nom sur une zone large', async () => {
  const { shouldShowZoneNameLabel } = await load();
  const pts = [
    { xp: 0, yp: 0 },
    { xp: 50, yp: 0 },
    { xp: 50, yp: 50 },
  ];
  assert.equal(shouldShowZoneNameLabel({ pts, iw: 200, ih: 100, inv: 1, labelFontPx: 12 }), true);
});

test('zoneLabelMaxTextLengthWorld suit inv', async () => {
  const { zoneLabelMaxTextLengthWorld } = await load();
  assert.ok(zoneLabelMaxTextLengthWorld(2) > zoneLabelMaxTextLengthWorld(1));
});
