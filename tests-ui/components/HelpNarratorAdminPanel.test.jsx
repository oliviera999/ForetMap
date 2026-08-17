// Lot 5 — studio prof du narrateur (OLU).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  // La galerie de la médiathèque préfixe les URL via `withAppBase` : sans lui, la
  // tuile lève au rendu et la modale est démontée avant toute assertion.
  withAppBase: (url) => String(url || ''),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const { api } = await import('../../src/services/api');
const { HelpNarratorAdminPanel } =
  await import('../../src/components/help/HelpNarratorAdminPanel.jsx');

const NARRATOR_ENDPOINT = '/api/settings/admin/help-narrator';

const DEFAULT_CONFIG = {
  enabled: true,
  speakerName: 'OLU',
  fallbackSilhouette: 'olu',
  portraits: {},
};

function mockApi({ narrator = DEFAULT_CONFIG, items = [] } = {}) {
  api.mockImplementation(async (path, method) => {
    if (path === NARRATOR_ENDPOINT && (!method || method === 'GET')) return narrator;
    if (path === NARRATOR_ENDPOINT && method === 'PUT') return narrator;
    if (path === `${NARRATOR_ENDPOINT}/reset`) return DEFAULT_CONFIG;
    if (path.startsWith('/api/settings/admin/media-library')) {
      if (method === 'POST') return { url: '/uploads/images/olu.webp', size: 12000 };
      return { items };
    }
    return {};
  });
}

function card(expression) {
  return document.querySelector(`.fm-narrator-card[data-expression="${expression}"]`);
}

beforeEach(() => {
  api.mockReset();
});

afterEach(() => cleanup());

describe('HelpNarratorAdminPanel', () => {
  it('charge la configuration et récapitule les expressions illustrées', async () => {
    mockApi({
      narrator: { ...DEFAULT_CONFIG, portraits: { neutre: { bust: '/uploads/n.webp' } } },
    });
    render(<HelpNarratorAdminPanel />);

    await screen.findByText('Portraits');
    expect(api).toHaveBeenCalledWith(NARRATOR_ENDPOINT);
    expect(screen.getByText('1 / 8')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom affiché/)).toHaveValue('OLU');
  });

  it('montre la cascade : image dédiée, reprise de « Neutre », silhouette de repli', async () => {
    mockApi({
      narrator: { ...DEFAULT_CONFIG, portraits: { neutre: { bust: '/uploads/n.webp' } } },
    });
    render(<HelpNarratorAdminPanel />);
    await screen.findByText('Portraits');

    expect(within(card('neutre')).getByText('Image dédiée')).toBeInTheDocument();
    expect(within(card('grave')).getByText('reprend « Neutre »')).toBeInTheDocument();
    expect(card('grave').querySelector('img')).toHaveAttribute('src', '/uploads/n.webp');

    cleanup();
    mockApi();
    render(<HelpNarratorAdminPanel />);
    await screen.findByText('Portraits');
    expect(within(card('neutre')).getByText('silhouette de repli')).toBeInTheDocument();
    expect(card('neutre').querySelector('svg')).not.toBeNull();
  });

  it('affecte une image choisie dans la médiathèque et l’enregistre', async () => {
    mockApi({
      items: [
        {
          relativePath: 'images/olu.webp',
          filename: 'olu.webp',
          url: '/uploads/images/olu.webp',
          mediaType: 'image',
          size: 9000,
        },
      ],
    });
    render(<HelpNarratorAdminPanel />);
    await screen.findByText('Portraits');

    fireEvent.click(within(card('parle')).getAllByRole('button', { name: 'Choisir…' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Parle · Buste/)).toBeInTheDocument();

    fireEvent.click(await within(dialog).findByRole('button', { name: /olu\.webp/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(card('parle')).getByText('Image dédiée')).toBeInTheDocument();

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        NARRATOR_ENDPOINT,
        'PUT',
        expect.objectContaining({
          portraits: { parle: { bust: '/uploads/images/olu.webp' } },
        }),
      ),
    );
  });

  it('l’interrupteur éteint le narrateur et l’aperçu le montre', async () => {
    mockApi();
    render(<HelpNarratorAdminPanel />);
    await screen.findByText('Portraits');

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('OLU est éteint')).toBeInTheDocument();
    expect(screen.getByText(/voici ce que voient élèves et profs/)).toBeInTheDocument();
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        NARRATOR_ENDPOINT,
        'PUT',
        expect.objectContaining({ enabled: false }),
      ),
    );
  });

  it('bascule l’aperçu entre visite guidée et panneau d’aide', async () => {
    mockApi();
    render(<HelpNarratorAdminPanel />);
    await screen.findByText('Portraits');

    expect(document.querySelector('.fm-narrator-preview__tour')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Panneau d’aide' }));
    expect(document.querySelector('.fm-narrator-preview__help')).not.toBeNull();
  });

  it('réinitialise après confirmation', async () => {
    mockApi({
      narrator: { ...DEFAULT_CONFIG, portraits: { neutre: { bust: '/uploads/n.webp' } } },
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<HelpNarratorAdminPanel />);
    await screen.findByText('Portraits');

    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le narrateur' }));

    await waitFor(() => expect(api).toHaveBeenCalledWith(`${NARRATOR_ENDPOINT}/reset`, 'POST'));
    await screen.findByText('Narrateur réinitialisé.');
    expect(screen.getByText('0 / 8')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
