import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GLHelpContentAdminPanel } from '../../src/gl/components/admin/GLHelpContentAdminPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

vi.mock('../../src/gl/hooks/useGlHelpContent.js', () => ({
  invalidateGlHelpConfigCache: vi.fn(),
}));

const HELP_PAYLOAD = {
  entries: {
    'tab:maps': { title: 'Cartes perso', body: 'Aide personnalisée cartes.' },
    'tab:market': { title: 'Marché perso', body: 'Aide personnalisée marché.' },
  },
};

describe('GLHelpContentAdminPanel', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('charge les bulles et permet l’édition après succès GET', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path === '/api/gl/admin/content/help') return HELP_PAYLOAD;
      return {};
    });

    render(<GLHelpContentAdminPanel />);

    expect(await screen.findByDisplayValue('Cartes perso')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Cartes perso'), {
      target: { value: 'Cartes maj' },
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/admin/content/help',
        'PUT',
        expect.objectContaining({
          entries: expect.objectContaining({
            'tab:maps': expect.objectContaining({ title: 'Cartes maj' }),
          }),
        }),
      );
    });
  });

  test('échec GET : pas de formulaire ni de PUT autosave (anti-wipe)', async () => {
    apiGlMock.mockImplementation(async (path) => {
      if (path === '/api/gl/admin/content/help') throw new Error('timeout aide');
      return {};
    });

    render(<GLHelpContentAdminPanel />);

    expect(await screen.findByText(/timeout aide/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Titre')).toBeNull();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const puts = apiGlMock.mock.calls.filter(([, method]) => method === 'PUT');
    expect(puts).toHaveLength(0);
  });
});
