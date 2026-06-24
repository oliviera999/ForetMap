import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../src/services/api.js', () => ({
  withAppBase: (url) => url,
}));

vi.mock('../../../src/utils/downloadApiFile.js', () => ({
  downloadApiFile: vi.fn(),
}));

import MascotPackImagesPanel from '../../../src/components/mascot/MascotPackImagesPanel.jsx';

const baseProps = {
  packUuid: '00000000-0000-4000-8000-000000000001',
  mapId: 'foret',
  packAssets: [],
  packAssetsLoading: false,
  packAssetsMessage: '',
  libAssets: [],
  libLoading: false,
  libMessage: '',
  globalAssets: [
    {
      id: 'pub1',
      source: 'public',
      filename: 'site.png',
      url: '/assets/mascots/site.png',
    },
  ],
  globalAssetsLoading: false,
  globalAssetsMessage: '',
  editorPack: { stateFrames: {} },
  packVersion: 1,
  targetState: 'idle',
  onTargetStateChange: vi.fn(),
  sourceFilter: 'site',
  onSourceFilterChange: vi.fn(),
  search: '',
  onSearchChange: vi.fn(),
  onReloadAll: vi.fn(),
  onPackUpload: vi.fn(),
  onMapUpload: vi.fn(),
  onSetFramesBasePack: vi.fn(),
  onSetFramesBaseMap: vi.fn(),
  onInsertImage: vi.fn(),
  onBulkInsert: vi.fn(),
  onDeletePackAsset: vi.fn(),
  onDeleteMapAsset: vi.fn(),
  onDeletePublicAsset: vi.fn(),
  onBulkDelete: vi.fn(),
  onBulkRename: vi.fn(),
  onBulkReplace: vi.fn(),
  onRemoveFromTargetState: vi.fn(),
  onMoveInTargetState: vi.fn(),
  onBulkInteractionApply: vi.fn(),
  onUpgradeToV2: vi.fn(),
};

describe('MascotPackImagesPanel', () => {
  test('affiche les actions copier, télécharger et supprimer pour un sprite site', () => {
    render(<MascotPackImagesPanel {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Copier URL' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Télécharger' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeTruthy();
  });

  test('supprimer un sprite site transmet l’URL publique', () => {
    const onDeletePublicAsset = vi.fn();
    render(<MascotPackImagesPanel {...baseProps} onDeletePublicAsset={onDeletePublicAsset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onDeletePublicAsset).toHaveBeenCalledWith('/assets/mascots/site.png');
  });

  test('sélection tout puis ajout groupé', () => {
    const onBulkInsert = vi.fn();
    render(<MascotPackImagesPanel {...baseProps} onBulkInsert={onBulkInsert} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Repos \(1\)/ }));
    expect(onBulkInsert).toHaveBeenCalledTimes(1);
    expect(onBulkInsert.mock.calls[0][0]).toHaveLength(1);
    expect(onBulkInsert.mock.calls[0][0][0].filename).toBe('site.png');
  });

  test('suppression groupée transmet les entrées sélectionnées', () => {
    const onBulkDelete = vi.fn();
    render(<MascotPackImagesPanel {...baseProps} onBulkDelete={onBulkDelete} />);
    fireEvent.click(screen.getByLabelText('Sélectionner site.png'));
    fireEvent.click(screen.getByRole('button', { name: /Supprimer \(1\)/ }));
    expect(onBulkDelete).toHaveBeenCalledTimes(1);
  });
});
