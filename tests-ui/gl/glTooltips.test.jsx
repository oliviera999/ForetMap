import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { GLBoardActionButton } from '../../src/gl/components/GLBoardActionButton.jsx';
import { GLNotificationsCenter } from '../../src/gl/components/GLNotificationsCenter.jsx';

/**
 * Infobulles GL — le composant vient de `src/shared/`, seuls les points de pose sont
 * propres au produit. Ces cas couvrent ce que la réutilisation pouvait casser.
 *
 * L'ouverture est temporisée (300 ms au survol) : les tests avancent des faux timers
 * plutôt que d'attendre, sans quoi ils dureraient une seconde chacun pour rien.
 */

async function hoverAndOpen(element) {
  await userEvent.hover(element);
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

describe('infobulles GL', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    return () => vi.useRealTimers();
  });

  test('une commande du plateau en icône seule explique ce qu’elle fait', async () => {
    render(<GLBoardActionButton role="tool" icon="🎲" label="Lancer les dés" />);
    const button = screen.getByRole('button', { name: 'Lancer les dés' });

    // Avant le survol, rien : une infobulle permanente serait du bruit.
    expect(screen.queryByRole('tooltip')).toBeNull();

    await hoverAndOpen(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Lancer les dés');
    // Décrite, pas renommée : le nom accessible reste celui du bouton.
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  });

  test('le `title` natif ne double pas l’infobulle', async () => {
    render(<GLBoardActionButton role="tool" icon="🔇" label="Couper la musique" />);
    const button = screen.getByRole('button', { name: 'Couper la musique' });
    // Les deux affichées ensemble se superposeraient — l'une chasse l'autre.
    expect(button).not.toHaveAttribute('title');
  });

  test('un bouton qui porte son libellé garde le `title` et n’est pas enrobé', () => {
    const { container } = render(
      <GLBoardActionButton role="primary" label="Terminer le tour" title="Terminer le tour" />,
    );
    expect(container.querySelector('.fm-tooltip-wrap')).toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Terminer le tour');
  });

  test('la cloche annonce le nombre de non-lues', async () => {
    render(
      <GLNotificationsCenter
        items={[]}
        unreadCount={3}
        onMarkAllRead={() => {}}
        onClear={() => {}}
      />,
    );
    await hoverAndOpen(screen.getByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('3 non lues');
  });

  test('une seule non-lue se dit au singulier', async () => {
    render(
      <GLNotificationsCenter
        items={[]}
        unreadCount={1}
        onMarkAllRead={() => {}}
        onClear={() => {}}
      />,
    );
    await hoverAndOpen(screen.getByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 non lue');
  });
});
