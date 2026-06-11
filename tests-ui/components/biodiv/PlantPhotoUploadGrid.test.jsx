import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../../../src/services/api';

vi.mock('../../../src/services/api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('../../../src/utils/image', () => ({ compressImageWithPreset: vi.fn(async () => 'data:img') }));
vi.mock('../../../src/utils/overlayHistory', () => ({ disarmNativeFilePickerGuard: vi.fn() }));

import { PlantPhotoUploadGrid } from '../../../src/components/biodiv/PlantPhotoUploadGrid.jsx';

const FORM = {
  photo: '', photo_species: 'https://x/sp.jpg', photo_leaf: '', photo_flower: '', photo_fruit: '', photo_harvest_part: '',
};

function setup(overrides = {}) {
  const props = {
    saving: false,
    plantId: 7,
    onEnsurePlantId: null,
    form: { ...FORM },
    setForm: vi.fn(),
    onToast: vi.fn(),
    ...overrides,
  };
  render(<PlantPhotoUploadGrid {...props} />);
  return props;
}

beforeEach(() => { api.mockReset(); api.mockResolvedValue({ url: '/uploads/p.jpg' }); });
afterEach(() => vi.restoreAllMocks());

describe('PlantPhotoUploadGrid', () => {
  test('rend un bloc par champ photo, valeurs URL préremplies', () => {
    setup();
    expect(screen.getByText('Photo espèce (URL directe)')).toBeInTheDocument();
    expect(screen.getByText('Photo (générale) (URL directe)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://x/sp.jpg')).toBeInTheDocument();
    expect(screen.getAllByText('📁 Galerie')).toHaveLength(6);
    expect(screen.getAllByText('📸 Appareil photo')).toHaveLength(6);
  });

  test('édition d’une URL → met à jour le bon champ (état parent réel)', () => {
    // setForm exécute l'updater synchroniquement en usage réel : on utilise un vrai état parent
    // (un mock ne re-rendant pas, React resynchroniserait l'input contrôlé avant lecture).
    function Host() {
      const [form, setForm] = React.useState({ ...FORM });
      return <PlantPhotoUploadGrid form={form} setForm={setForm} plantId={7} />;
    }
    render(<Host />);
    fireEvent.change(screen.getByDisplayValue('https://x/sp.jpg'), { target: { value: 'https://x/new.jpg' } });
    expect(screen.getByDisplayValue('https://x/new.jpg')).toBeInTheDocument();
  });

  test('appareil photo : upload → POST photo-upload (append) + toast ✓', async () => {
    const { onToast, setForm } = setup();
    const camInput = document.querySelectorAll('input[type=file][capture]')[1]; // photo_species (2e champ ? ordre = options)
    fireEvent.change(camInput, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/plants/7/photo-upload', 'POST', expect.objectContaining({ imageData: 'data:img', position: 'append' }));
    });
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('Photo importée ✓'));
    expect(setForm).toHaveBeenCalled();
  });

  test('champ « photo » (générale) → position prepend', async () => {
    setup();
    // l'option { key: 'photo' } est la dernière de PLANT_PHOTO_FIELD_OPTIONS
    const camInputs = document.querySelectorAll('input[type=file][capture]');
    fireEvent.change(camInputs[camInputs.length - 1], { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/plants/7/photo-upload', 'POST', expect.objectContaining({ field: 'photo', position: 'prepend' }));
    });
  });

  test('sans plantId ni onEnsurePlantId → toast « Crée d’abord la fiche », aucun appel', async () => {
    const { onToast } = setup({ plantId: null });
    const camInput = document.querySelectorAll('input[type=file][capture]')[0];
    fireEvent.change(camInput, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(onToast).toHaveBeenCalledWith("Crée d'abord la fiche, puis ajoute les photos."));
    expect(api).not.toHaveBeenCalled();
  });

  test('galerie multi-fichiers → répartit sur les champs suivants dans l’ordre + toast « N photos »', async () => {
    const { onToast } = setup();
    const galInput = document.querySelectorAll('input[type=file][multiple]')[0]; // photo_species (1re option)
    fireEvent.change(galInput, {
      target: { files: [new File(['1'], '1.jpg', { type: 'image/jpeg' }), new File(['2'], '2.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api.mock.calls[0][2]).toMatchObject({ field: 'photo_species', position: 'append' });
    expect(api.mock.calls[1][2]).toMatchObject({ field: 'photo_leaf', position: 'append' });
    await waitFor(() => expect(onToast).toHaveBeenCalledWith('2 photos importées ✓'));
  });
});
