import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapCanvasHints } from '../../src/components/map/MapCanvasHints.jsx';

describe('MapCanvasHints', () => {
  test('mode view sans tactile : aucun bandeau', () => {
    const { container } = render(<MapCanvasHints mode="view" />);
    expect(container.textContent).toBe('');
  });

  test('draw-zone : consigne minimum 3 points puis compteur prêt à terminer', () => {
    const { rerender } = render(<MapCanvasHints mode="draw-zone" drawPointsCount={1} />);
    expect(screen.getByText('🖊️ Touche la carte (min. 3 pts)')).toBeTruthy();
    rerender(<MapCanvasHints mode="draw-zone" drawPointsCount={4} />);
    expect(screen.getByText('✅ 4 pts — Terminer')).toBeTruthy();
  });

  test('add-marker : consigne de placement', () => {
    render(<MapCanvasHints mode="add-marker" />);
    expect(screen.getByText('📍 Touche la carte pour placer')).toBeTruthy();
  });

  test('edit-points : consigne de glissement avec Ctrl+Z', () => {
    render(<MapCanvasHints mode="edit-points" />);
    expect(screen.getByText(/Glisse un point ou l'intérieur/)).toBeTruthy();
  });

  test('défilement page préféré : rappel 1 doigt / 2 doigts (prioritaire sur gestes actifs)', () => {
    render(<MapCanvasHints mode="view" prefersPageScroll isCoarsePointer />);
    expect(screen.getByText('📱 1 doigt: page · 2 doigts: zoom carte')).toBeTruthy();
    expect(screen.queryByText('✋ Gestes carte actifs')).toBeNull();
  });

  test('tactile en mode view sans préférence page : gestes carte actifs', () => {
    render(<MapCanvasHints mode="view" isCoarsePointer />);
    expect(screen.getByText('✋ Gestes carte actifs')).toBeTruthy();
  });
});
