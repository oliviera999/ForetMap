import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => 'jwt',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { UserJournalReadModal } from '../../../src/components/journal/UserJournalReadModal.jsx';

const PAYLOAD = {
  user: { id: 7, pseudo: 'eleve7', firstName: 'Éva', lastName: 'Test' },
  articles: [
    {
      id: 1,
      title: 'Mon premier article',
      bodyMarkdown: 'Bonjour',
      zoneName: 'Mare',
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-02T10:00:00Z',
      usage: { charCount: 7, assetCount: 0 },
    },
  ],
  imports: [
    { id: 10, resourceType: 'plant', resourceRef: '12', title: 'Noisetier' },
    { id: 11, resourceType: 'glossary', resourceRef: 'HUMUS', title: 'Humus' },
  ],
};

/** Miroir ForetMap du test G&L « vue MJ enrichie » : même modale partagée, lecture par le prof. */
describe('UserJournalReadModal — lecture professeur alignée sur la vue MJ', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((url) => {
      if (String(url).includes('/users/')) return Promise.resolve(PAYLOAD);
      if (String(url).includes('/embeds/resolve')) return Promise.resolve({ titles: {} });
      return Promise.resolve({});
    });
  });

  test('comptages, dates, zone, filtre par type et export', async () => {
    render(<UserJournalReadModal userId={7} open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Mon premier article')).toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledWith('/api/user-journal/users/7');
    expect(screen.getByRole('heading', { name: 'Carnet de Éva Test' })).toBeInTheDocument();
    expect(screen.getByText('Zone : Mare')).toBeInTheDocument();
    expect(screen.getByText(/7 caractères/)).toBeInTheDocument();
    expect(screen.getByText(/Éléments importés \(2\)/)).toBeInTheDocument();

    const filter = screen.getByRole('combobox', { name: /Filtrer les imports par type/i });
    fireEvent.change(filter, { target: { value: 'glossary' } });
    expect(screen.getByText(/Éléments importés \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText('Noisetier')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exporter/i })).toBeInTheDocument();
  });

  test('carnet vide : message, pas de bouton export', async () => {
    apiMock.mockResolvedValue({ user: { id: 8, pseudo: 'vide' }, articles: [], imports: [] });
    render(<UserJournalReadModal userId={8} open onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/n’a pas encore rédigé d’article/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Exporter/i })).not.toBeInTheDocument();
  });

  test('erreur de lecture affichée', async () => {
    apiMock.mockRejectedValue(new Error('Interdit'));
    render(<UserJournalReadModal userId={9} open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Interdit')).toBeInTheDocument());
  });
});
