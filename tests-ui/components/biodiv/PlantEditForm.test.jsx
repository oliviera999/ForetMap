import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api';
import { EMPTY_PLANT_FORM } from '../../../src/utils/plantFormValues.js';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('../../../src/utils/image', () => ({ compressImageWithPreset: vi.fn(async () => 'data:image/jpeg;base64,XXX') }));
vi.mock('../../../src/utils/overlayHistory', () => ({
  armNativeFilePickerGuard: vi.fn(),
  disarmNativeFilePickerGuard: vi.fn(),
}));
// Panneaux déjà testés isolément : neutralisés pour cibler le formulaire seul.
vi.mock('../../../src/components/biodiv/PlantnetIdentifyPanel.jsx', () => ({
  PlantnetIdentifyPanel: () => <div data-testid="plantnet-panel" />,
}));
vi.mock('../../../src/components/biodiv/PlantPrefillPanel.jsx', () => ({
  PlantPrefillPanel: () => <div data-testid="prefill-panel" />,
}));

import { PlantEditForm } from '../../../src/components/biodiv/PlantEditForm.jsx';

function setup(overrides = {}) {
  const props = {
    title: 'Modifier — Pommier',
    form: { ...EMPTY_PLANT_FORM },
    setForm: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    saving: false,
    plantId: 42,
    onToast: vi.fn(),
    ...overrides,
  };
  render(<PlantEditForm {...props} />);
  return props;
}

/** Input file caché du bouton (`📁 Galerie` ou `📸 Appareil photo`) du champ photo `label`. */
function photoFileInput(buttonText, fieldLabel) {
  const field = screen.getByText(`${fieldLabel} (URL directe)`).closest('.field');
  const btn = Array.from(field.querySelectorAll('label.btn')).find((l) => l.textContent.includes(buttonText));
  return btn.querySelector('input[type=file]');
}

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

describe('PlantEditForm', () => {
  test('rend le titre, les champs principaux, les panneaux et les actions', () => {
    setup();
    expect(screen.getByText('Modifier — Pommier')).toBeInTheDocument();
    expect(screen.getByText('Nom *')).toBeInTheDocument();
    expect(screen.getByText('Nom scientifique')).toBeInTheDocument();
    expect(screen.getByTestId('plantnet-panel')).toBeInTheDocument();
    expect(screen.getByTestId('prefill-panel')).toBeInTheDocument();
    expect(screen.getByText('Photo espèce (URL directe)')).toBeInTheDocument();
    expect(screen.getByText('💾 Sauvegarder')).toBeInTheDocument();
    expect(screen.getByText('Annuler')).toBeInTheDocument();
  });

  test('saisie du nom et clic emoji → setForm (updater fonctionnel)', () => {
    // L'updater lit e.target.value : on l'applique pendant l'événement (input contrôlé).
    let applied = null;
    const setForm = vi.fn((updater) => { applied = updater({ ...EMPTY_PLANT_FORM }); });
    setup({ setForm });
    fireEvent.change(screen.getByPlaceholderText('Ex: Aubergine'), { target: { value: 'Pommier' } });
    expect(setForm).toHaveBeenCalled();
    expect(applied).toMatchObject({ name: 'Pommier' });

    const emojiBtn = document.querySelector('.emoji-row .emoji-btn');
    fireEvent.click(emojiBtn);
    expect(applied.emoji).toBe(emojiBtn.textContent);
  });

  test('boutons Sauvegarder/Annuler câblés ; Sauvegarder désactivé pendant saving', () => {
    const { onSave, onCancel } = setup();
    fireEvent.click(screen.getByText('💾 Sauvegarder'));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Annuler'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('appareil photo sur « Photo (générale) » → POST photo-upload en prepend + toast', async () => {
    api.mockResolvedValueOnce({ url: '/uploads/p.jpg' });
    const { onToast, setForm } = setup();
    const input = photoFileInput('📸 Appareil photo', 'Photo (générale)');
    fireEvent.change(input, { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/plants/42/photo-upload', 'POST', {
        field: 'photo',
        imageData: 'data:image/jpeg;base64,XXX',
        position: 'prepend',
      });
    });
    expect(onToast).toHaveBeenCalledWith('Photo importée ✓');
    expect(setForm).toHaveBeenCalled();
  });

  test('upload sans plantId ni onEnsurePlantId → toast de garde, aucun appel serveur', async () => {
    const { onToast } = setup({ plantId: null });
    const input = photoFileInput('📸 Appareil photo', 'Photo espèce');
    fireEvent.change(input, { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Crée d\'abord la fiche, puis ajoute les photos.');
    });
    expect(api).not.toHaveBeenCalled();
  });

  test('galerie multi-fichiers → répartition sur les champs suivants + toast pluriel', async () => {
    const { onToast } = setup();
    const input = photoFileInput('📁 Galerie', 'Photo espèce');
    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ];
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('2 photos importées ✓'));
    expect(api).toHaveBeenNthCalledWith(1, '/api/plants/42/photo-upload', 'POST', expect.objectContaining({ field: 'photo_species', position: 'append' }));
    expect(api).toHaveBeenNthCalledWith(2, '/api/plants/42/photo-upload', 'POST', expect.objectContaining({ field: 'photo_leaf', position: 'append' }));
  });
});
