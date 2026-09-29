const test = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../src/utils/mapOverlayZoneLabels.js');
}

test('clampZoneLabelMinSideFactor borne et arrondit', async () => {
  const { clampZoneLabelMinSideFactor } = await load();
  assert.strictEqual(clampZoneLabelMinSideFactor(undefined), 2.5);
  assert.strictEqual(clampZoneLabelMinSideFactor(2.55), 2.6);
  assert.strictEqual(clampZoneLabelMinSideFactor(0.5), 1);
  assert.strictEqual(clampZoneLabelMinSideFactor(9), 6);
});

test('le masquage par surface a disparu : toutes les cartes passent par l’anti-chevauchement', async () => {
  const mod = await load();
  assert.strictEqual(mod.shouldShowZoneNameLabel, undefined);
  assert.strictEqual(mod.shouldShowZoneEmojiLabel, undefined);
});

test('chasse moyenne : même valeur que le moteur de collisions', async () => {
  const { MAP_OVERLAY_LABEL_AVG_CHAR_EM } = await load();
  const { AVG_CHAR_WIDTH_RATIO } =
    await import('../src/shared/pct-map/mapOverlayLabelCollision.js');
  assert.strictEqual(MAP_OVERLAY_LABEL_AVG_CHAR_EM, AVG_CHAR_WIDTH_RATIO);
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

test('fitOverlayLabelToWidth : un nom court reste tel quel (pas de textLength imposé)', async () => {
  const { fitOverlayLabelToWidth } = await load();
  const fit = fitOverlayLabelToWidth({ text: 'Mare', fontSize: 14, maxWidth: 96 });
  assert.deepStrictEqual(fit, { text: 'Mare', fontSize: 14, truncated: false });
});

test('fitOverlayLabelToWidth : un nom un peu long est réduit sans déformation des glyphes', async () => {
  const { fitOverlayLabelToWidth } = await load();
  // 13 caractères × 14px × 0,55 = 100,1 > 96 → réduction bornée, texte intact.
  const fit = fitOverlayLabelToWidth({ text: 'Verger commun', fontSize: 14, maxWidth: 96 });
  assert.strictEqual(fit.text, 'Verger commun');
  assert.ok(fit.fontSize < 14 && fit.fontSize >= 14 * 0.8);
  assert.strictEqual(fit.truncated, false);
});

test('fitOverlayLabelToWidth : un nom très long est tronqué avec « … » à la taille plancher', async () => {
  const { fitOverlayLabelToWidth } = await load();
  const fit = fitOverlayLabelToWidth({
    text: 'Un nom de zone vraiment interminable',
    fontSize: 14,
    maxWidth: 96,
  });
  assert.ok(fit.truncated);
  assert.ok(fit.text.endsWith('…'));
  assert.ok(Math.abs(fit.fontSize - 14 * 0.8) < 1e-9);
  // La largeur estimée du texte tronqué tient dans la largeur cible.
  const width = Array.from(fit.text).length * fit.fontSize * 0.55;
  assert.ok(width <= 96 + 1e-9);
});

test('fitOverlayLabelToWidth : entrées dégénérées → texte inchangé', async () => {
  const { fitOverlayLabelToWidth } = await load();
  assert.deepStrictEqual(fitOverlayLabelToWidth({ text: '', fontSize: 14, maxWidth: 96 }), {
    text: '',
    fontSize: 14,
    truncated: false,
  });
  assert.deepStrictEqual(fitOverlayLabelToWidth({ text: 'Mare', fontSize: 0, maxWidth: 96 }), {
    text: 'Mare',
    fontSize: 0,
    truncated: false,
  });
});
