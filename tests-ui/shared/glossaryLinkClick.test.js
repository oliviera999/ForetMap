import { describe, test, expect, vi } from 'vitest';

import {
  bindGlossaryLinkClick,
  FORETMAP_GLOSSARY_CODE_ATTR,
  GL_GLOSSARY_CODE_ATTR,
} from '../../src/shared/utils/glossaryLinkClick.js';

/**
 * Cette délégation était écrite deux fois — une par produit — alors que seul
 * l'attribut de données diffère. Les cas ci-dessous verrouillent le comportement
 * commun, ForetMap et G&L confondus.
 */
function mount(attr, { code = 'photosynthese', tag = 'a' } = {}) {
  const container = document.createElement('div');
  container.innerHTML = `<p>Texte <${tag} href="#" ${attr}="${code}">terme</${tag}> suite.</p>`;
  document.body.appendChild(container);
  return { container, link: container.querySelector(`[${attr}]`) };
}

describe('bindGlossaryLinkClick', () => {
  test.each([
    ['ForetMap', FORETMAP_GLOSSARY_CODE_ATTR],
    ['G&L', GL_GLOSSARY_CODE_ATTR],
  ])('ouvre le terme cliqué (%s)', (_label, attr) => {
    const onOpen = vi.fn();
    const { container, link } = mount(attr);
    const cleanup = bindGlossaryLinkClick(container, onOpen, attr);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onOpen).toHaveBeenCalledWith('photosynthese');
    cleanup();
  });

  test('annule l’action par défaut du lien', () => {
    // Sans cela, le lien navigue vers `#` — et dans un `<label>` de quiz, le clic
    // basculerait le bouton radio en même temps qu'il ouvre la définition.
    const { container, link } = mount(FORETMAP_GLOSSARY_CODE_ATTR);
    const cleanup = bindGlossaryLinkClick(container, () => {}, FORETMAP_GLOSSARY_CODE_ATTR);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });

  test('ignore un clic hors terme et un code vide', () => {
    const onOpen = vi.fn();
    const { container } = mount(FORETMAP_GLOSSARY_CODE_ATTR, { code: '  ' });
    const cleanup = bindGlossaryLinkClick(container, onOpen, FORETMAP_GLOSSARY_CODE_ATTR);

    container.querySelector('p').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    container
      .querySelector(`[${FORETMAP_GLOSSARY_CODE_ATTR}]`)
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onOpen).not.toHaveBeenCalled();
    cleanup();
  });

  test('n’écoute plus après nettoyage, et tolère un conteneur ou un handler absent', () => {
    const onOpen = vi.fn();
    const { container, link } = mount(GL_GLOSSARY_CODE_ATTR);
    bindGlossaryLinkClick(container, onOpen, GL_GLOSSARY_CODE_ATTR)();

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onOpen).not.toHaveBeenCalled();

    expect(() => bindGlossaryLinkClick(null, onOpen, GL_GLOSSARY_CODE_ATTR)()).not.toThrow();
    expect(() =>
      bindGlossaryLinkClick(container, undefined, GL_GLOSSARY_CODE_ATTR)(),
    ).not.toThrow();
  });
});
