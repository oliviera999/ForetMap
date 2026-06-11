import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('../../../src/utils/image', () => ({ compressImageWithPreset: vi.fn(async () => 'data:image/jpeg;base64,XXX') }));
vi.mock('../../../src/utils/overlayHistory', () => ({
  armNativeFilePickerGuard: vi.fn(),
  disarmNativeFilePickerGuard: vi.fn(),
}));

import { PlantnetIdentifyPanel } from '../../../src/components/biodiv/PlantnetIdentifyPanel.jsx';

function setup(overrides = {}) {
  const props = {
    saving: false,
    plantId: 42,
    onEnsurePlantId: vi.fn(),
    setForm: vi.fn(),
    onToast: vi.fn(),
    ...overrides,
  };
  render(<PlantnetIdentifyPanel {...props} />);
  return props;
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

describe('PlantnetIdentifyPanel', () => {
  test('rend 1 slot par défaut (organe + galerie + appareil photo)', () => {
    setup();
    expect(screen.getByText('Identifier une plante à partir de photos (Pl@ntNet)')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument(); // sélecteur d'organe
    expect(screen.getByText('📁 Galerie / fichier')).toBeInTheDocument();
    expect(screen.getByText('📸 Appareil photo')).toBeInTheDocument();
  });

  test('« + Ajouter une image » ajoute un slot (jusqu’à 5)', () => {
    setup();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    fireEvent.click(screen.getByText('+ Ajouter une image'));
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    // le bouton « Retirer » apparaît dès 2 slots
    expect(screen.getAllByText('Retirer').length).toBe(2);
  });

  test('« Lancer l’identification » sans image → toast, aucun appel serveur', () => {
    const { onToast } = setup();
    fireEvent.click(screen.getByText('Lancer l’identification'));
    expect(onToast).toHaveBeenCalledWith('Ajoute au moins une photo (1 à 5).');
    expect(api).not.toHaveBeenCalled();
  });

  test('upload puis identification → POST /plantnet-identify et propositions affichées', async () => {
    api.mockReset();
    api.mockResolvedValueOnce({ predictions: [{ scientificName: 'Malus domestica', score: 0.9, commonNames: [] }] });
    setup();
    // sélectionne un fichier sur l'input galerie (caché)
    const fileInput = document.getElementById(
      screen.getByText('📁 Galerie / fichier').closest('div').querySelector('input[type=file]').id,
    );
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'feuille.jpg', { type: 'image/jpeg' })] } });
    await screen.findByText(/Fichier : feuille\.jpg/);
    fireEvent.click(screen.getByText('Lancer l’identification'));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/plants/plantnet-identify', 'POST', expect.objectContaining({
        images: [{ organ: 'auto', imageData: 'data:image/jpeg;base64,XXX' }],
        nbResults: 10,
        lang: 'fr',
      }));
    });
    expect(await screen.findByText(/Malus domestica/)).toBeInTheDocument();
  });
});
