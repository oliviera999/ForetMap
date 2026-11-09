import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLKioskAttractOverlay } from '../../src/gl/components/GLKioskAttractOverlay.jsx';

describe('GLKioskAttractOverlay', () => {
  test('un bouton plein écran, titre de la plateforme, un geste pour entrer', () => {
    const onStart = vi.fn();
    render(<GLKioskAttractOverlay title="Mon royaume" subtitle="Le jeu" onStart={onStart} />);
    const button = screen.getByTestId('gl-kiosk-attract');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveTextContent('Mon royaume');
    expect(button).toHaveTextContent('Le jeu');
    expect(button).toHaveTextContent('Touchez l’écran pour commencer');
    expect(screen.getAllByTestId('gl-dice-cube')).toHaveLength(3);
    fireEvent.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
