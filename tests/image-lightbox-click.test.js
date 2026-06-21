import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  handleImageLightboxClick,
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
    assert.deepEqual(opened, { src: '/scene.jpg', caption: 'Chapitre 1' });
  });
});
