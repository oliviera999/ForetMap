import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  GLLoreGlossaryMarkdown,
  GLLoreGlossaryInlineText,
} from '../../src/gl/components/GLLoreGlossaryMarkdown.jsx';
import * as loreAutolink from '../../src/utils/glLoreGlossaryAutolink.js';

const LORE_ITEMS = [
  { lore_code: 'LO0001', terme: 'Sylphe', variantes: 'sylphes' },
  { lore_code: 'LO0002', terme: 'Royaume', variantes: '' },
];

describe('GLLoreGlossaryMarkdown', () => {
  test('rend le markdown et hyperlie les termes lore avec l’attribut data-gl-lore-code', () => {
    const { container } = render(
      <GLLoreGlossaryMarkdown
        markdown="Le **royaume** abrite un sylphe."
        loreGlossaryItems={LORE_ITEMS}
        onOpenLoreTerm={vi.fn()}
      />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('royaume');
    const link = screen.getByRole('link', { name: /sylphe/i });
    expect(link).toHaveAttribute('data-gl-lore-code', 'LO0001');
    expect(link).toHaveClass('gl-lore-glossary-link');
    expect(screen.getByRole('link', { name: /royaume/i })).toHaveAttribute(
      'data-gl-lore-code',
      'LO0002',
    );
  });

  test('le clic délégué sur un terme appelle onOpenLoreTerm avec le bon code', () => {
    const onOpenLoreTerm = vi.fn();
    render(
      <GLLoreGlossaryMarkdown
        markdown="Un sylphe traverse le royaume."
        loreGlossaryItems={LORE_ITEMS}
        onOpenLoreTerm={onOpenLoreTerm}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /royaume/i }));
    expect(onOpenLoreTerm).toHaveBeenCalledTimes(1);
    expect(onOpenLoreTerm).toHaveBeenCalledWith('LO0002');
  });

  test('sans lexique lore, rend le markdown sans lien', () => {
    const { container } = render(
      <GLLoreGlossaryMarkdown markdown="Un sylphe passe." loreGlossaryItems={[]} />,
    );
    expect(container).toHaveTextContent('Un sylphe passe.');
    expect(container.querySelector('a')).toBeNull();
  });

  test('replie sur un rendu sans lien si l’auto-lien lève', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(loreAutolink, 'renderGlMarkdownWithLoreGlossaryLinks').mockImplementation(() => {
      throw new Error('lexique lore corrompu');
    });
    const { container } = render(
      <GLLoreGlossaryMarkdown markdown="Un sylphe passe." loreGlossaryItems={LORE_ITEMS} />,
    );
    expect(container).toHaveTextContent('Un sylphe passe.');
    expect(container.querySelector('[data-gl-lore-code]')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  test('ne rend rien pour un markdown vide', () => {
    const { container } = render(
      <GLLoreGlossaryMarkdown markdown="   " loreGlossaryItems={LORE_ITEMS} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('GLLoreGlossaryInlineText', () => {
  test('hyperlie le texte brut et déclenche onOpenLoreTerm au clic', () => {
    const onOpenLoreTerm = vi.fn();
    render(
      <GLLoreGlossaryInlineText
        text="Quel sylphe ?"
        loreGlossaryItems={LORE_ITEMS}
        onOpenLoreTerm={onOpenLoreTerm}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /sylphe/i }));
    expect(onOpenLoreTerm).toHaveBeenCalledWith('LO0001');
  });

  test('échappe le HTML saisi : aucun img/script injecté, texte affiché tel quel', () => {
    const text = 'Un sylphe <img src=x onerror=alert(1)> et <script>alert(2)</script> !';
    const { container } = render(
      <GLLoreGlossaryInlineText text={text} loreGlossaryItems={LORE_ITEMS} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent(
      'Un sylphe <img src=x onerror=alert(1)> et <script>alert(2)</script> !',
    );
    // Le terme reste lié malgré le balisage échappé autour.
    expect(screen.getByRole('link', { name: /sylphe/i })).toHaveAttribute(
      'data-gl-lore-code',
      'LO0001',
    );
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });

  test('sans lexique lore, rend le texte brut sans innerHTML', () => {
    const { container } = render(
      <GLLoreGlossaryInlineText text="Un <b>sylphe</b>" loreGlossaryItems={[]} />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(container).toHaveTextContent('Un <b>sylphe</b>');
  });

  test('replie sur le texte brut si l’auto-lien lève', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(loreAutolink, 'renderGlPlainTextWithLoreGlossaryLinks').mockImplementation(() => {
      throw new Error('lexique lore corrompu');
    });
    const { container } = render(
      <GLLoreGlossaryInlineText text="Un sylphe passe." loreGlossaryItems={LORE_ITEMS} />,
    );
    expect(container).toHaveTextContent('Un sylphe passe.');
    expect(container.querySelector('a')).toBeNull();
  });
});
