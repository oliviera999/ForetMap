'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

test('glZoneAtPct: chevauchement — plus petite zone avec musique', async () => {
  const { pickZoneAtPct } = await import('../src/gl/utils/glZoneAtPct.js');
  const zones = [
    {
      id: 1,
      label: 'Grande',
      musicUrl: '/uploads/media-library/audio/2026/05/big.mp3',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    },
    {
      id: 2,
      label: 'Petite',
      musicUrl: '/uploads/media-library/audio/2026/05/small.mp3',
      points: [
        { x: 30, y: 30 },
        { x: 70, y: 30 },
        { x: 70, y: 70 },
        { x: 30, y: 70 },
      ],
    },
    {
      id: 3,
      label: 'Sans musique',
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 15, y: 20 },
      ],
    },
  ];
  const picked = pickZoneAtPct(zones, 50, 50);
  assert.strictEqual(picked?.id, 2);
  assert.strictEqual(picked?.musicUrl, '/uploads/media-library/audio/2026/05/small.mp3');

  const outer = pickZoneAtPct(zones, 5, 5);
  assert.strictEqual(outer?.id, 1);
});

test('glZoneAtPct: zone sans musique ignorée hors chevauchement musical', async () => {
  const { pickZoneAtPct } = await import('../src/gl/utils/glZoneAtPct.js');
  const zones = [
    {
      id: 10,
      label: 'Muette',
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 25, y: 50 },
      ],
    },
  ];
  assert.strictEqual(pickZoneAtPct(zones, 20, 20), null);
});

test('glZoneAtPct: playlist musicUrls sur zone active', async () => {
  const { pickZoneAtPct, zoneMusicUrls } = await import('../src/gl/utils/glZoneAtPct.js');
  const urls = [
    '/uploads/media-library/audio/2026/05/a.mp3',
    '/uploads/media-library/audio/2026/05/b.mp3',
  ];
  const zones = [
    {
      id: 4,
      label: 'Playlist',
      musicUrls: urls,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    },
  ];
  const picked = pickZoneAtPct(zones, 40, 40);
  assert.deepStrictEqual(picked?.musicUrls, urls);
  assert.strictEqual(picked?.musicUrl, urls[0]);
  assert.deepStrictEqual(zoneMusicUrls(zones[0]), urls);
});

test('glZoneAtPct: detectZoneMusicOnTeamMove ignore déplacement intra-zone et changement équipe observée', async () => {
  const { detectZoneMusicOnTeamMove } = await import('../src/gl/utils/glZoneAtPct.js');
  const zones = [
    {
      id: 1,
      label: 'Zone A',
      musicUrl: '/uploads/media-library/audio/2026/05/a.mp3',
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ],
    },
    {
      id: 2,
      label: 'Zone B',
      musicUrl: '/uploads/media-library/audio/2026/05/b.mp3',
      points: [
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
      ],
    },
  ];

  assert.strictEqual(
    detectZoneMusicOnTeamMove({ xp: 10, yp: 10 }, { xp: 20, yp: 15 }, zones),
    null,
  );
  assert.strictEqual(
    detectZoneMusicOnTeamMove({ xp: 10, yp: 10 }, { xp: 10, yp: 10 }, zones),
    null,
  );
  assert.strictEqual(
    detectZoneMusicOnTeamMove({ xp: 10, yp: 10 }, { xp: 75, yp: 25 }, zones)?.id,
    2,
  );
});
