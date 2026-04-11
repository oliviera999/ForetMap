'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildVisitMascotHintPayload } = require('../lib/visitMascotDiagnostics');

describe('visitMascotDiagnostics.buildVisitMascotHintPayload', () => {
  it('agrège par carte et calcule mascotWouldRenderHint', () => {
    const maps = ['foret', 'n3'];
    const zones = [{ map_id: 'foret', rows_total: 2, rows_public_api: 1 }];
    const markers = [{ map_id: 'n3', rows_total: 1, rows_public_api: 1 }];
    const tutos = [{ map_id: 'foret', tutorial_rows_active: 0 }];
    const out = buildVisitMascotHintPayload(maps, zones, markers, tutos);
    assert.strictEqual(out.length, 2);
    const f = out.find((r) => r.map_id === 'foret');
    const n = out.find((r) => r.map_id === 'n3');
    assert.strictEqual(f.visitZonesInPublicApi, 1);
    assert.strictEqual(f.visitMarkersInPublicApi, 0);
    assert.strictEqual(f.visitTutorialsForContentApi, 0);
    assert.strictEqual(f.mascotWouldRenderHint, true);
    assert.strictEqual(n.visitZonesInPublicApi, 0);
    assert.strictEqual(n.visitMarkersInPublicApi, 1);
    assert.strictEqual(n.mascotWouldRenderHint, true);
  });

  it('mascotte false si tout à zéro pour une carte', () => {
    const maps = ['vide'];
    const out = buildVisitMascotHintPayload(maps, [], [], []);
    assert.strictEqual(out[0].mascotWouldRenderHint, false);
  });

  it('tutoriels seuls suffisent pour le hint', () => {
    const maps = ['foret'];
    const out = buildVisitMascotHintPayload(maps, [], [], [{ map_id: 'foret', tutorial_rows_active: 2 }]);
    assert.strictEqual(out[0].visitTutorialsForContentApi, 2);
    assert.strictEqual(out[0].mascotWouldRenderHint, true);
  });
});
