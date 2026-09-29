import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhotoThumb } from '../../src/shared/components/PhotoThumb.jsx';
import { ImageLightboxProvider } from '../../src/shared/components/ImageLightboxProvider.jsx';

describe('PhotoThumb', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  test('bouton nommé, vignette affichée en différé, original ouvert dans la lightbox', () => {
    render(
      <ImageLightboxProvider>
        <PhotoThumb
          src="/uploads/zones/z1.thumb.jpg"
          fullSrc="/uploads/zones/z1.jpg"
          caption="Mare"
        />
      </ImageLightboxProvider>,
    );
    const button = screen.getByRole('button', { name: 'Agrandir la photo : Mare' });
    const img = button.querySelector('img');
    expect(img.getAttribute('src')).toBe('/uploads/zones/z1.thumb.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');

    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Aperçu : Mare' });
    expect(dialog.querySelector('img').getAttribute('src')).toBe('/uploads/zones/z1.jpg');
  });

  test('sans provider : lightbox locale', () => {
    render(<PhotoThumb src="/uploads/zones/z2.jpg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir la photo' }));
    expect(screen.getByRole('dialog', { name: 'Aperçu de l’image' })).toBeInTheDocument();
  });

  test('image en échec : repli visible au lieu d’une image cassée', () => {
    render(<PhotoThumb src="/uploads/zones/absente.jpg" fallback="🌿" />);
    const button = screen.getByRole('button', { name: 'Agrandir la photo' });
    fireEvent.error(button.querySelector('img'));
    expect(button.querySelector('img')).toBeNull();
    expect(button).toHaveTextContent('🌿');
  });
});
