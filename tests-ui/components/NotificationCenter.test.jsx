// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationCenter } from '../../src/components/notifications-center.jsx';

/**
 * Centre de notifications : chaque avis ciblé est entièrement cliquable, affiche ce qu'il
 * ouvre (« Voir le lieu et ses messages »…) et signale s'il est non lu.
 */

const baseProps = {
  roleKey: 'teacher',
  prefs: {},
  metrics: {},
  onTogglePref: vi.fn(),
  onMarkAllRead: vi.fn(),
  onClearRead: vi.fn(),
  onOpenPanel: vi.fn(),
  onResetMetrics: vi.fn(),
};

const placeItem = {
  id: 'srv-7',
  key: 'srv-7',
  level: 'info',
  title: 'Message sur « Mare » (Forêt)',
  message: 'Léa M. : la bâche est déchirée',
  target: { type: 'place', id: 'z1', mapId: 'foret', kind: 'zone' },
  read: false,
  createdAt: new Date().toISOString(),
};

const stateItem = {
  id: 'local-1',
  key: 'teacher-realtime-offline',
  level: 'important',
  title: 'Temps réel hors ligne',
  message: 'Le mode secours par rafraîchissement est actif.',
  read: true,
  createdAt: new Date().toISOString(),
};

function openPanel(props) {
  render(<NotificationCenter {...baseProps} unreadCount={1} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Notifications \(1 non lues\)/ }));
}

describe('NotificationCenter', () => {
  it('un avis ciblé est un bouton entier portant le libellé de son action', () => {
    const onOpenAction = vi.fn();
    openPanel({ items: [placeItem], onOpenAction });
    const main = document.querySelector('button.notif-item-main');
    expect(main).toBeTruthy();
    expect(main.textContent).toContain('Message sur « Mare »');
    expect(main.textContent).toContain('Voir le lieu et ses messages');
    expect(main.textContent).toContain('Non lue');
    fireEvent.click(main);
    expect(onOpenAction).toHaveBeenCalledWith(placeItem);
    // Le panneau se ferme après ouverture de la cible.
    expect(screen.queryByRole('dialog', { name: 'Centre de notifications' })).toBeNull();
  });

  it('un avis sans cible n’est pas cliquable et ne montre pas d’action', () => {
    openPanel({ items: [stateItem], onOpenAction: vi.fn() });
    expect(document.querySelector('button.notif-item-main')).toBeNull();
    expect(screen.getByText('Temps réel hors ligne')).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
  });

  it('« Marquer lu » et « Retirer » restent disponibles à part', () => {
    const onMarkAsRead = vi.fn();
    const onRemove = vi.fn();
    openPanel({ items: [placeItem], onOpenAction: vi.fn(), onMarkAsRead, onRemove });
    fireEvent.click(screen.getByRole('button', { name: 'Marquer lu' }));
    expect(onMarkAsRead).toHaveBeenCalledWith('srv-7');
    fireEvent.click(screen.getByRole('button', { name: /Retirer la notification/ }));
    expect(onRemove).toHaveBeenCalledWith('srv-7');
  });

  it('préférences : les catégories « Mes tâches » et « Messages » sont proposées', () => {
    openPanel({ items: [], onOpenAction: vi.fn() });
    expect(screen.getByLabelText('Mes tâches')).toBeTruthy();
    expect(screen.getByLabelText('Messages')).toBeTruthy();
  });
});
