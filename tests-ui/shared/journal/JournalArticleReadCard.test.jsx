import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JournalArticleReadCard } from '../../../src/shared/journal/JournalArticleReadCard.jsx';
import { FM_JOURNAL_UI } from '../../../src/components/journal/journalUi.js';

vi.mock('../../../src/shared/journal/useJournalEmbedTitles.js', () => ({
  useJournalEmbedTitles: (html) => html,
}));

const confirmMock = vi.fn().mockResolvedValue(true);
vi.mock('../../../src/shared/components/AppDialogsProvider.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAppDialogs: () => ({
      confirm: (...args) => confirmMock(...args),
      prompt: vi.fn(),
      notify: vi.fn(),
    }),
  };
});

const adapter = {
  resolveEmbeds: vi.fn().mockResolvedValue({ titles: {}, cards: {} }),
};

const article = {
  id: 42,
  title: 'La mare',
  bodyMarkdown: 'Des têtards',
  createdAt: '2026-05-01T10:00:00Z',
  pinned: false,
  assets: [{ id: 1, url: '/uploads/t.jpg' }],
};

describe('JournalArticleReadCard', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('affiche titre, markdown, vignette et actions', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onTogglePin = vi.fn();
    render(
      <JournalArticleReadCard
        article={article}
        adapter={adapter}
        ui={FM_JOURNAL_UI}
        onEdit={onEdit}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        extraMetaLine="Zone : Mare"
      />,
    );
    expect(screen.getByTestId('journal-article-read')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'La mare' })).toBeInTheDocument();
    expect(screen.getByText(/Zone : Mare/)).toBeInTheDocument();
    // alt="" → rôle présentation (pas `img` accessible)
    expect(document.querySelector('.fm-journal__asset-thumb')).toHaveAttribute(
      'src',
      '/uploads/t.jpg',
    );

    fireEvent.click(screen.getByRole('button', { name: /Épingler/i }));
    expect(onTogglePin).toHaveBeenCalledWith(42, true);

    fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    expect(onEdit).toHaveBeenCalledWith(42);

    fireEvent.click(screen.getByRole('button', { name: /Supprimer/i }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(onDelete).toHaveBeenCalledWith(42);
  });

  test('annulation confirm : pas de suppression', async () => {
    confirmMock.mockResolvedValue(false);
    const onDelete = vi.fn();
    render(
      <JournalArticleReadCard
        article={{ ...article, title: '', bodyMarkdown: '' }}
        adapter={adapter}
        ui={FM_JOURNAL_UI}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Article sans titre' })).toBeInTheDocument();
    expect(screen.getByText(/Article sans texte/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Supprimer/i }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(onDelete).not.toHaveBeenCalled();
  });
});
