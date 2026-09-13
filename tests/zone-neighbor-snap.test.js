const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../src/utils/zoneNeighborSnap.js');
}

test('snapPointToNeighborZones colle sur un sommet voisin dans le rayon', async () => {
  const { snapPointToNeighborZones } = await loadModule();
  const neighbors = [
    {
      id: 'z1',
      points: [
        { xp: 10, yp: 10 },
        { xp: 30, yp: 10 },
        { xp: 30, yp: 30 },
        { xp: 10, yp: 30 },
      ],
    },
  ];
  const hit = snapPointToNeighborZones({ xp: 10.4, yp: 10.2 }, neighbors, 1.5);
  assert.ok(hit);
  assert.equal(hit.kind, 'vertex');
  assert.equal(hit.zoneId, 'z1');
  assert.ok(Math.abs(hit.xp - 10) < 1e-6);
  assert.ok(Math.abs(hit.yp - 10) < 1e-6);
});

test('sharedEdgeFillBetween reprend les sommets intermédiaires du même voisin', async () => {
  const { sharedEdgeFillBetween } = await loadModule();
  const neighbors = [
    {
      id: 'z1',
      points: [
        { xp: 0, yp: 0 },
        { xp: 10, yp: 0 },
        { xp: 20, yp: 0 },
        { xp: 20, yp: 10 },
        { xp: 0, yp: 10 },
      ],
    },
  ];
  const fill = sharedEdgeFillBetween({ xp: 0.1, yp: 0 }, { xp: 19.9, yp: 0 }, neighbors, 1);
  assert.ok(fill);
  assert.equal(fill.zoneId, 'z1');
  assert.equal(fill.points.length, 1);
  assert.ok(Math.abs(fill.points[0].xp - 10) < 1e-6);
});

test('previewAlignSelectedZones fusionne les sommets proches de deux zones', async () => {
  const { previewAlignSelectedZones } = await loadModule();
  const result = previewAlignSelectedZones(
    [
      {
        id: 'a',
        points: [
          { xp: 10, yp: 10 },
          { xp: 20, yp: 10 },
          { xp: 20, yp: 20 },
        ],
      },
      {
        id: 'b',
        points: [
          { xp: 10.5, yp: 10.4 },
          { xp: 30, yp: 10 },
          { xp: 30, yp: 20 },
        ],
      },
    ],
    { thresholdPct: 2 },
  );
  assert.ok(result);
  assert.ok(result.clusterCount >= 1);
  assert.ok(result.movedVertexCount >= 1);
  assert.equal(result.aligned.length, 2);
  const a0 = result.aligned.find((z) => z.id === 'a').points[0];
  const b0 = result.aligned.find((z) => z.id === 'b').points[0];
  assert.ok(Math.abs(a0.xp - b0.xp) < 1e-6);
  assert.ok(Math.abs(a0.yp - b0.yp) < 1e-6);
});

test('filterNearbyZones ignore les polygones éloignés', async () => {
  const { normalizeNeighborZones, filterNearbyZones } = await loadModule();
  const zones = normalizeNeighborZones([
    {
      id: 'near-a',
      points: [
        { xp: 10, yp: 10 },
        { xp: 12, yp: 10 },
        { xp: 12, yp: 12 },
      ],
    },
    {
      id: 'near-b',
      points: [
        { xp: 11, yp: 11 },
        { xp: 13, yp: 11 },
        { xp: 13, yp: 13 },
      ],
    },
    {
      id: 'far',
      points: [
        { xp: 80, yp: 80 },
        { xp: 90, yp: 80 },
        { xp: 90, yp: 90 },
      ],
    },
  ]);
  const nearby = filterNearbyZones(zones, 2);
  assert.deepEqual(nearby.map((z) => z.id).sort(), ['near-a', 'near-b']);
});
