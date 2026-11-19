// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * Audit du 19/11/2026, J5 — le réglage « traversée des zones feuillets » se perdait entre
 * `AppGL` et le plateau : `GLMapView` ne relayait pas la prop, `GLGameBoard` gardait son
 * défaut (`true`) et l'ancien popover de feuillet pouvait s'ouvrir en « Tenir ».
 */

const boardProps = vi.hoisted(() => ({ last: null }));

vi.mock('../../src/gl/components/GLGameBoard.jsx', () => ({
  GLGameBoard: (props) => {
    boardProps.last = props;
    return <div data-testid="board" />;
  },
}));

import { GLMapView } from '../../src/gl/components/GLMapView.jsx';

describe('GLMapView — relais du réglage de traversée des zones feuillets', () => {
  beforeEach(() => {
    boardProps.last = null;
  });

  test('réglage coupé : le plateau le reçoit', () => {
    render(<GLMapView feuilletZoneTraversalEnabled={false} />);
    expect(boardProps.last.feuilletZoneTraversalEnabled).toBe(false);
  });

  test('réglage actif ou absent : la traversée reste ouverte', () => {
    render(<GLMapView feuilletZoneTraversalEnabled />);
    expect(boardProps.last.feuilletZoneTraversalEnabled).toBe(true);
    render(<GLMapView />);
    expect(boardProps.last.feuilletZoneTraversalEnabled).toBe(true);
  });
});
