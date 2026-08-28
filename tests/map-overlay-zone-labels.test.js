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

test('clampZoneLabelMinSideFactor borne et arrondit', async () => {
  const { clampZoneLabelMinSideFactor } = await load();
  assert.strictEqual(clampZoneLabelMinSideFactor(undefined), 2.5);
  assert.strictEqual(clampZoneLabelMinSideFactor(2.55), 2.6);
  assert.strictEqual(clampZoneLabelMinSideFactor(0.5), 1);
  assert.strictEqual(clampZoneLabelMinSideFactor(9), 6);
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

test('shouldShowZoneNameLabel : défaut 2,5 moins agressif que 4', async () => {
  const { shouldShowZoneNameLabel } = await load();
  const pts = [
    { xp: 0, yp: 0 },
    { xp: 40, yp: 0 },
    { xp: 40, yp: 40 },
  ];
  const params = { pts, iw: 200, ih: 100, inv: 1, labelFontPx: 14 };
  assert.equal(shouldShowZoneNameLabel({ ...params, minSideFactor: 4 }), false);
  assert.equal(shouldShowZoneNameLabel({ ...params, minSideFactor: 2.5 }), true);
});

test('shouldShowZoneEmojiLabel reste visible quand le nom est masqué', async () => {
  const { shouldShowZoneEmojiLabel, shouldShowZoneNameLabel } = await load();
  const pts = [
    { xp: 0, yp: 0 },
    { xp: 30, yp: 0 },
    { xp: 30, yp: 30 },
  ];
  const base = { pts, iw: 200, ih: 100, inv: 1, minSideFactor: 2.5 };
  assert.equal(shouldShowZoneNameLabel({ ...base, labelFontPx: 14 }), false);
  assert.equal(shouldShowZoneEmojiLabel({ ...base, emojiFontPx: 19 }), true);
});

test('zoneLabelMaxTextLengthWorld suit inv', async () => {
  const { zoneLabelMaxTextLengthWorld } = await load();
  assert.ok(zoneLabelMaxTextLengthWorld(2) > zoneLabelMaxTextLengthWorld(1));
});

test('resolveMapOverlayLabelLayout lit le réglage admin', async () => {
  const { resolveMapOverlayLabelLayout } = await load();
  const layout = resolveMapOverlayLabelLayout({ zone_label_min_side_factor: 3 }, { inv: 2 });
  assert.strictEqual(layout.minSideFactor, 3);
  assert.ok(layout.maxWorldLength > 96);
});
