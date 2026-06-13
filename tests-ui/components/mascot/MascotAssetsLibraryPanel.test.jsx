import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MascotAssetsLibraryPanel from '../../../src/components/mascot/MascotAssetsLibraryPanel.jsx';

function setup(extra = {}) {
  const props = {
    libAssets: [],
    libLoading: false,
    libMessage: '',
    onReloadLibrary: vi.fn(),
    onSetFramesBaseToLibrary: vi.fn(),
    onLibUpload: vi.fn(),
    onLibDelete: vi.fn(),
    globalAssetsLoading: false,
    globalAssetsMessage: '',
    filteredAssets: [],
    globalAssetSearch: '',
    onGlobalAssetSearchChange: vi.fn(),
    globalTargetState: 'idle',
    onGlobalTargetStateChange: vi.fn(),
    onReloadGlobalAssets: vi.fn(),
    onInsertGlobalAsset: vi.fn(),
    ...extra,
  };
  render(<MascotAssetsLibraryPanel {...props} />);
  return props;
}

describe('MascotAssetsLibraryPanel', () => {
  test('affiche les deux sections et l’état vide de bibliothèque', () => {
    setup();
    expect(screen.getByText('Bibliothèque de la carte')).toBeTruthy();
    expect(screen.getByText('Tous les assets mascotte du site')).toBeTruthy();
    expect(screen.getByText('Aucun PNG dans la bibliothèque pour cette carte.')).toBeTruthy();
    expect(screen.getByText('Aucun asset trouvé pour ce filtre.')).toBeTruthy();
  });

  test('« Définir framesBase sur la bibliothèque » déclenche le callback', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Définir framesBase sur la bibliothèque' }));
    expect(props.onSetFramesBaseToLibrary).toHaveBeenCalledTimes(1);
  });

  test('supprimer un sprite de bibliothèque transmet le nom de fichier', () => {
    const props = setup({ libAssets: [{ filename: 'a.png', url: '/x/a.png' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(props.onLibDelete).toHaveBeenCalledWith('a.png');
  });

  test('« Utiliser » sur un asset global transmet l’URL', () => {
    const props = setup({
      filteredAssets: [{ id: '1', source: 'pack', filename: 'b.png', url: '/y/b.png' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser' }));
    expect(props.onInsertGlobalAsset).toHaveBeenCalledWith('/y/b.png');
  });

  test('le champ de filtre remonte la saisie', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText(/Filtrer/), { target: { value: 'foo' } });
    expect(props.onGlobalAssetSearchChange).toHaveBeenCalledWith('foo');
  });
});
