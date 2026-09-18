// @vitest-environment jsdom
//
// « Messages reçus sur les lieux » (Réglages → Cartographie → Messages) : la vue qui manquait
// pour qu'un signalement déposé sur le plan des personnels soit vu autrement que par hasard.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({ items: [], total: 0 })),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { api } = await import('../../src/services/api');
const { PlaceMessagesPanel } = await import('../../src/components/settings/PlaceMessagesPanel.jsx');
const { PLACE_MESSAGES_SEEN_KEY } = await import('../../src/utils/placeMessagesInbox.js');

const OLD = {
  id: 'c-old',
  context_type: 'marker',
  context_id: 'm-1',
  place_label: 'Porte du gymnase',
  place_emoji: '🚪',
  body: 'La porte est condamnée depuis la rentrée.',
  author_display_name: 'Agent Lyautey',
  created_at: '2026-09-01T08:00:00.000Z',
  image_urls: [],
};

const FRESH = {
  id: 'c-new',
  context_type: 'zone',
  context_id: 'z-1',
  place_label: 'Cour intérieure',
  place_emoji: '🌳',
  body: 'Le portillon ne ferme plus.',
  author_display_name: 'Vie scolaire',
  created_at: '2026-09-17T08:00:00.000Z',
  image_urls: ['/uploads/context-comments/x.webp'],
};

describe('PlaceMessagesPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    api.mockReset();
    api.mockResolvedValue({ items: [FRESH, OLD], total: 2 });
  });

  it('liste les messages avec leur lieu, leur auteur et leurs photos', async () => {
    render(<PlaceMessagesPanel />);
    expect(await screen.findByText(/Le portillon ne ferme plus\./)).toBeTruthy();
    expect(screen.getByText(/La porte est condamnée/)).toBeTruthy();
    expect(screen.getByText(/Cour intérieure/)).toBeTruthy();
    expect(screen.getByText(/Vie scolaire · 1 photo/)).toBeTruthy();
    expect(api).toHaveBeenCalledWith('/api/context-comments/recent?limit=50');
  });

  it('un lieu supprimé garde son message, avec un libellé explicite', async () => {
    api.mockResolvedValue({ items: [{ ...OLD, place_label: '', place_emoji: '' }], total: 1 });
    render(<PlaceMessagesPanel />);
    expect(await screen.findByText('Lieu supprimé')).toBeTruthy();
  });

  it('compte les messages arrivés depuis la dernière lecture, puis les marque lus', async () => {
    window.localStorage.setItem(
      PLACE_MESSAGES_SEEN_KEY,
      JSON.stringify('2026-09-10T00:00:00.000Z'),
    );
    render(<PlaceMessagesPanel />);
    expect(await screen.findByText(/2 messages · 1 nouveau/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
    await waitFor(() => expect(screen.getByText('2 messages')).toBeTruthy());
    expect(JSON.parse(window.localStorage.getItem(PLACE_MESSAGES_SEEN_KEY))).toBe(FRESH.created_at);
  });

  it('première ouverture : rien n’est annoncé comme nouveau', async () => {
    render(<PlaceMessagesPanel />);
    expect(await screen.findByText('2 messages')).toBeTruthy();
    expect(screen.queryByText(/nouveau/)).toBeNull();
  });

  it('remonte l’erreur de chargement à la console de réglages', async () => {
    const onError = vi.fn();
    api.mockRejectedValue(new Error('Lecture impossible'));
    render(<PlaceMessagesPanel onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Lecture impossible'));
  });
});
