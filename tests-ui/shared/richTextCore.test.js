// @vitest-environment jsdom
//
// B1 — noyau partagé de l'édition riche. Ce qui est vérifié ici est ce qui était
// identique à l'octet près dans `RichTextEditor.jsx` et `GLRichTextEditor.jsx`.

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  RICH_TEXT_TURNDOWN_OPTIONS,
  createRichTextTurndownService,
  htmlToMarkdownWith,
  normalizeHtmlForCompare,
  runExecCommand,
} from '../../src/shared/richtext/richTextCore.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeHtmlForCompare', () => {
  it('réduit les espaces et rogne les bords', () => {
    expect(normalizeHtmlForCompare('  <p>a</p>\n\n  <p>b</p>  ')).toBe('<p>a</p> <p>b</p>');
  });

  it('rend égaux deux HTML ne différant que par la mise en forme des espaces', () => {
    const a = '<ul>\n  <li>un</li>\n  <li>deux</li>\n</ul>';
    const b = '<ul> <li>un</li> <li>deux</li> </ul>';
    expect(normalizeHtmlForCompare(a)).toBe(normalizeHtmlForCompare(b));
  });

  it('accepte les valeurs absentes sans jeter', () => {
    for (const empty of [null, undefined, '']) {
      expect(normalizeHtmlForCompare(empty)).toBe('');
    }
  });
});

describe('runExecCommand', () => {
  it('délègue à document.execCommand avec `false` en second argument', () => {
    const spy = vi.fn(() => true);
    document.execCommand = spy;

    expect(runExecCommand('bold')).toBe(true);
    expect(spy).toHaveBeenCalledWith('bold', false, null);

    runExecCommand('formatBlock', '<h2>');
    expect(spy).toHaveBeenCalledWith('formatBlock', false, '<h2>');
  });

  it('renvoie false si execCommand est indisponible, sans jeter', () => {
    document.execCommand = undefined;
    expect(runExecCommand('bold')).toBe(false);
  });
});

describe('createRichTextTurndownService', () => {
  it('applique les options communes aux deux éditeurs', () => {
    expect(RICH_TEXT_TURNDOWN_OPTIONS).toEqual({
      headingStyle: 'atx',
      bulletListMarker: '-',
      emDelimiter: '*',
    });
    const service = createRichTextTurndownService();
    expect(service.turndown('<h2>Titre</h2>')).toBe('## Titre');
    expect(service.turndown('<ul><li>un</li></ul>')).toBe('-   un');
    expect(service.turndown('<em>oblique</em>')).toBe('*oblique*');
  });

  it('retire les scripts et les styles', () => {
    const service = createRichTextTurndownService();
    expect(service.turndown('<p>a</p><script>alert(1)</script>')).toBe('a');
    expect(service.turndown('<p>a</p><style>p{color:red}</style>')).toBe('a');
  });

  it('rend les séparateurs horizontaux en rupture thématique Markdown', () => {
    const service = createRichTextTurndownService();
    expect(service.turndown('<hr />')).toBe('* * *');
  });

  it('renvoie une instance neuve : une règle produit n’en contamine pas une autre', () => {
    // Garantie centrale de la mutualisation : GL ajoute ses règles d'images à
    // SON instance ; ForetMap ne doit pas les voir.
    const glLike = createRichTextTurndownService();
    glLike.addRule('glImage', {
      filter: (node) => node.nodeName === 'IMG',
      replacement: () => '[[IMAGE GL]]',
    });
    const foretmapLike = createRichTextTurndownService();

    expect(glLike.turndown('<img src="x.png" alt="a" />')).toBe('[[IMAGE GL]]');
    expect(foretmapLike.turndown('<img src="x.png" alt="a" />')).not.toContain('[[IMAGE GL]]');
  });
});

describe('htmlToMarkdownWith', () => {
  it('assainit puis convertit, et rogne le résultat', () => {
    const service = createRichTextTurndownService();
    expect(htmlToMarkdownWith(service, '  <h2>Titre</h2>  ')).toBe('## Titre');
  });

  it('transmet `allowImages` à l’assainissement : image retirée quand il est faux', () => {
    const service = createRichTextTurndownService();
    const html = '<p>a</p><img src="https://ex.org/x.png" alt="img" />';
    expect(htmlToMarkdownWith(service, html, { allowImages: false })).not.toContain('ex.org');
  });

  it('transmet `allowImages` à l’assainissement : image conservée quand il est vrai', () => {
    const service = createRichTextTurndownService();
    const html = '<p>a</p><img src="https://ex.org/x.png" alt="img" />';
    expect(htmlToMarkdownWith(service, html, { allowImages: true })).toContain('ex.org/x.png');
  });

  it('renvoie une chaîne vide pour un contenu vide', () => {
    const service = createRichTextTurndownService();
    expect(htmlToMarkdownWith(service, '')).toBe('');
    expect(htmlToMarkdownWith(service, '   ')).toBe('');
  });
});
