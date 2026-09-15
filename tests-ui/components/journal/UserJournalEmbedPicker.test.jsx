import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => 'jwt',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { UserJournalEmbedPicker } from '../../../src/components/journal/UserJournalEmbedPicker.jsx';

describe('UserJournalEmbedPicker — sélecteur d’encarts partagé, habillage ForetMap', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((url) => {
      if (String(url).includes('/embeds/search')) {
        return Promise.resolve({
          results: [{ type: 'plant', ref: '12', title: 'Noisetier' }],
        });
      }
      return Promise.resolve({});
    });
  });

  test('affiche les types ForetMap, recherche une espèce puis l’insère', async () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    render(<UserJournalEmbedPicker open onClose={onClose} onInsert={onInsert} />);
    expect(screen.getByRole('heading', { name: 'Insérer un élément' })).toBeInTheDocument();
    const typeSelect = screen.getByLabelText('Type d’élément');
    expect([...typeSelect.options].map((o) => o.value)).toEqual([
      'plant',
      'glossary',
      'tutorial',
      'module_stub',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Insérer' }));
    expect(onInsert).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Rechercher une espèce'), {
      target: { value: 'Nois' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Noisetier' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Noisetier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insérer' }));
    expect(onInsert).toHaveBeenCalledWith('plant', '12');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('rappel de module : liste des modules, valeur par défaut « plants »', () => {
    const onInsert = vi.fn();
    render(<UserJournalEmbedPicker open onClose={vi.fn()} onInsert={onInsert} />);
    fireEvent.change(screen.getByLabelText('Type d’élément'), { target: { value: 'module_stub' } });
    const moduleSelect = screen.getByLabelText('Module');
    expect([...moduleSelect.options].map((o) => o.value)).toContain('foodweb');
    fireEvent.click(screen.getByRole('button', { name: 'Insérer' }));
    expect(onInsert).toHaveBeenCalledWith('module_stub', 'plants');

    fireEvent.change(moduleSelect, { target: { value: 'quiz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insérer' }));
    expect(onInsert).toHaveBeenLastCalledWith('module_stub', 'quiz');
  });

  test('thème ForetMap : champs .fm-journal-field et boutons .btn ; fermé → rien', () => {
    const { container, unmount } = render(
      <UserJournalEmbedPicker open onClose={vi.fn()} onInsert={vi.fn()} />,
    );
    expect(container.ownerDocument.querySelector('label.fm-journal-field')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Insérer' }).className).toContain('btn-primary');
    unmount();
    render(<UserJournalEmbedPicker open={false} onClose={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
