import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserJournalEmbedPicker } from '../../../src/components/journal/UserJournalEmbedPicker.jsx';

/** Miroir ForetMap du test G&L : même dialogue partagé, registre de types et thème du produit. */
describe('UserJournalEmbedPicker — sélecteur d’encarts partagé, habillage ForetMap', () => {
  test('affiche les types ForetMap, insère une fiche espèce puis se ferme', () => {
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

    // Référence vide : rien n'est inséré.
    fireEvent.click(screen.getByRole('button', { name: 'Insérer' }));
    expect(onInsert).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Identifiant de fiche espèce'), {
      target: { value: ' 12 ' },
    });
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
