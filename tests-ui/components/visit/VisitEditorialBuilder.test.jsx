import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// MarkdownTextarea est un éditeur riche (contentEditable) : on le réduit à un textarea simple
// pour isoler le câblage propre du builder (l'éditeur riche est testé ailleurs).
vi.mock('../../../src/components/MarkdownTextarea.jsx', () => ({
  MarkdownTextarea: ({ value, onChange, placeholder }) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} />
  ),
}));

import { VisitEditorialBuilder } from '../../../src/components/visit/VisitEditorialBuilder.jsx';

const BLOCKS = [
  { id: 'a', type: 'paragraph', markdown: 'Bonjour' },
  { id: 'b', type: 'heading', text: 'Section' },
  { id: 'c', type: 'image', media_ids: [3], size: 'lg', caption: 'Légende' },
];

function setup(overrides = {}) {
  const props = {
    blocks: BLOCKS,
    mediaList: [{ id: 3, caption: 'Photo' }],
    onAdd: vi.fn(),
    onMove: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  render(<VisitEditorialBuilder {...props} />);
  return props;
}

describe('VisitEditorialBuilder', () => {
  test('rend un item par bloc avec son libellé de type', () => {
    setup();
    expect(screen.getByText('Paragraphe')).toBeInTheDocument();
    expect(screen.getByText('Intertitre')).toBeInTheDocument();
    expect(screen.getByText('Image(s)')).toBeInTheDocument();
  });

  test('les 3 boutons d’ajout appellent onAdd avec le bon type', () => {
    const { onAdd } = setup();
    fireEvent.click(screen.getByText('+ Paragraphe'));
    fireEvent.click(screen.getByText('+ Intertitre'));
    fireEvent.click(screen.getByText('+ Bloc image'));
    expect(onAdd.mock.calls.map((c) => c[0])).toEqual(['paragraph', 'heading', 'image']);
  });

  test('flèches bornées : ↑ désactivée sur le 1er, ↓ désactivée sur le dernier', () => {
    setup();
    const ups = screen.getAllByRole('button', { name: '↑' });
    const downs = screen.getAllByRole('button', { name: '↓' });
    expect(ups[0]).toBeDisabled(); // 1er bloc
    expect(ups[2]).not.toBeDisabled(); // dernier bloc peut monter
    expect(downs[2]).toBeDisabled(); // dernier bloc
    expect(downs[0]).not.toBeDisabled(); // 1er bloc peut descendre
  });

  test('↑ / ↓ / Suppr. émettent l’intention avec l’id et le delta', () => {
    const { onMove, onRemove } = setup();
    fireEvent.click(screen.getAllByRole('button', { name: '↓' })[0]); // descendre 'a'
    fireEvent.click(screen.getAllByRole('button', { name: '↑' })[2]); // monter 'c'
    fireEvent.click(screen.getAllByText('Suppr.')[1]); // supprimer 'b'
    expect(onMove).toHaveBeenCalledWith('a', 1);
    expect(onMove).toHaveBeenCalledWith('c', -1);
    expect(onRemove).toHaveBeenCalledWith('b');
  });

  test('édition d’un paragraphe → onUpdate(id, { markdown })', () => {
    const { onUpdate } = setup();
    const textarea = screen.getByPlaceholderText('Texte (Markdown léger)');
    fireEvent.change(textarea, { target: { value: 'Nouveau texte' } });
    expect(onUpdate).toHaveBeenCalledWith('a', { markdown: 'Nouveau texte' });
  });

  test('édition d’un intertitre → onUpdate(id, { text })', () => {
    const { onUpdate } = setup();
    const input = screen.getByPlaceholderText('Titre de section');
    fireEvent.change(input, { target: { value: 'Nouveau titre' } });
    expect(onUpdate).toHaveBeenCalledWith('b', { text: 'Nouveau titre' });
  });

  test('taille et légende d’un bloc image → onUpdate ciblé', () => {
    const { onUpdate } = setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sm' } });
    fireEvent.change(screen.getByPlaceholderText('Légende du bloc (optionnel)'), {
      target: { value: 'X' },
    });
    expect(onUpdate).toHaveBeenCalledWith('c', { size: 'sm' });
    expect(onUpdate).toHaveBeenCalledWith('c', { caption: 'X' });
  });

  test('liste vide → aucun item, boutons d’ajout présents', () => {
    setup({ blocks: [] });
    expect(screen.queryByText('Paragraphe')).not.toBeInTheDocument();
    expect(screen.getByText('+ Paragraphe')).toBeInTheDocument();
  });
});
