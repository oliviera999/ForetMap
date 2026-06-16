'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

test('findZoneTriggeredOnMove: entrée dans une zone', async () => {
  const { findZoneTriggeredOnMove } = await import('../src/utils/glZoneContentDetect.js');
  const zones = [
    {
      id: 1,
      label: 'Clairière',
      popoverMarkdown: 'Bienvenue',
      points: [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 40 },
        { x: 10, y: 40 },
      ],
    },
  ];
  const triggered = findZoneTriggeredOnMove({ xp: 5, yp: 5 }, { xp: 25, yp: 25 }, zones);
  assert.strictEqual(triggered?.id, 1);
});

test("findZoneTriggeredOnMove: traversée sans s'arrêter", async () => {
  const { findZoneTriggeredOnMove } = await import('../src/utils/glZoneContentDetect.js');
  const zones = [
    {
      id: 2,
      popoverMarkdown: 'Passage',
      points: [
        { x: 30, y: 30 },
        { x: 70, y: 30 },
        { x: 70, y: 70 },
        { x: 30, y: 70 },
      ],
    },
  ];
  const triggered = findZoneTriggeredOnMove({ xp: 10, yp: 50 }, { xp: 90, yp: 50 }, zones);
  assert.strictEqual(triggered?.id, 2);
});

test("findZoneTriggeredOnMove: pas de re-déclenchement à l'intérieur", async () => {
  const { findZoneTriggeredOnMove } = await import('../src/utils/glZoneContentDetect.js');
  const zones = [
    {
      id: 3,
      popoverMarkdown: 'Dedans',
      points: [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 40 },
        { x: 10, y: 40 },
      ],
    },
  ];
  const triggered = findZoneTriggeredOnMove({ xp: 20, yp: 20 }, { xp: 30, yp: 30 }, zones);
  assert.strictEqual(triggered, null);
});
