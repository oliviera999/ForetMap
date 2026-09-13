import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  nextRouteIndex,
  placesFromZonesAndMarkers,
  resolveRouteSteps,
  routeEntryFocusPct,
  routeStepTitle,
} from '../src/shared/map-routes/mapRouteSteps.js';

describe('mapRouteSteps', () => {
  it('résout les étapes présentes et écarte les lieux absents', () => {
    const places = placesFromZonesAndMarkers(
      [{ id: 'z1', name: 'Clairière' }],
      [{ id: 'm1', label: 'Banc' }],
    );
    const route = {
      steps: [
        { target_type: 'zone', target_id: 'z1', step_title: 'Départ' },
        { target_type: 'marker', target_id: 'gone' },
        { target_type: 'marker', target_id: 'm1', step_text: 'Pause' },
      ],
    };
    const resolved = resolveRouteSteps(route, places);
    assert.equal(resolved.length, 2);
    assert.equal(resolved[0].number, 1);
    assert.equal(routeStepTitle(resolved[0]), 'Départ');
    assert.equal(routeStepTitle(resolved[1]), 'Banc');
  });

  it('borne l’index sans boucler', () => {
    assert.equal(nextRouteIndex(0, 3, 0), 0);
    assert.equal(nextRouteIndex(2, 3, 0), 2);
    assert.equal(nextRouteIndex(5, 3, 0), 2);
    assert.equal(nextRouteIndex(-1, 3, 0), 0);
  });

  it('routeEntryFocusPct centre un repère ou une zone', () => {
    assert.deepEqual(
      routeEntryFocusPct({
        place: { kind: 'marker', x_pct: 12, y_pct: 34 },
      }),
      { xp: 12, yp: 34 },
    );
    assert.deepEqual(
      routeEntryFocusPct({
        place: {
          kind: 'zone',
          points: [
            { xp: 0, yp: 0 },
            { xp: 20, yp: 0 },
            { xp: 20, yp: 20 },
          ],
        },
      }),
      { xp: 40 / 3, yp: 20 / 3 },
    );
    assert.equal(routeEntryFocusPct(null), null);
  });
});
