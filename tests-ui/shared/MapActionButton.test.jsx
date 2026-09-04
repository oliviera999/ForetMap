// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapActionButton } from '../../src/shared/ui/MapActionButton.jsx';
import { GLBoardActionButton } from '../../src/gl/components/GLBoardActionButton.jsx';

describe('MapActionButton (kit partagé)', () => {
  test('bouton avec libellé : classes neutres par rôle, pas d’infobulle', () => {
    render(<MapActionButton role="primary" label="Explorer" labelShort="Expl." testId="act" />);
    const btn = screen.getByTestId('act');
    expect(btn.className).toBe('fm-map-action fm-map-action--primary');
    expect(btn.getAttribute('aria-label')).toBe('Explorer');
    expect(btn.querySelector('.fm-map-action__label--short').textContent).toBe('Expl.');
    expect(btn.querySelector('.fm-map-action__label--long').textContent).toBe('Explorer');
    expect(btn.closest('.fm-tooltip-wrap')).toBeNull();
  });

  test('icône seule : infobulle, aria-label, pas de title natif', () => {
    render(<MapActionButton role="tool" icon="🎲" label="Lancer les dés" active testId="dice" />);
    const btn = screen.getByTestId('dice');
    expect(btn.className).toContain('fm-map-action--icon-only');
    expect(btn.className).toContain('is-active');
    expect(btn.getAttribute('title')).toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Lancer les dés');
    expect(btn.closest('.fm-tooltip-wrap')).not.toBeNull();
  });

  test('GLBoardActionButton : classes G&L historiques en plus des neutres', () => {
    render(<GLBoardActionButton role="display" icon="⛶" label="Plein écran" testId="fs" />);
    const btn = screen.getByTestId('fs');
    expect(btn.className).toContain('fm-map-action fm-map-action--display');
    expect(btn.className).toContain('gl-board-action gl-board-action--display');
    expect(btn.className).toContain('gl-board-action--icon-only');
    expect(btn.querySelector('.gl-board-action__icon.fm-map-action__icon')).not.toBeNull();
  });
});
