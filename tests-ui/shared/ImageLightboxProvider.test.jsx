import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageLightboxProvider } from '../../src/shared/components/ImageLightboxProvider.jsx';

describe('ImageLightboxProvider', () => {
  test('clic sur illustration → overlay lightbox avec légende', () => {
    render(
      <ImageLightboxProvider>
        <figure>
          <img src="/scene.jpg" alt="Scène du récit" width="320" height="240" />
          <figcaption>Chapitre 2</figcaption>
        </figure>
      </ImageLightboxProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agrandir l’image : Scène du récit' }));

    const dialog = screen.getByRole('dialog', { name: 'Aperçu : Chapitre 2' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('.fm-lightbox-caption')).toHaveTextContent('Chapitre 2');
  });

  test('clic sur image dans un bouton → pas de lightbox globale', () => {
    const onButtonClick = vi.fn();
    render(
      <ImageLightboxProvider>
        <button type="button" onClick={onButtonClick}>
          <img src="/pick.jpg" alt="Choisir" width="80" height="80" />
        </button>
      </ImageLightboxProvider>,
    );

    fireEvent.click(screen.getByAltText('Choisir'));

    expect(onButtonClick).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
