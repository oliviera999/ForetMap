'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  targetMarkerAfterPathSteps,
  markersAlongPathSteps,
} = require('../lib/shared/glBoardPathCore');

test('targetMarkerAfterPathSteps avance et recule le long du chemin', () => {
  const markers = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const team = { position_marker_id: 2 };
  const forward = targetMarkerAfterPathSteps(markers, team, 2, 0);
  assert.strictEqual(forward.marker.id, 4);
  const backward = targetMarkerAfterPathSteps(markers, team, -1, 0);
  assert.strictEqual(backward.marker.id, 1);
});

test('markersAlongPathSteps liste les repères traversés (sens inverse inclus)', () => {
  const markers = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const team = { position_marker_id: 3 };
  const along = markersAlongPathSteps(markers, team, -2, 0);
  assert.deepStrictEqual(
    along.map((m) => m.id),
    [2, 1],
  );
});
