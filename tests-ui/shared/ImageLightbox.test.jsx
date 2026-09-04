import { describe, test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageLightbox } from '../../src/shared/components/ImageLightbox.jsx';
import { ImageLightboxProvider } from '../../src/shared/components/ImageLightboxProvider.jsx';

function renderLightbox(props = {}) {
  const onClose = vi.fn();
  const utils = render(
    <ImageLightbox src="/photo.jpg" caption="Un pommier" onClose={onClose} {...props} />,
  );
  return { onClose, ...utils };
}

describe('ImageLightbox', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  test('rend un dialogue modal « Aperçu image » dans un conteneur sous body', () => {
    const { container } = renderLightbox();

    const dialog = screen.getByRole('dialog', { name: 'Aperçu image' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);

    const img = screen.getByRole('img', { name: 'Un pommier' });
    expect(img).toHaveAttribute('src', '/photo.jpg');
    expect(img).toHaveClass('fm-lightbox-image');
    expect(dialog.querySelector('.fm-lightbox-caption')).toHaveTextContent('Un pommier');
  });

  test('sans légende : pas de paragraphe de légende, alt vide', () => {
    renderLightbox({ caption: '' });
    const dialog = screen.getByRole('dialog', { name: 'Aperçu image' });
    expect(dialog.querySelector('.fm-lightbox-caption')).toBeNull();
    expect(dialog.querySelector('img')).toHaveAttribute('alt', '');
  });

  test('verrouille le défilement du body au montage et le libère au démontage', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = renderLightbox();
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  test('le conteneur du portail est retiré du body au démontage', () => {
    const { unmount } = renderLightbox();
    expect(document.body.querySelector('.fm-lightbox-overlay')).not.toBeNull();

    unmount();
    expect(document.body.querySelector('.fm-lightbox-overlay')).toBeNull();
  });

  test('focus initial sur le bouton de fermeture (premier focusable)', () => {
    renderLightbox();
    expect(screen.getByRole('button', { name: "Fermer l'aperçu" })).toHaveFocus();
  });

  test('clic sur l’overlay → onClose', () => {
    const { onClose } = renderLightbox();
    fireEvent.click(document.body.querySelector('.fm-lightbox-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clic sur le panneau ou sur l’image ne ferme pas (stopPropagation)', () => {
    const { onClose } = renderLightbox();
    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('img', { name: 'Un pommier' }));
    fireEvent.click(screen.getByText('Un pommier'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('bouton « Fermer l’aperçu » → onClose', () => {
    const { onClose } = renderLightbox();
    fireEvent.click(screen.getByRole('button', { name: "Fermer l'aperçu" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape → onClose', () => {
    const { onClose } = renderLightbox();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('le focus revient sur l’image déclencheuse après fermeture', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Voir';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = renderLightbox();
    expect(trigger).not.toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});

describe('ImageLightboxProvider — cycle ouverture / fermeture', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  test('clic image → lightbox + verrou de scroll ; fermeture → retour à l’état initial', () => {
    render(
      <ImageLightboxProvider>
        <img src="/zone.jpg" alt="Zone humide" width="400" height="300" />
      </ImageLightboxProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('img', { name: 'Zone humide' }));
    const dialog = screen.getByRole('dialog', { name: 'Aperçu image' });
    // jsdom résout `img.src` en URL absolue : on vérifie la fin du chemin, pas l'origine.
    expect(dialog.querySelector('img').getAttribute('src')).toMatch(/\/zone\.jpg$/);
    expect(dialog.querySelector('.fm-lightbox-caption')).toHaveTextContent('Zone humide');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: "Fermer l'aperçu" }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  test('Escape ferme la lightbox ouverte par délégation', () => {
    render(
      <ImageLightboxProvider>
        <img src="/zone.jpg" alt="Zone humide" width="400" height="300" />
      </ImageLightboxProvider>,
    );
    fireEvent.click(screen.getByRole('img', { name: 'Zone humide' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('un clic sur l’image agrandie ne rouvre pas une seconde lightbox', () => {
    render(
      <ImageLightboxProvider>
        <img src="/zone.jpg" alt="Zone humide" width="400" height="300" />
      </ImageLightboxProvider>,
    );
    fireEvent.click(screen.getByRole('img', { name: 'Zone humide' }));
    const dialog = screen.getByRole('dialog');

    fireEvent.click(dialog.querySelector('img'));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  test('data-no-lightbox et images minuscules sont ignorées', () => {
    render(
      <ImageLightboxProvider>
        <img src="/deco.jpg" alt="Décoration" data-no-lightbox width="400" height="300" />
        <img src="/icone.png" alt="Icône" width="16" height="16" />
      </ImageLightboxProvider>,
    );
    fireEvent.click(screen.getByRole('img', { name: 'Décoration' }));
    fireEvent.click(screen.getByRole('img', { name: 'Icône' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('l’écouteur global est retiré au démontage du provider', () => {
    const { unmount } = render(
      <ImageLightboxProvider>
        <img src="/zone.jpg" alt="Zone humide" width="400" height="300" />
      </ImageLightboxProvider>,
    );
    unmount();

    const orphan = document.createElement('img');
    orphan.src = '/orphan.jpg';
    orphan.width = 200;
    orphan.height = 200;
    document.body.appendChild(orphan);
    fireEvent.click(orphan);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    orphan.remove();
  });
});
