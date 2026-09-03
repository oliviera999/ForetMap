import { describe, expect, test, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { GlossaryMarkdown, GlossaryInlineText } from '../src/components/GlossaryMarkdown.jsx';
import { MarkdownContent } from '../src/components/MarkdownContent.jsx';
import {
  renderMarkdownWithGlossaryLinks,
  renderPlainTextWithGlossaryLinks,
} from '../src/utils/foretmapGlossaryAutolink.js';
import { sanitizeRichHtml } from '../src/shared/platform/markdown.js';

const GLOSSARY_ITEMS = [
  { glossary_code: 'FM0001', terme: 'Biocénose', variantes: 'biocénoses' },
  { glossary_code: 'FM0002', terme: 'Écosystème', variantes: '' },
];

describe('Prérequis A12 — le sanitizer laisse passer les auto-liens ForetMap', () => {
  const LINK = '<a href="#" class="fm-glossary-inline-link" data-glossary-code="FM0001">sol</a>';

  test('sans l’option, DOMPurify rend le lien muet (état d’avant le lot)', () => {
    expect(sanitizeRichHtml(LINK)).toBe('<a>sol</a>');
  });

  test('avec allowGlossaryLinks, classe, attribut data et href survivent', () => {
    const sanitized = sanitizeRichHtml(LINK, { allowGlossaryLinks: true });
    expect(sanitized).toContain('data-glossary-code="FM0001"');
    expect(sanitized).toContain('class="fm-glossary-inline-link"');
    expect(sanitized).toContain('href="#"');
  });

  test('un texte brut auto-lié ressort du sanitizer avec un lien cliquable', () => {
    const html = renderPlainTextWithGlossaryLinks('La biocénose ici', GLOSSARY_ITEMS);
    expect(html).toContain('href="#"');
    expect(html).toContain('data-glossary-code="FM0001"');
    expect(html).toContain('fm-glossary-inline-link');
  });

  test("l'ancre garde sa classe et son attribut data dans le rendu markdown", () => {
    const html = renderMarkdownWithGlossaryLinks(
      "La biocénose habite l'écosystème.",
      GLOSSARY_ITEMS,
    );
    expect(html).toContain('data-glossary-code="FM0001"');
    expect(html).toContain('fm-glossary-inline-link');
    // Le HTML produit repasse au sanitizer : on vérifie qu'il en ressort intact.
    const container = document.createElement('div');
    container.innerHTML = html;
    const link = container.querySelector('a[data-glossary-code="FM0001"]');
    expect(link).not.toBeNull();
    expect(link.className).toContain('fm-glossary-inline-link');
    expect(link.getAttribute('href')).toBe('#');
  });

  test("n'auto-lie jamais à l'intérieur d'un lien existant", () => {
    const html = renderMarkdownWithGlossaryLinks('Voir [biocénose](https://x.test) ici.', [
      GLOSSARY_ITEMS[0],
    ]);
    expect(html).toContain('href="https://x.test"');
    expect(html).not.toContain('data-glossary-code');
  });
});

describe('GlossaryMarkdown', () => {
  test('hyperlie les termes cités et appelle onOpenGlossaryTerm une seule fois', () => {
    const onOpenGlossaryTerm = vi.fn();
    const { container } = render(
      <GlossaryMarkdown
        markdown="La biocénose est vivante."
        glossaryItems={GLOSSARY_ITEMS}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />,
    );
    const link = container.querySelector('a[data-glossary-code="FM0001"]');
    expect(link).not.toBeNull();
    expect(link.className).toContain('fm-glossary-inline-link');
    fireEvent.click(link);
    expect(onOpenGlossaryTerm).toHaveBeenCalledTimes(1);
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('FM0001');
  });

  test('sans index glossaire, rend le markdown comme MarkdownContent', () => {
    const { container } = render(<GlossaryMarkdown markdown="**Sol** vivant." />);
    expect(container.querySelector('strong')?.textContent).toBe('Sol');
    expect(container.querySelector('a')).toBeNull();
    expect(container.firstChild.className).toContain('markdown-content');
  });

  test('repli : un index invalide ne casse pas le rendu', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hostileItems = [
      {
        glossary_code: 'FM0001',
        get terme() {
          throw new Error('index corrompu');
        },
      },
    ];
    const { container } = render(
      <GlossaryMarkdown
        markdown="La biocénose est vivante."
        glossaryItems={hostileItems}
        onOpenGlossaryTerm={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('La biocénose est vivante.');
    expect(container.querySelector('a')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('GlossaryInlineText', () => {
  test('hyperlie un texte brut et déclenche onOpenGlossaryTerm', () => {
    const onOpenGlossaryTerm = vi.fn();
    const { container } = render(
      <GlossaryInlineText
        tag="p"
        text="Quel rôle joue la biocénose ?"
        glossaryItems={GLOSSARY_ITEMS}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />,
    );
    fireEvent.click(container.querySelector('a[data-glossary-code="FM0001"]'));
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('FM0001');
  });

  test('échappe le HTML d’un énoncé hostile', () => {
    const { container } = render(
      <GlossaryInlineText
        text={'<script>alert(1)</script> la biocénose'}
        glossaryItems={GLOSSARY_ITEMS}
        onOpenGlossaryTerm={vi.fn()}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(renderPlainTextWithGlossaryLinks('<b>x</b>', GLOSSARY_ITEMS)).not.toContain('<b>');
  });

  test('dans un choix de quiz, le lien ne bascule pas le bouton radio', () => {
    const onOpenGlossaryTerm = vi.fn();
    const onChange = vi.fn();
    const { container } = render(
      <label>
        <input type="radio" name="c" checked={false} onChange={onChange} />
        <GlossaryInlineText
          text="La biocénose du sol"
          glossaryItems={GLOSSARY_ITEMS}
          onOpenGlossaryTerm={onOpenGlossaryTerm}
        />
      </label>,
    );
    // Clic sur le terme : ouvre la définition, ne sélectionne pas la réponse.
    fireEvent.click(container.querySelector('a[data-glossary-code="FM0001"]'));
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('FM0001');
    expect(onChange).not.toHaveBeenCalled();
    // Clic sur le reste du libellé : la sélection fonctionne toujours.
    fireEvent.click(container.querySelector('label'));
    expect(onChange).toHaveBeenCalled();
  });

  test('sans index, rend le texte tel quel (choix de quiz inchangé)', () => {
    const { container } = render(<GlossaryInlineText text="Réponse A" />);
    expect(container.textContent).toBe('Réponse A');
    expect(container.querySelector('a')).toBeNull();
  });
});

describe('MarkdownContent (options facultatives)', () => {
  test('comportement inchangé sans props glossaire', () => {
    const { container } = render(<MarkdownContent className="x">**Sol**</MarkdownContent>);
    expect(container.querySelector('strong')?.textContent).toBe('Sol');
    expect(container.querySelector('a')).toBeNull();
  });

  test('hyperlie quand un index et un gestionnaire sont fournis', () => {
    const onOpenGlossaryTerm = vi.fn();
    const { container } = render(
      <MarkdownContent glossaryItems={GLOSSARY_ITEMS} onOpenGlossaryTerm={onOpenGlossaryTerm}>
        La biocénose.
      </MarkdownContent>,
    );
    fireEvent.click(container.querySelector('a[data-glossary-code="FM0001"]'));
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('FM0001');
  });
});
