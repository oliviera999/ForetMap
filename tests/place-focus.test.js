'use strict';

/**
 * « Zoom sur le lieu avant sa fiche » : réglages déclarés (`ui.place_focus.*`), cible de cadrage
 * (`placeFocusTarget`) et résolveurs client (ForetMap, plateau GL) — sans base.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { PLACE_FOCUS_SETTINGS } = require('../lib/settings/placeFocus');
const { SETTINGS_REGISTRY } = require('../lib/settings');
const { PUBLIC_SETTINGS_SCOPES } = require('../lib/publicSettingsScope');

function importSrc(rel) {
  return import(pathToFileURL(path.join(__dirname, '..', rel)).href);
}

test('réglages ui.place_focus.* : publics, défauts et bornes', () => {
  const expected = {
    'ui.place_focus.work_enabled': { type: 'boolean', default: true },
    'ui.place_focus.visit_enabled': { type: 'boolean', default: true },
    'ui.place_focus.plan_enabled': { type: 'boolean', default: true },
    'ui.place_focus.duration_ms': { type: 'number', default: 350, min: 150, max: 800 },
    'ui.place_focus.max_zoom_percent': { type: 'number', default: 400, min: 150, max: 800 },
    'ui.place_focus.restore_on_close': { type: 'boolean', default: true },
    'ui.place_focus.fx_emoji_work': { type: 'boolean', default: true },
    'ui.place_focus.fx_emoji_visit': { type: 'boolean', default: true },
    'ui.place_focus.fx_emoji_plan': { type: 'boolean', default: true },
    'ui.place_focus.fx_spotlight_work': { type: 'boolean', default: true },
    'ui.place_focus.fx_spotlight_visit': { type: 'boolean', default: true },
    'ui.place_focus.fx_spotlight_plan': { type: 'boolean', default: true },
  };
  assert.deepEqual(Object.keys(PLACE_FOCUS_SETTINGS).sort(), Object.keys(expected).sort());
  for (const [key, want] of Object.entries(expected)) {
    const meta = SETTINGS_REGISTRY[key];
    assert.ok(meta, key);
    assert.equal(meta.scope, 'public', key);
    assert.equal(meta.type, want.type, key);
    assert.equal(meta.default, want.default, key);
    if (want.min != null) assert.equal(meta.min, want.min, key);
    if (want.max != null) assert.equal(meta.max, want.max, key);
  }
});

test('les réglages ui.place_focus.* sont servis au produit ForetMap', () => {
  assert.ok(PUBLIC_SETTINGS_SCOPES.foret.includes('ui.place_focus'));
});

test('placeFocusTarget : zone cadrée sur son contour, plafonnée par le réglage', async () => {
  const { placeFocusTarget } = await importSrc('src/shared/pct-map/placeFocusTarget.js');
  const zone = {
    kind: 'zone',
    points: JSON.stringify([
      { xp: 10, yp: 10 },
      { xp: 30, yp: 10 },
      { xp: 30, yp: 40 },
    ]),
  };
  const t = placeFocusTarget(zone, { maxZoom: 3 });
  assert.equal(t.kind, 'zone');
  assert.equal(t.points.length, 3);
  assert.equal(t.maxZoom, 3);

  const glZone = {
    points: [
      { xp: 1, yp: 2 },
      { xp: 3, yp: 4 },
      { xp: 5, yp: 1 },
    ],
  };
  assert.equal(placeFocusTarget(glZone).kind, 'zone');
});

test('placeFocusTarget : repère centré à zoom fixe, jamais au-delà du plafond', async () => {
  const { placeFocusTarget, PLACE_FOCUS_MARKER_ZOOM } = await importSrc(
    'src/shared/pct-map/placeFocusTarget.js',
  );
  const marker = { kind: 'marker', x_pct: 42, y_pct: 17 };
  const t = placeFocusTarget(marker, { maxZoom: 4 });
  assert.equal(t.kind, 'marker');
  assert.deepEqual(t.points, [{ xp: 42, yp: 17 }]);
  assert.equal(t.maxZoom, PLACE_FOCUS_MARKER_ZOOM);
  assert.equal(placeFocusTarget(marker, { maxZoom: 1.5 }).maxZoom, 1.5);
  // Repère GL : coordonnées en chaîne, sans `kind`.
  assert.deepEqual(placeFocusTarget({ x_pct: '5', y_pct: '6' }).points, [{ xp: 5, yp: 6 }]);
});

test('placeFocusTarget : sans géométrie exploitable, aucune cible', async () => {
  const { placeFocusTarget } = await importSrc('src/shared/pct-map/placeFocusTarget.js');
  assert.equal(placeFocusTarget(null), null);
  assert.equal(placeFocusTarget({ kind: 'zone', points: '[]' }), null);
  assert.equal(placeFocusTarget({ kind: 'marker', x_pct: 'abc' }), null);
});

test('resolvePlaceFocusSettings : défauts, bornes, zoom en multiple', async () => {
  const { resolvePlaceFocusSettings, PLACE_FOCUS_SETTINGS_DEFAULTS } = await importSrc(
    'src/shared/pct-map/placeFocusSettings.js',
  );
  assert.deepEqual(resolvePlaceFocusSettings(undefined), PLACE_FOCUS_SETTINGS_DEFAULTS);
  const r = resolvePlaceFocusSettings({
    work_enabled: false,
    visit_enabled: true,
    plan_enabled: false,
    duration_ms: 5000,
    max_zoom_percent: 250,
    restore_on_close: false,
  });
  assert.equal(r.workEnabled, false);
  assert.equal(r.visitEnabled, true);
  assert.equal(r.planEnabled, false);
  assert.equal(r.durationMs, 800);
  assert.equal(r.maxZoom, 2.5);
  assert.equal(r.restoreOnClose, false);
  assert.deepEqual(r.fx.work, { emoji: true, spotlight: true });
});

test('resolvePlaceFocusSettings : effets visuels réglés par surface', async () => {
  const { resolvePlaceFocusSettings } = await importSrc('src/shared/pct-map/placeFocusSettings.js');
  const r = resolvePlaceFocusSettings({
    fx_emoji_work: false,
    fx_spotlight_visit: '0',
    fx_emoji_plan: 'true',
    fx_spotlight_plan: 'n’importe quoi',
  });
  assert.deepEqual(r.fx.work, { emoji: false, spotlight: true });
  assert.deepEqual(r.fx.visit, { emoji: true, spotlight: false });
  assert.deepEqual(r.fx.plan, { emoji: true, spotlight: true });
});

test('placeFocusBurstScales : l’emoji s’envole au zoom, atterrit au retour (caméra compensée)', async () => {
  const { placeFocusBurstScales } = await importSrc('src/shared/pct-map/placeFocusFxGeometry.js');
  const zoomIn = placeFocusBurstScales({ phase: 'in', fromScale: 1, toScale: 3 });
  assert.equal(zoomIn.k0, 1);
  // 1,8 × 3 = 5,4 fois sa taille à l'écran, rapportés à l'échelle d'arrivée.
  assert.ok(Math.abs(zoomIn.k1 * 3 - 5.4) < 1e-9);
  const zoomOut = placeFocusBurstScales({ phase: 'out', fromScale: 3, toScale: 1 });
  assert.ok(Math.abs(zoomOut.k0 * 3 - 5.4) < 1e-9);
  assert.equal(zoomOut.k1, 1);
  // Bornes : jamais moins de 4 fois, jamais plus de 9 fois la taille normale.
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(placeFocusBurstScales({ phase: 'in', fromScale: 1, toScale: 1.1 }).k1 * 1.1, 4));
  assert.ok(near(placeFocusBurstScales({ phase: 'in', fromScale: 1, toScale: 20 }).k1 * 20, 9));
  // Échelles illisibles : repli sur 1, pas de NaN.
  const bad = placeFocusBurstScales({ phase: 'in', fromScale: 0, toScale: NaN });
  assert.ok(Number.isFinite(bad.k0) && Number.isFinite(bad.k1));
});

test('placeFocusFxAnchor : centroïde d’une zone, point d’un repère', async () => {
  const { placeFocusFxAnchor } = await importSrc('src/shared/pct-map/placeFocusFxGeometry.js');
  const square = {
    kind: 'zone',
    points: [
      { xp: 10, yp: 10 },
      { xp: 30, yp: 10 },
      { xp: 30, yp: 30 },
      { xp: 10, yp: 30 },
    ],
  };
  const a = placeFocusFxAnchor(square);
  assert.ok(Math.abs(a.xp - 20) < 1e-9 && Math.abs(a.yp - 20) < 1e-9);
  assert.deepEqual(placeFocusFxAnchor({ kind: 'marker', x_pct: 4, y_pct: 5 }), { xp: 4, yp: 5 });
  assert.equal(placeFocusFxAnchor(null), null);
});

test('placeFocusSpotlightPath : voile percé à la forme de la zone, ou en cercle autour du repère', async () => {
  const { placeFocusSpotlightPath } = await importSrc('src/shared/pct-map/placeFocusFxGeometry.js');
  const zone = {
    kind: 'zone',
    points: [
      { xp: 10, yp: 10 },
      { xp: 30, yp: 10 },
      { xp: 30, yp: 40 },
    ],
  };
  const box = { fitWidth: 1000, fitHeight: 500, holeScale: 2 };
  assert.equal(placeFocusSpotlightPath(zone, box), 'M0 0H100V100H0ZM10 10L30 10L30 40Z');
  const ring = placeFocusSpotlightPath({ kind: 'marker', x_pct: 50, y_pct: 50 }, box);
  assert.ok(ring.startsWith('M0 0H100V100H0ZM'));
  // 56 px à l'écran à l'échelle 2 = 28 px du calque : 2,8 % en largeur, 5,6 % en hauteur.
  assert.ok(ring.includes('a2.8 5.6 0 1 0 5.6 0'));
  assert.equal(placeFocusSpotlightPath(null, box), '');
});

test('placeFocusSparkles : couronne déterministe', async () => {
  const { placeFocusSparkles } = await importSrc('src/shared/pct-map/placeFocusFxGeometry.js');
  const a = placeFocusSparkles(10);
  assert.equal(a.length, 10);
  assert.deepEqual(a, placeFocusSparkles(10));
  assert.equal(new Set(a.map((s) => s.angleDeg)).size, 10);
});

test('resolveBoardFocusSettings (GL) : clés camelCase ou pointées, bornes', async () => {
  const { resolveBoardFocusSettings, BOARD_FOCUS_DEFAULTS } = await importSrc(
    'src/gl/utils/glBoardFocus.js',
  );
  assert.deepEqual(resolveBoardFocusSettings({}), { ...BOARD_FOCUS_DEFAULTS });
  assert.deepEqual(
    resolveBoardFocusSettings({
      boardFocusEnabled: false,
      boardFocusDurationMs: 10,
      boardFocusRestoreOnClose: 'false',
    }),
    {
      enabled: false,
      durationMs: 150,
      restoreOnClose: false,
      fx: { emoji: true, spotlight: true, sparkles: true },
    },
  );
  assert.deepEqual(
    resolveBoardFocusSettings({
      boardFocusFxEmoji: false,
      'gameplay.board_focus_fx_sparkles': 'false',
    }).fx,
    { emoji: false, spotlight: true, sparkles: false },
  );
  assert.equal(
    resolveBoardFocusSettings({ 'gameplay.board_focus_duration_ms': '500' }).durationMs,
    500,
  );
});
