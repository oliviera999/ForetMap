/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GLRichTextEditor } from '../../src/gl/components/ui/GLRichTextEditor.jsx';
import { resolveGlMarkdownForEditorDisplay } from '../../src/gl/utils/glMarkdownEditorDisplay.js';

/**
 * Audit des bugs G&L du 19/11/2026, E4. Le résolveur RÉEL est utilisé, d'abord « pas prêt »
 * (médiathèque non chargée : aucune scène), puis prêt — l'ordre que suit l'écran des chapitres.
 */

const SCENES = [
  { url: '/uploads/media-library/image/recit_01.png', caption: 'Point d’eau' },
  { url: '/uploads/media-library/image/recit_02.png', caption: 'La Grise' },
  { url: '/uploads/media-library/image/recit_03.png', caption: 'Le silence' },
];

const notReady = (markdown) =>
  resolveGlMarkdownForEditorDisplay(markdown, { scenes: [], withSceneRefs: true });
const ready = (markdown) =>
  resolveGlMarkdownForEditorDisplay(markdown, { scenes: SCENES, withSceneRefs: true });

function lastValue(onChange) {
  return onChange.mock.calls.at(-1)?.[0]?.target?.value || '';
}

/** Simule une frappe : un caractère ajouté dans le premier paragraphe, puis l'évènement. */
function typeInFirstParagraph(editor, text = ' !') {
  const p = editor.querySelector('p');
  p.appendChild(document.createTextNode(text));
  fireEvent.input(editor);
}

describe('GLRichTextEditor — références d’image non résolues (audit 19/11, E4)', () => {
  it('une référence scene:N non résolue survit à la première frappe', () => {
    const onChange = vi.fn();
    render(
      <GLRichTextEditor
        value={'Intro.\n\n![Le silence](scene:3)\n\nFin.'}
        onChange={onChange}
        resolveDisplayMarkdown={notReady}
      />,
    );
    const editor = screen.getByRole('textbox');
    // Un substitut visible porte la source d'origine.
    const placeholder = editor.querySelector('[data-gl-md-src="scene:3"]');
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toContain('Le silence');
    typeInFirstParagraph(editor);
    const saved = lastValue(onChange);
    expect(saved).toContain('Intro. !');
    expect(saved).toContain('![Le silence](scene:3)');
    expect(saved).toContain('Fin.');
  });

  it('une référence vers une scène qui n’existe pas survit aussi, résolveur prêt', () => {
    const onChange = vi.fn();
    render(
      <GLRichTextEditor
        value={'Intro.\n\n![Plus tard](scene:9)'}
        onChange={onChange}
        resolveDisplayMarkdown={ready}
      />,
    );
    const editor = screen.getByRole('textbox');
    typeInFirstParagraph(editor);
    expect(lastValue(onChange)).toContain('![Plus tard](scene:9)');
  });

  it('l’image s’affiche quand le résolveur devient prêt, et la référence reste à l’enregistrement', () => {
    const onChange = vi.fn();
    const value = 'Intro.\n\n![Le silence](scene:3)\n\nFin.';
    const { rerender } = render(
      <GLRichTextEditor value={value} onChange={onChange} resolveDisplayMarkdown={notReady} />,
    );
    const editor = screen.getByRole('textbox');
    expect(editor.querySelector('img')).toBeNull();
    rerender(<GLRichTextEditor value={value} onChange={onChange} resolveDisplayMarkdown={ready} />);
    const img = editor.querySelector('img.gl-content-image');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe(SCENES[2].url);
    expect(img.getAttribute('data-gl-md-src')).toBe('scene:3');
    // Le résolveur n'a rien écrit : aucun enregistrement automatique à déclencher.
    expect(onChange).not.toHaveBeenCalled();
    typeInFirstParagraph(editor);
    const saved = lastValue(onChange);
    expect(saved).toContain('scene:3');
    expect(saved).not.toContain(SCENES[2].url);
  });

  it('le résolveur qui devient prêt ne touche pas un texte sans référence en attente', () => {
    const value = 'Intro.\n\nFin.';
    const { rerender } = render(
      <GLRichTextEditor value={value} onChange={vi.fn()} resolveDisplayMarkdown={notReady} />,
    );
    const editor = screen.getByRole('textbox');
    const firstParagraph = editor.querySelector('p');
    rerender(<GLRichTextEditor value={value} onChange={vi.fn()} resolveDisplayMarkdown={ready} />);
    // Même nœud : le curseur de l'auteur n'a pas été déplacé.
    expect(editor.querySelector('p')).toBe(firstParagraph);
  });

  it('la forme HTML enregistrée par l’éditeur (<img src="scene:N">) fait l’aller-retour avec son cadre', () => {
    const onChange = vi.fn();
    const stored =
      'Intro.\n\n<img src="scene:1" alt="Point d’eau" class="gl-content-image" data-gl-frame=\'{"aspectRatio":"16/9"}\' loading="lazy" />\n\nFin.';
    const { rerender } = render(
      <GLRichTextEditor value={stored} onChange={onChange} resolveDisplayMarkdown={notReady} />,
    );
    const editor = screen.getByRole('textbox');
    expect(editor.querySelector('[data-gl-md-src="scene:1"]')).toBeTruthy();
    typeInFirstParagraph(editor);
    let saved = lastValue(onChange);
    expect(saved).toContain('src="scene:1"');
    expect(saved).toContain('16/9');

    rerender(<GLRichTextEditor value={saved} onChange={onChange} resolveDisplayMarkdown={ready} />);
    const img = editor.querySelector('img.gl-content-image');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe(SCENES[0].url);
    typeInFirstParagraph(editor, ' ?');
    saved = lastValue(onChange);
    expect(saved).toContain('src="scene:1"');
    expect(saved).toContain('16/9');
    expect(saved).not.toContain(SCENES[0].url);
  });
});
