import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JournalBookView } from '../../../src/shared/journal/JournalBookView.jsx';
import { FM_JOURNAL_UI } from '../../../src/components/journal/journalUi.js';

vi.mock('../../../src/shared/journal/useJournalEmbedTitles.js', () => ({
  useJournalEmbedTitles: (html) => html,
}));

const adapter = {
  resolveEmbeds: vi.fn().mockResolvedValue({ titles: {}, cards: {} }),
};

describe('JournalBookView', () => {
  test('affiche couverture, sommaire, page et annexes', () => {
    render(
      <JournalBookView
        articles={[
          {
            id: 1,
            title: 'La mare',
            bodyMarkdown: 'Des têtards',
            createdAt: '2026-05-01T10:00:00Z',
          },
        ]}
        imports={[
          {
            id: 2,
            resourceType: 'plant',
            resourceRef: '12',
            title: 'Noisetier',
            createdAt: '2026-05-02T10:00:00Z',
          },
        ]}
        adapter={adapter}
        ui={FM_JOURNAL_UI}
        ownerLabel="Léa"
        productLabel="ForetMap"
        yearbook
        importTypeMeta={() => ({ label: 'Espèce', icon: '' })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('journal-book')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Carnet de Léa' })).toBeInTheDocument();
    expect(screen.getAllByText('La mare').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Annexes/)).toBeInTheDocument();
    expect(screen.getByText('Noisetier')).toBeInTheDocument();
    expect(screen.getByLabelText(/épinglés seulement/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retour au carnet/i }));
  });

  test('filtre yearbook : épinglés seulement masque le non épinglé', () => {
    render(
      <JournalBookView
        articles={[
          {
            id: 1,
            title: 'Épinglé',
            bodyMarkdown: 'A',
            createdAt: '2026-05-01T10:00:00Z',
            pinned: true,
          },
          {
            id: 2,
            title: 'Libre',
            bodyMarkdown: 'B',
            createdAt: '2026-05-02T10:00:00Z',
            pinned: false,
          },
        ]}
        imports={[]}
        adapter={adapter}
        ui={FM_JOURNAL_UI}
        ownerLabel="Léa"
        yearbook
        importTypeMeta={() => ({ label: 'Espèce', icon: '' })}
      />,
    );
    expect(screen.getAllByText('Libre').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByLabelText(/épinglés seulement/i));
    expect(screen.queryByText('Libre')).not.toBeInTheDocument();
    expect(screen.getAllByText('Épinglé').length).toBeGreaterThanOrEqual(1);
  });
});
