import { describe, expect, test } from 'vitest';
import DOMPurify from 'isomorphic-dompurify';
import { filterRichInlineStyle, sanitizeRichHtml } from '../src/shared/platform/markdown.js';

// Audit sécurité du 30/09/2026, AP8 : `style` limité à `img` (et son cadre), liste blanche.

function parse(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

describe('AP8 — attribut style des contenus riches', () => {
  test('un paragraphe ne garde pas de style plein écran (hameçonnage)', () => {
    const out = sanitizeRichHtml(
      '<p style="position:fixed;inset:0;z-index:9999;background:white">Reconnectez-vous</p>',
      { allowImages: true },
    );
    expect(out).not.toMatch(/style=/);
    expect(out).toContain('Reconnectez-vous');
  });

  test('background:url(…) est retiré, même sur une image', () => {
    const out = sanitizeRichHtml(
      '<img src="/uploads/a.jpg" alt="A" style="background:url(https://tiers.example/t.png);width:50%">',
      { allowImages: true },
    );
    expect(out).not.toMatch(/url\(/);
    expect(out).not.toContain('tiers.example');
  });

  test('le carnet (embeds) ne laisse pas non plus de style sur un bloc', () => {
    const out = sanitizeRichHtml('<blockquote style="position:fixed;top:0">x</blockquote>', {
      allowJournalEmbeds: true,
    });
    expect(out).not.toMatch(/style=/);
  });

  test('le cadrage d’image (glImageFrame) reste rendu', () => {
    const out = sanitizeRichHtml(
      '<img src="/uploads/a.jpg" alt="A" data-gl-frame=\'{"aspectRatio":"16:9","maxWidthPx":320}\'>',
      { allowImages: true },
    );
    const fragment = parse(out);
    const img = fragment.querySelector('img');
    const figure = fragment.querySelector('figure.gl-content-image-wrap');
    expect(img).not.toBeNull();
    expect(figure).not.toBeNull();
    expect(img.getAttribute('style')).toMatch(/object-fit/);
    expect(figure.getAttribute('style')).toMatch(/max-width/);
  });

  test('un contenu déjà assaini, ré-assaini, conserve le style de cadre', () => {
    const once = sanitizeRichHtml('<img src="/uploads/a.jpg" alt="A">', { allowImages: true });
    const twice = sanitizeRichHtml(once, { allowImages: true });
    expect(parse(twice).querySelector('img').getAttribute('style')).toMatch(/object-fit/);
  });

  test('filterRichInlineStyle : liste blanche et valeurs simples', () => {
    expect(filterRichInlineStyle('width: 100%; height: 50px')).toBe('width: 100%; height: 50px');
    expect(filterRichInlineStyle('position: fixed; inset: 0')).toBe('');
    expect(filterRichInlineStyle('width: calc(100vw + 1px)')).toBe('');
    expect(filterRichInlineStyle('width: 10px /* x */')).toBe('');
    expect(filterRichInlineStyle('display: flex; display: block')).toBe('display: block');
    expect(filterRichInlineStyle('object-position: 50% 20%')).toBe('object-position: 50% 20%');
  });

  test('le hook ne touche pas les autres appels à DOMPurify', () => {
    const out = DOMPurify.sanitize('<p style="color: red">x</p>');
    expect(out).toContain('style="color: red"');
  });
});
