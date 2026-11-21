/** @vitest-environment jsdom */
// Écrans de séance, étape 6 (K11) : à l'envoi d'une image de marque, l'emplacement retient
// la variante WebP allégée rendue par le serveur ; l'original reste dans la médiathèque.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { GLBrandEditor } from '../../src/gl/components/GLBrandEditor.jsx';

const apiGlMock = vi.fn();
const compressMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

vi.mock('../../src/shared/platform/image.js', () => ({
  compressImageWithPreset: (...args) => compressMock(...args),
  isLikelyImageFile: (file) => Boolean(file) && String(file.type || '').startsWith('image/'),
}));

const ORIGINAL_URL = '/uploads/media-library/image/2026/11/1763600000000-abcdef0123.jpg';
const VARIANT_URL = '/uploads/gl_brand/optim/1763600000000-abcdef0123-0123456789ab-w1600.webp';

/** Monte l'éditeur et rend de quoi envoyer un fichier dans un emplacement, puis lire la marque. */
function setup(initial = { slots: {} }) {
  let brand = initial;
  const onChange = vi.fn((updater) => {
    brand = typeof updater === 'function' ? updater(brand) : updater;
  });
  const onStatus = vi.fn();
  const view = render(<GLBrandEditor value={brand} onChange={onChange} onStatus={onStatus} />);
  const cards = [...view.container.querySelectorAll('.gl-brand-editor-card')];
  const pick = (index, file) => {
    const input = cards[index].querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
  };
  return { onChange, onStatus, pick, getBrand: () => brand };
}

const photo = () => new File(['x'], 'monde.png', { type: 'image/png' });

describe('GLBrandEditor — envoi d’une image de marque', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    compressMock.mockReset();
    compressMock.mockResolvedValue('data:image/jpeg;base64,AAAA');
  });

  it('l’emplacement pointe vers la variante allégée après l’envoi', async () => {
    apiGlMock.mockResolvedValue({
      url: ORIGINAL_URL,
      optimized: { url: VARIANT_URL, size: 150000, width: 1600, height: 900 },
    });
    const { onStatus, pick, getBrand } = setup({
      slots: { card_world: { imageUrl: '/uploads/gl_brand/world.png', title: 'Un monde' } },
    });

    pick(1, photo());

    await waitFor(() => expect(onStatus).toHaveBeenCalled());
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/admin/media-library', 'POST', {
      media_data: 'data:image/jpeg;base64,AAAA',
      usage: 'brand',
    });
    expect(getBrand().slots.card_world.imageUrl).toBe(VARIANT_URL);
    expect(getBrand().slots.card_world.title).toBe('Un monde');
    expect(onStatus).toHaveBeenCalledWith(
      'Image de charte importée, en version allégée pour l’accueil.',
    );
  });

  it('sans variante (image déjà légère), l’emplacement garde l’adresse de l’original', async () => {
    apiGlMock.mockResolvedValue({ url: ORIGINAL_URL, optimized: null });
    const { onStatus, pick, getBrand } = setup();

    pick(0, photo());

    await waitFor(() => expect(onStatus).toHaveBeenCalled());
    expect(getBrand().slots.hero.imageUrl).toBe(ORIGINAL_URL);
    expect(onStatus).toHaveBeenCalledWith('Image de charte importee.');
  });

  it('un envoi refusé ne touche pas l’emplacement et dit pourquoi', async () => {
    apiGlMock.mockRejectedValue(new Error('Fichier trop volumineux'));
    const { onChange, onStatus, pick } = setup();

    pick(2, photo());

    await waitFor(() => expect(onStatus).toHaveBeenCalledWith('Fichier trop volumineux', true));
    expect(onChange).not.toHaveBeenCalled();
  });
});
