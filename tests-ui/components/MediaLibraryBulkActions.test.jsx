import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MediaLibraryBulkActions } from '../../src/components/media/MediaLibraryBulkActions.jsx';

function setup(overrides = {}) {
  const props = {
    busy: false,
    visibleCount: 3,
    selectedCount: 2,
    totalCount: 5,
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    onDeleteSelected: vi.fn(),
    onClearLibrary: vi.fn(),
    ...overrides,
  };
  render(<MediaLibraryBulkActions {...props} />);
  return props;
}

describe('MediaLibraryBulkActions', () => {
  test('affiche le compteur de sélection dans le bouton de suppression', () => {
    setup({ selectedCount: 2 });
    expect(screen.getByRole('button', { name: 'Supprimer la sélection (2)' })).toBeTruthy();
  });

  test('omet le compteur quand rien n’est sélectionné', () => {
    setup({ selectedCount: 0 });
    expect(screen.getByRole('button', { name: 'Supprimer la sélection' })).toBeTruthy();
  });

  test('les clics remontent les callbacks au parent', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Tout sélectionner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner' }));
    fireEvent.click(screen.getByRole('button', { name: /Supprimer la sélection/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vider la bibliothèque' }));
    expect(props.onSelectAll).toHaveBeenCalledTimes(1);
    expect(props.onDeselectAll).toHaveBeenCalledTimes(1);
    expect(props.onDeleteSelected).toHaveBeenCalledTimes(1);
    expect(props.onClearLibrary).toHaveBeenCalledTimes(1);
  });

  test('désactive tous les boutons quand busy', () => {
    setup({ busy: true });
    for (const button of screen.getAllByRole('button')) {
      expect(button.disabled).toBe(true);
    }
  });

  test('désactive « Tout sélectionner » quand aucun média visible', () => {
    setup({ visibleCount: 0 });
    expect(screen.getByRole('button', { name: 'Tout sélectionner' }).disabled).toBe(true);
  });

  test('désactive « Vider la bibliothèque » quand la bibliothèque est vide', () => {
    setup({ totalCount: 0 });
    expect(screen.getByRole('button', { name: 'Vider la bibliothèque' }).disabled).toBe(true);
  });
});
