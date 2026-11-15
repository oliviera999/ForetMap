import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLPresencePanel } from '../../src/gl/components/tenir/GLPresencePanel.jsx';

const mates = [
  { playerId: 1, pseudo: 'joueur-a' },
  { playerId: 2, pseudo: 'joueur-b' },
  { playerId: 3, pseudo: 'joueur-c' },
];

describe('GLPresencePanel — « Il manque quelqu’un ? »', () => {
  test('équipe complète : un seul appui sur « C’est bon »', () => {
    const onConfirmer = vi.fn();
    render(
      <GLPresencePanel
        presence={{ confirmee: false, absents: [] }}
        mates={mates}
        onConfirmer={onConfirmer}
      />,
    );
    expect(screen.getByText('Il manque quelqu’un ?')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gl-presence-ok'));
    expect(onConfirmer).toHaveBeenCalledWith([]);
  });

  test('on touche les absents, puis « C’est bon »', () => {
    const onConfirmer = vi.fn();
    render(
      <GLPresencePanel
        presence={{ confirmee: false, absents: [] }}
        mates={mates}
        onConfirmer={onConfirmer}
      />,
    );
    const b = screen.getByRole('button', { name: /joueur-b/ });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(b);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.textContent).toMatch(/pas là/);
    fireEvent.click(screen.getByRole('button', { name: /joueur-c/ }));
    fireEvent.click(screen.getByRole('button', { name: /joueur-c/ }));
    fireEvent.click(screen.getByTestId('gl-presence-ok'));
    expect(onConfirmer).toHaveBeenCalledWith([2]);
  });

  test('présence confirmée avec un absent : « Quelqu’un vient d’arriver »', () => {
    const onArrivee = vi.fn();
    render(
      <GLPresencePanel
        presence={{ confirmee: true, absents: [3] }}
        mates={mates}
        onArrivee={onArrivee}
      />,
    );
    expect(screen.queryByText('Il manque quelqu’un ?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Quelqu’un vient d’arriver' }));
    fireEvent.click(screen.getByRole('button', { name: 'joueur-c est là' }));
    expect(onArrivee).toHaveBeenCalledWith(3);
  });

  test('rien à afficher : présence confirmée sans absent, ou hors des surfaces concernées', () => {
    const { container, rerender } = render(
      <GLPresencePanel presence={{ confirmee: true, absents: [] }} mates={mates} />,
    );
    expect(container.textContent).toBe('');
    rerender(<GLPresencePanel presence={null} mates={mates} />);
    expect(container.textContent).toBe('');
  });
});
