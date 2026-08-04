import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GLReferenceDocsPanel } from '../../src/gl/components/admin/GLReferenceDocsPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  clearGlSession: vi.fn(),
}));

const LIST = [
  {
    slug: 'presentation',
    title: 'Gnomes & Licornes — Présentation générale',
    summary: 'Un jeu pédagogique d’écologie.',
    edited: false,
    source: 'file',
    fileAvailable: true,
    updatedAt: null,
  },
  {
    slug: 'guide-du-mj',
    title: 'Guide pratique du maître du jeu',
    summary: 'Le mode d’emploi d’une séance.',
    edited: true,
    source: 'db',
    fileAvailable: true,
    updatedAt: '2026-08-01T10:00:00.000Z',
  },
];

function docFor(slug, overrides = {}) {
  const base = LIST.find((item) => item.slug === slug);
  return {
    ...base,
    bodyMarkdown: `# ${base.title}\n\nCorps du document ${slug}.`,
    ...overrides,
  };
}

/** Réponses par défaut : liste sur la racine, fiche complète sur `/:slug`. */
function mockDefaultApi() {
  apiGlMock.mockImplementation((url) => {
    if (url === '/api/gl/admin/reference-docs') return Promise.resolve(LIST);
    const match = /\/api\/gl\/admin\/reference-docs\/([^/]+)$/.exec(url);
    if (match) return Promise.resolve(docFor(match[1]));
    return Promise.reject(new Error(`URL inattendue: ${url}`));
  });
}

describe('GLReferenceDocsPanel', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('liste les documents et affiche le premier, servi depuis le dépôt', async () => {
    mockDefaultApi();
    render(<GLReferenceDocsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Présentation générale/ })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Guide pratique du maître du jeu/ })).toBeTruthy();
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/admin/reference-docs');

    await waitFor(() => {
      expect(screen.getByText(/docs\/reference\/gl\/presentation\.md/)).toBeTruthy();
    });
    expect(screen.getByText(/version du dépôt/)).toBeTruthy();
    // Non modifié : pas de bouton de réinitialisation.
    expect(screen.queryByRole('button', { name: /Réinitialiser/ })).toBeNull();
  });

  test('sélectionner un document modifié affiche sa provenance et propose la réinitialisation', async () => {
    mockDefaultApi();
    render(<GLReferenceDocsPanel />);

    const guideButton = await screen.findByRole('button', {
      name: /Guide pratique du maître du jeu/,
    });
    fireEvent.click(guideButton);

    await waitFor(() => {
      expect(screen.getByText(/modifié dans l’application/)).toBeTruthy();
    });
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/admin/reference-docs/guide-du-mj');
    expect(screen.getByRole('button', { name: /Réinitialiser depuis le dépôt/ })).toBeTruthy();
  });

  test('« Modifier le document » ouvre l’éditeur Markdown brut prérempli', async () => {
    mockDefaultApi();
    render(<GLReferenceDocsPanel />);

    const editButton = await screen.findByRole('button', { name: 'Modifier le document' });
    fireEvent.click(editButton);

    const textarea = await screen.findByDisplayValue(/Corps du document presentation\./);
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(screen.getByRole('button', { name: 'Terminer la modification' })).toBeTruthy();
  });

  test('la réinitialisation confirmée rend la main au fichier du dépôt', async () => {
    mockDefaultApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GLReferenceDocsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /Guide pratique du maître du jeu/ }));
    const resetButton = await screen.findByRole('button', {
      name: /Réinitialiser depuis le dépôt/,
    });

    apiGlMock.mockImplementation((url, method) => {
      if (url === '/api/gl/admin/reference-docs/guide-du-mj/reset' && method === 'POST') {
        return Promise.resolve(docFor('guide-du-mj', { edited: false, source: 'file' }));
      }
      if (url === '/api/gl/admin/reference-docs') {
        return Promise.resolve(LIST.map((item) => ({ ...item, edited: false })));
      }
      return Promise.reject(new Error(`URL inattendue: ${url}`));
    });
    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(screen.getByText('Document réinitialisé depuis le dépôt.')).toBeTruthy();
    });
    expect(apiGlMock).toHaveBeenCalledWith(
      '/api/gl/admin/reference-docs/guide-du-mj/reset',
      'POST',
    );
  });

  test('la réinitialisation refusée à la confirmation n’appelle pas l’API', async () => {
    mockDefaultApi();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GLReferenceDocsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /Guide pratique du maître du jeu/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Réinitialiser depuis le dépôt/ }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });
    expect(
      apiGlMock.mock.calls.some(([url]) => String(url).endsWith('/reset')),
      'aucun appel /reset attendu',
    ).toBe(false);
  });

  test('une erreur de chargement est affichée sans casser la vue', async () => {
    apiGlMock.mockRejectedValue(new Error('Session expirée'));
    render(<GLReferenceDocsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Session expirée')).toBeTruthy();
    });
  });

  test('dossier absent du serveur : message explicite', async () => {
    apiGlMock.mockResolvedValue([]);
    render(<GLReferenceDocsPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Aucun document de référence trouvé/)).toBeTruthy();
    });
  });
});
