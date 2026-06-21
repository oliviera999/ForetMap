import { describe, test, expect } from 'vitest';
import {
  advancePathIndex,
  buildMarkerPathNumberMap,
  resolveBoardMovementConfig,
  sortMarkersByPath,
  startMarker,
  targetMarkerAfterDice,
  teamPathIndex,
} from '../../src/shared/glBoardPathCore.js';

describe('glBoardPathCore', () => {
  test('sortMarkersByPath trie par order_index puis id', () => {
    const sorted = sortMarkersByPath([
      { id: 3, order_index: 20 },
      { id: 1, order_index: 10 },
      { id: 2, order_index: 10 },
    ]);
    expect(sorted.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  test('buildMarkerPathNumberMap numérote à partir de 0 ou 1', () => {
    const markers = [{ id: 10 }, { id: 11 }];
    const fromZero = buildMarkerPathNumberMap(markers, 0);
    expect(fromZero.get(10)).toBe(0);
    expect(fromZero.get(11)).toBe(1);
    const fromOne = buildMarkerPathNumberMap(markers, 1);
    expect(fromOne.get(10)).toBe(1);
    expect(fromOne.get(11)).toBe(2);
  });

  test('targetMarkerAfterDice avance le long du chemin', () => {
    const markers = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const teamAtStart = { position_marker_id: 1 };
    const firstRoll = targetMarkerAfterDice(markers, teamAtStart, 2, 0);
    expect(firstRoll.index).toBe(2);
    expect(firstRoll.marker.id).toBe(3);

    const teamMid = { position_marker_id: 3 };
    const capped = targetMarkerAfterDice(markers, teamMid, 5, 0);
    expect(capped.index).toBe(3);
    expect(capped.marker.id).toBe(4);
  });

  test('startMarker respecte l index de départ 0 ou 1', () => {
    const markers = [{ id: 1 }, { id: 2 }];
    expect(startMarker(markers, 0).marker.id).toBe(1);
    expect(startMarker(markers, 1).marker.id).toBe(2);
  });

  test('resolveBoardMovementConfig', () => {
    expect(resolveBoardMovementConfig({}).mode).toBe('free');
    expect(resolveBoardMovementConfig({ board_movement_mode: 'numbered_path' }).isNumberedPath).toBe(
      true,
    );
    expect(resolveBoardMovementConfig({ board_path_start_index: 1 }).startIndex).toBe(1);
  });

  test('teamPathIndex retrouve la position courante', () => {
    const markers = [{ id: 5 }, { id: 6 }];
    expect(teamPathIndex({ position_marker_id: 6 }, markers)).toBe(1);
    expect(advancePathIndex(null, 3, markers.length, 0)).toBe(1);
  });
});
