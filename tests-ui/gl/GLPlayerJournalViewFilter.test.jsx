import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));
vi.mock('../../src/gl/hooks/useGlHelpContent.js', () => ({
  useGlHelpContent: () => ({ title: '', body: '' }),
}));
vi.mock('../../src/gl/components/GLHelpPanel.jsx', () => ({ GLHelpPanel: () => null }));
vi.mock('../../src/gl/components/GLPlayerJournalArticleCard.jsx', () => ({
  GLPlayerJournalArticleCard: ({ article }) => (
    <div data-testid="article">{article.title || 'article'}</div>
  ),
}));
vi.mock('../../src/gl/components/GLPlayerJournalImportCard.jsx', () => ({
  GLPlayerJournalImportCard: ({ item }) => <div data-testid="import">{item.title}</div>,
}));

import { GLPlayerJournalView } from '../../src/gl/components/GLPlayerJournalView.jsx';

const DATA = {
  limits: { maxChars: 0, maxAssets: 0 },
  articles: [
    {
      id: 1,
      title: 'Note sur les renards',
      bodyMarkdown: 'texte',
      createdAt: '2026-05-01T10:00:00Z',
    },
  ],
  imports: [
    {
      id: 2,
      resourceType: 'glossary',
      resourceRef: 'GL1',
      title: 'Photosynthèse',
      createdAt: '2026-05-02T10:00:00Z',
    },
  ],
};

describe('GLPlayerJournalView — filtre / recherche / tri (B.7)', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
    apiGLMock.mockResolvedValue(DATA);
  });

  test('filtre par type et recherche restreignent le fil', async () => {
    render(<GLPlayerJournalView gameState={null} onNavigateTab={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('article')).toBeInTheDocument());
    // Les deux entrées visibles au départ
    expect(screen.getByTestId('article')).toBeInTheDocument();
    expect(screen.getByTestId('import')).toBeInTheDocument();

    // Filtre « Imports » → l'article disparaît
    fireEvent.change(screen.getByLabelText('Filtrer par type d’entrée'), {
      target: { value: 'import' },
    });
    expect(screen.queryByTestId('article')).not.toBeInTheDocument();
    expect(screen.getByTestId('import')).toBeInTheDocument();

    // Repasse à Tout puis recherche « renard » → seul l'article correspond
    fireEvent.change(screen.getByLabelText('Filtrer par type d’entrée'), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByLabelText('Rechercher dans mon journal'), {
      target: { value: 'renard' },
    });
    expect(screen.getByTestId('article')).toBeInTheDocument();
    expect(screen.queryByTestId('import')).not.toBeInTheDocument();

    // Recherche sans correspondance → message dédié
    fireEvent.change(screen.getByLabelText('Rechercher dans mon journal'), {
      target: { value: 'zzzzz' },
    });
    expect(screen.getByText(/Aucune entrée ne correspond/i)).toBeInTheDocument();
  });
});
