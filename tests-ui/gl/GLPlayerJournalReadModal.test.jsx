import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

import { GLPlayerJournalReadModal } from '../../src/gl/components/GLPlayerJournalReadModal.jsx';

const PAYLOAD = {
  player: { id: 7, pseudo: 'eleve7', firstName: 'Éva', lastName: 'Test' },
  articles: [
    {
      id: 1,
      title: 'Mon premier article',
      bodyMarkdown: 'Bonjour',
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-02T10:00:00Z',
      usage: { charCount: 7, assetCount: 0 },
    },
  ],
  imports: [
    {
      id: 10,
      resourceType: 'species',
      resourceRef: 'SP1',
      title: 'Renard',
      createdAt: '2026-05-03T10:00:00Z',
    },
    {
      id: 11,
      resourceType: 'glossary',
      resourceRef: 'GL1',
      title: 'Photosynthèse',
      createdAt: '2026-05-04T10:00:00Z',
    },
  ],
};

describe('GLPlayerJournalReadModal (vue MJ enrichie)', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
    apiGLMock.mockImplementation((url) => {
      if (String(url).includes('/players/')) return Promise.resolve(PAYLOAD);
      if (String(url).includes('/embeds/resolve')) return Promise.resolve({ titles: {} });
      return Promise.resolve({});
    });
  });

  test('affiche les comptages, le filtre par type et le bouton export', async () => {
    render(<GLPlayerJournalReadModal playerId={7} open onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Mon premier article')).toBeInTheDocument();
    });

    // Comptages
    expect(screen.getByText('1')).toBeInTheDocument(); // articles
    // Deux imports présents → titre de section « Éléments importés (2) »
    expect(screen.getByText(/Éléments importés \(2\)/)).toBeInTheDocument();

    // Filtre par type disponible (2 types distincts)
    expect(
      screen.getByRole('combobox', { name: /Filtrer les imports par type/i }),
    ).toBeInTheDocument();

    // Bouton export
    expect(screen.getByRole('button', { name: /Exporter/i })).toBeInTheDocument();
  });
});
