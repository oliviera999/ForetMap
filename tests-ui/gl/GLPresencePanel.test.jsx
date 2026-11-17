import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLPresencePanel } from '../../src/gl/components/tenir/GLPresencePanel.jsx';

const mates = [
  { playerId: 1, pseudo: 'joueur-a' },
  { playerId: 2, pseudo: 'joueur-b' },
  { playerId: 3, pseudo: 'joueur-c' },
];

/**
 * Ensemble unifié (M14) : tout le monde est là par défaut. Rien n'est à confirmer : le panneau
 * n'est qu'un bouton, qui s'ouvre quand il manque quelqu'un.
 */
describe('GLPresencePanel — « Il manque quelqu’un ? »', () => {
  test('équipe complète : un simple bouton, aucune liste à passer', () => {
    const onConfirmer = vi.fn();
    render(
      <GLPresencePanel
        presence={{ confirmee: false, absents: [] }}
        mates={mates}
        onConfirmer={onConfirmer}
      />,
    );
    expect(screen.getByRole('button', { name: 'Il manque quelqu’un ?' })).toBeTruthy();
    expect(screen.queryByTestId('gl-presence-ok')).toBeNull();
    expect(screen.queryByRole('button', { name: /joueur-a/ })).toBeNull();
    expect(onConfirmer).not.toHaveBeenCalled();
  });

  test('on ouvre, on touche les absents, puis « C’est bon »', () => {
    const onConfirmer = vi.fn();
    render(
      <GLPresencePanel
        presence={{ confirmee: false, absents: [] }}
        mates={mates}
        onConfirmer={onConfirmer}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Il manque quelqu’un ?' }));
    const b = screen.getByRole('button', { name: /joueur-b/ });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(b);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.textContent).toMatch(/pas là/);
    fireEvent.click(screen.getByRole('button', { name: /joueur-c/ }));
    fireEvent.click(screen.getByRole('button', { name: /joueur-c/ }));
    fireEvent.click(screen.getByTestId('gl-presence-ok'));
    expect(onConfirmer).toHaveBeenCalledWith([2]);
    // La liste se referme : le bouton revient.
    expect(screen.queryByTestId('gl-presence-ok')).toBeNull();
  });

  test('un absent déclaré : « Quelqu’un vient d’arriver », et la liste reste modifiable', () => {
    const onArrivee = vi.fn();
    render(
      <GLPresencePanel
        presence={{ confirmee: true, absents: [3] }}
        mates={mates}
        onArrivee={onArrivee}
      />,
    );
    expect(screen.getByRole('button', { name: 'Il manque quelqu’un ?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quelqu’un vient d’arriver' }));
    fireEvent.click(screen.getByRole('button', { name: 'joueur-c est là' }));
    expect(onArrivee).toHaveBeenCalledWith(3);
  });

  test('rien à afficher hors des surfaces concernées, ou panneau fermé', () => {
    const { container, rerender } = render(<GLPresencePanel presence={null} mates={mates} />);
    expect(container.textContent).toBe('');
    rerender(
      <GLPresencePanel presence={{ confirmee: true, absents: [] }} mates={mates} ouverte={false} />,
    );
    expect(container.textContent).toBe('');
  });
});
