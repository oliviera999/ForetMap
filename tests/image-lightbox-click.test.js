import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  decorateLightboxImage,
  decorateLightboxImagesIn,
  handleImageLightboxClick,
  isDecorativeImage,
  isImageLightboxExcluded,
  resolveImageLightboxCaption,
  resolveImageLightboxSrc,
  shouldOpenImageLightbox,
} from '../src/shared/utils/imageLightboxClick.js';

function dom(html) {
  const { window } = new JSDOM(html);
  return window;
}

describe('imageLightboxClick', () => {
  it('resolveImageLightboxSrc préfère data-lightbox-src', () => {
    const win = dom(
      '<img src="/thumb.jpg" data-lightbox-src="/full.jpg" alt="" width="200" height="200" />',
    );
    const img = win.document.querySelector('img');
    assert.equal(resolveImageLightboxSrc(img), '/full.jpg');
  });

  it('resolveImageLightboxCaption lit figcaption puis alt', () => {
    const win = dom(
      '<figure><img src="/a.jpg" alt="Alt seul" width="200" height="200" /><figcaption>Légende</figcaption></figure>',
    );
    const img = win.document.querySelector('img');
    assert.equal(resolveImageLightboxCaption(img), 'Légende');
    win.document.querySelector('figcaption').remove();
    assert.equal(resolveImageLightboxCaption(img), 'Alt seul');
  });

  it('exclut cartes, mascottes, boutons et data-no-lightbox', () => {
    const win = dom(`
      <div class="map-view-canvas"><img src="/map.png" alt="" width="200" height="200" /></div>
      <button><img src="/b.jpg" alt="" width="200" height="200" /></button>
      <img src="/c.jpg" alt="" data-no-lightbox width="200" height="200" />
      <div class="visit-map-mascot"><img src="/m.png" alt="" width="200" height="200" /></div>
    `);
    const imgs = [...win.document.querySelectorAll('img')];
    assert.ok(imgs.every((img) => isImageLightboxExcluded(img)));
  });

  it('shouldOpenImageLightbox accepte une illustration standalone', () => {
    const win = dom(
      '<figure><img src="/scene.jpg" alt="Scène" width="400" height="300" /><figcaption>Chapitre 1</figcaption></figure>',
    );
    const img = win.document.querySelector('img');
    assert.equal(shouldOpenImageLightbox(img), true);
  });

  it('handleImageLightboxClick ouvre avec src et légende', () => {
    const win = dom(
      '<figure><img src="/scene.jpg" alt="Scène" width="400" height="300" /><figcaption>Chapitre 1</figcaption></figure>',
    );
    const img = win.document.querySelector('img');
    let opened = null;
    const event = new win.MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: img });
    const handled = handleImageLightboxClick(event, (payload) => {
      opened = payload;
    });
    assert.equal(handled, true);
    assert.deepEqual(opened, { src: '/scene.jpg', caption: 'Chapitre 1', gallery: null, index: 0 });
  });
  it('decorateLightboxImage rend focalisable une image informative', () => {
    const win = dom('<img src="/scene.jpg" alt="Scène" width="400" height="300" />');
    const img = win.document.querySelector('img');
    decorateLightboxImage(img);
    assert.equal(img.getAttribute('role'), 'button');
    assert.equal(img.getAttribute('tabindex'), '0');
    assert.equal(img.getAttribute('aria-label'), 'Agrandir l’image : Scène');
    assert.ok(img.hasAttribute('data-lightbox-focusable'));
  });

  it('decorateLightboxImage laisse intacte une image décorative (presentation-role-conflict)', () => {
    const win = dom(`
      <img id="a" src="/a.jpg" alt="" width="400" height="300" />
      <img id="b" src="/b.jpg" alt="Décor" aria-hidden="true" width="400" height="300" />
      <img id="c" src="/c.jpg" alt="Décor" role="presentation" width="400" height="300" />
      <img id="d" src="/d.jpg" alt="Décor" role="none" width="400" height="300" />
    `);
    decorateLightboxImagesIn(win.document.body);
    for (const img of win.document.querySelectorAll('img')) {
      assert.equal(isDecorativeImage(img), true, img.id);
      assert.equal(img.hasAttribute('role') && img.getAttribute('role') === 'button', false);
      assert.equal(img.hasAttribute('tabindex'), false, img.id);
      assert.equal(img.hasAttribute('aria-label'), false, img.id);
      assert.equal(img.hasAttribute('data-lightbox-focusable'), false, img.id);
    }
  });

  it('une image sans attribut alt ou avec alt espace n’est pas décorative', () => {
    const win = dom(`
      <img id="a" src="/a.jpg" width="400" height="300" />
      <img id="b" src="/b.jpg" alt=" " width="400" height="300" />
    `);
    for (const img of win.document.querySelectorAll('img')) {
      assert.equal(isDecorativeImage(img), false, img.id);
      decorateLightboxImage(img);
      assert.equal(img.getAttribute('role'), 'button', img.id);
      assert.equal(img.getAttribute('aria-label'), 'Agrandir l’image', img.id);
    }
  });

  it('une image décorative reste agrandissable au clic', () => {
    const win = dom('<img src="/deco.jpg" alt="" width="400" height="300" />');
    const img = win.document.querySelector('img');
    decorateLightboxImage(img);
    assert.equal(shouldOpenImageLightbox(img), true);
    let opened = null;
    const event = new win.MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: img });
    assert.equal(
      handleImageLightboxClick(event, (payload) => {
        opened = payload;
      }),
      true,
    );
    assert.equal(opened.src, '/deco.jpg');
  });
});
