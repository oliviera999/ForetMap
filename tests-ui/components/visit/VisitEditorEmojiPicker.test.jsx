import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { VisitEditorEmojiPicker } from '../../../src/components/visit/VisitEditorEmojiPicker.jsx';

const EMOJIS = ['📍', '🌳', '🐦'];

function setup(overrides = {}) {
  const props = {
    selectedType: 'marker',
    markerEmojis: EMOJIS,
    selectedEmoji: '📍',
    onClearEmoji: vi.fn(),
    onSelectEmoji: vi.fn(),
    ...overrides,
  };
  render(<VisitEditorEmojiPicker {...props} />);
  return props;
}

describe('VisitEditorEmojiPicker', () => {
  test('rend un bouton par emoji proposé', () => {
    setup();
    EMOJIS.forEach((emoji) => {
      expect(screen.getByRole('button', { name: emoji })).toBeInTheDocument();
    });
  });

  test('marque l’emoji courant comme sélectionné', () => {
    setup({ selectedEmoji: '🌳' });
    expect(screen.getByRole('button', { name: '🌳' })).toHaveClass('sel');
    expect(screen.getByRole('button', { name: '📍' })).not.toHaveClass('sel');
  });

  test('cliquer un emoji remonte sa valeur via onSelectEmoji', () => {
    const { onSelectEmoji } = setup();
    fireEvent.click(screen.getByRole('button', { name: '🐦' }));
    expect(onSelectEmoji).toHaveBeenCalledWith('🐦');
  });

  test('mode repère : affiche « Sans emoji » et remonte onClearEmoji', () => {
    const { onClearEmoji } = setup({ selectedType: 'marker' });
    const btn = screen.getByRole('button', { name: 'Sans emoji' });
    fireEvent.click(btn);
    expect(onClearEmoji).toHaveBeenCalledTimes(1);
  });

  test('mode repère sans emoji : le bouton « Sans emoji » est sélectionné', () => {
    setup({ selectedType: 'marker', selectedEmoji: '' });
    expect(screen.getByRole('button', { name: 'Sans emoji' })).toHaveClass('sel');
  });

  test('mode zone : pas de bouton « Sans emoji » et libellé adapté', () => {
    setup({ selectedType: 'zone' });
    expect(screen.queryByRole('button', { name: 'Sans emoji' })).toBeNull();
    expect(screen.getByText('Liste d’emojis (insérer dans le titre de zone)')).toBeInTheDocument();
  });

  test('mode repère : libellé « Emoji du repère (optionnel) »', () => {
    setup({ selectedType: 'marker' });
    expect(screen.getByText('Emoji du repère (optionnel)')).toBeInTheDocument();
  });
});
