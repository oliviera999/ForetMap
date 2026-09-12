import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  nextRouteIndex,
  placesFromZonesAndMarkers,
  resolveRouteSteps,
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
});
