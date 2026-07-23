import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLVitalityCounts, GLVitalityBadge } from '../../src/gl/components/GLVitalityDisplay.jsx';

// Props réelles inspirées de l'usage : GLGameBoardRoster (health/power),
// GLTopBar (GLVitalityBadge health/power).
describe('GLVitalityDisplay — aide contextuelle enfants', () => {
  test('GLVitalityCounts expose des libellés d’aide sur chaque jauge (title + aria-label)', () => {
    render(<GLVitalityCounts health={3} power={2} />);

    const heart = screen.getByLabelText('Cœurs : tes points de vie');
    expect(heart).toBeInTheDocument();
    expect(heart).toHaveAttribute('title', 'Cœurs : tes points de vie');
    expect(heart).toHaveTextContent('3');

    const gem = screen.getByLabelText('Gemmes : tes points de pouvoir');
    expect(gem).toBeInTheDocument();
    expect(gem).toHaveAttribute('title', 'Gemmes : tes points de pouvoir');
    expect(gem).toHaveTextContent('2');
  });

  test('GLVitalityCounts affiche une légende visible discrète uniquement si showHint', () => {
    const { rerender, container } = render(<GLVitalityCounts health={1} power={1} />);
    expect(container.querySelector('.gl-vitality-hint')).toBeNull();

    rerender(<GLVitalityCounts health={1} power={1} showHint />);
    const hint = container.querySelector('.gl-vitality-hint');
    expect(hint).not.toBeNull();
    expect(hint).toHaveClass('gl-hint');
    expect(hint?.textContent).toContain('points de vie');
    expect(hint?.textContent).toContain('points de pouvoir');
  });

  test('GLVitalityBadge conserve son aria-label récapitulatif et les libellés de jauge', () => {
    render(<GLVitalityBadge health={5} power={4} />);

    expect(screen.getByLabelText('5 points de vie, 4 points de pouvoir')).toBeInTheDocument();
    expect(screen.getByLabelText('Cœurs : tes points de vie')).toBeInTheDocument();
    expect(screen.getByLabelText('Gemmes : tes points de pouvoir')).toBeInTheDocument();
  });
});
