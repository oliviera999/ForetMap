import { describe, test, expect } from 'vitest';
import {
  resolveGlMarkdownForEditorDisplay,
  annotateEditorHtmlWithOriginalSrc,
} from '../../src/gl/utils/glMarkdownEditorDisplay.js';

const SCENES = [
  { key: 'recit_01-chap1_aaa', url: '/uploads/a.png', caption: 'La boîte' },
  { key: 'recit_01-chap1_bbb', url: '/uploads/b.png', caption: null },
];

describe('resolveGlMarkdownForEditorDisplay', () => {
  test('réécrit une URL legacy et trace l’originale', () => {
    const legacy = '/uploads/media-library/image/gl-plateau-1-tropiques-africains.jpg';
    const resolved = '/uploads/media-library/image/plateau-1_tropiques-africains.jpg';
    const { displayMarkdown, originalSrcByResolved } = resolveGlMarkdownForEditorDisplay(
      `![carte](${legacy})`,
      {
        resolveLegacyUrl: () => resolved,
      },
    );
    expect(displayMarkdown).toBe(`![carte](${resolved})`);
    expect(originalSrcByResolved.get(resolved)).toBe(legacy);
  });

  test('résout scene:N quand withSceneRefs et scènes fournis', () => {
    const { displayMarkdown, originalSrcByResolved } = resolveGlMarkdownForEditorDisplay(
      'Intro ![Vue](scene:1) fin.',
      {
        scenes: SCENES,
        withSceneRefs: true,
      },
    );
    expect(displayMarkdown).toBe('Intro ![Vue](/uploads/a.png) fin.');
    expect(originalSrcByResolved.get('/uploads/a.png')).toBe('scene:1');
  });

  test('ne résout pas scene:N sans withSceneRefs', () => {
    const input = '![x](scene:2)';
    const { displayMarkdown, originalSrcByResolved } = resolveGlMarkdownForEditorDisplay(input, {
      scenes: SCENES,
      withSceneRefs: false,
    });
    expect(displayMarkdown).toBe(input);
    expect(originalSrcByResolved.size).toBe(0);
  });
});

describe('annotateEditorHtmlWithOriginalSrc', () => {
  test('ajoute data-gl-md-src sur les images réécrites', () => {
    const map = new Map([['/uploads/a.png', 'scene:1']]);
    const html = annotateEditorHtmlWithOriginalSrc(
      '<p><img src="/uploads/a.png" alt="Vue" class="gl-content-image" /></p>',
      map,
    );
    expect(html).toContain('data-gl-md-src="scene:1"');
    expect(html).toContain('src="/uploads/a.png"');
  });
});
