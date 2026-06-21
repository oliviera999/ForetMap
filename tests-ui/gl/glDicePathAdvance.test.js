import { describe, test, expect } from 'vitest';
import { resolveDicePathAdvance } from '../../src/gl/utils/glDicePathAdvance.js';

const questionMarker = {
  id: 2,
  label: 'Quiz',
  x_pct: 60,
  y_pct: 40,
  order_index: 2,
  event_type: 'question',
  event_config: { version: 1, question: { mode: 'fixed', fixedQuestionCode: 'QCM0001' } },
};

describe('resolveDicePathAdvance', () => {
  test('retourne la cible et shouldPresent pour un repère QCM', () => {
    const plan = resolveDicePathAdvance({
      markers: [{ id: 1, label: 'Départ', x_pct: 10, y_pct: 70, order_index: 1 }, questionMarker],
      team: { id: 1, position_marker_id: 1 },
      roll: { total: 1 },
      boardMovement: { isNumberedPath: true, startIndex: 0 },
      teamId: 1,
      markerArrivalEnabled: true,
    });
    expect(plan?.marker?.id).toBe(2);
    expect(plan?.shouldPresent).toBe(true);
    expect(plan?.waypoints?.map((m) => m.id)).toEqual([2]);
  });

  test('ne planifie pas de présentation si markerArrivalEnabled=false', () => {
    const plan = resolveDicePathAdvance({
      markers: [{ id: 1, label: 'Départ', x_pct: 10, y_pct: 70, order_index: 1 }, questionMarker],
      team: { id: 1, position_marker_id: 1 },
      roll: { total: 1 },
      boardMovement: { isNumberedPath: true, startIndex: 0 },
      teamId: 1,
      markerArrivalEnabled: false,
    });
    expect(plan?.shouldPresent).toBe(false);
  });

  test('retourne null hors chemin numéroté', () => {
    expect(
      resolveDicePathAdvance({
        markers: [],
        team: null,
        roll: { total: 3 },
        boardMovement: { isNumberedPath: false },
        teamId: 1,
      }),
    ).toBeNull();
  });
});
