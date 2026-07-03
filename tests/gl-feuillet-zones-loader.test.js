'use strict';

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

function loadZonesJson() {
  const filePath = path.join(__dirname, '..', 'src', 'gl', 'data', 'zones_feuillets.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('glFeuilletZones: charge 24 zones valides', async () => {
  const { loadAndValidateFeuilletZones } = await import('../src/gl/utils/glFeuilletZones.js');
  const { zones, errors } = loadAndValidateFeuilletZones(loadZonesJson());
  assert.strictEqual(errors.length, 0);
  assert.strictEqual(zones.length, 24);
});

test('glFeuilletZones: fail-soft zone invalide', async () => {
  const { loadAndValidateFeuilletZones } = await import('../src/gl/utils/glFeuilletZones.js');
  const { zones, errors } = loadAndValidateFeuilletZones({
    zones: [
      {
        zone_id: 'bad-1',
        plateau: 9,
        feuillet_code: 'x',
        titre: 'x',
        centre: [0.5, 0.5],
        polygone: [
          [0.4, 0.4],
          [0.6, 0.4],
          [0.5, 0.6],
        ],
        declenchement: 'traversee_unique',
        cout_gemme: 0,
        gain_coeur: 0,
        popover: 'test',
      },
      {
        zone_id: 'ok-1',
        plateau: 1,
        feuillet_code: 'ep-I-01',
        titre: 'OK',
        centre: [0.5, 0.5],
        polygone: [
          [0.4, 0.4],
          [0.6, 0.4],
          [0.5, 0.6],
        ],
        declenchement: 'traversee_unique',
        cout_gemme: 1,
        gain_coeur: 1,
        popover: 'texte',
      },
    ],
  });
  assert.ok(errors.length >= 1);
  assert.strictEqual(zones.length, 1);
  assert.strictEqual(zones[0].zone_id, 'ok-1');
});

test('glFeuilletZones: toRuntimeZone en coords pct', async () => {
  const { toRuntimeFeuilletZone } = await import('../src/gl/utils/glFeuilletZones.js');
  const runtime = toRuntimeFeuilletZone({
    zone_id: 'zf-p1-01',
    plateau: 1,
    feuillet_code: 'ep-I-01',
    titre: 'Test',
    centre: [0.5, 0.25],
    polygone: [
      [0.4, 0.2],
      [0.6, 0.2],
      [0.5, 0.3],
    ],
    declenchement: 'traversee_unique',
    cout_gemme: 1,
    gain_coeur: 1,
    popover: 'Texte',
  });
  assert.strictEqual(runtime.zoneId, 'zf-p1-01');
  assert.strictEqual(runtime.centreXp, 50);
  assert.strictEqual(runtime.centreYp, 25);
  assert.strictEqual(runtime.points[0].x, 40);
});
