import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GLIntroAdminPanel } from '../../src/gl/components/admin/GLIntroAdminPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

vi.mock('../../src/components/MediaLibraryMenu.jsx', () => ({
  MediaLibraryMenu: () => null,
}));

const INTRO_PAYLOAD = {
  enabled: true,
  opening: {
    kicker: 'Bienvenue',
    titleHtml: '<em>Royaume</em>',
    credit: 'Crédit',
    button: 'Entrer',
    foot: '',
  },
  finale: { button: 'Jouer' },
  audio: { loopKey: 'GL_intro_loop', finalKey: 'GL_intro_final' },
  scenes: [
    {
      id: 'boite',
      voice: 'copiste',
      kicker: 'Scène 1',
      text: 'Texte scène',
      imageKey: 'GL_intro_01_la-boite',
    },
  ],
};

describe('GLIntroAdminPanel', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('charge l’intro et autosauvegarde une modification après GET réussi', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path === '/api/gl/admin/content/intro') return INTRO_PAYLOAD;
      return {};
    });

    render(<GLIntroAdminPanel />);

    const kicker = await screen.findByDisplayValue('Bienvenue');
    fireEvent.change(kicker, { target: { value: 'Bienvenue maj' } });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/admin/content/intro',
        'PUT',
        expect.objectContaining({
          opening: expect.objectContaining({ kicker: 'Bienvenue maj' }),
          audio: expect.objectContaining({ loopKey: 'GL_intro_loop' }),
        }),
      );
    });
  });

  test('échec GET : pas d’édition ni de PUT (anti-wipe emptyDraft)', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path === '/api/gl/admin/content/intro') throw new Error('timeout intro');
      return {};
    });

    render(<GLIntroAdminPanel />);

    expect(await screen.findByText(/timeout intro/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Surtitre')).toBeNull();
    expect(screen.queryByLabelText('Intro active (contenu)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const puts = apiGlMock.mock.calls.filter(([, method]) => method === 'PUT');
    expect(puts).toHaveLength(0);
  });
});
