import { describe, test, expect } from 'vitest';
import { applyStorySceneRefs, hasStorySceneRefs } from '../../src/gl/utils/glStorySceneRefs.js';

const SCENES = [
  { key: 'recit_01-chap1_aaa', url: '/uploads/a.png', caption: 'La boîte' },
  { key: 'recit_01-chap1_bbb', url: '/uploads/b.png', caption: null },
  { key: 'recit_01-chap1_ccc', url: '/uploads/c.png', caption: 'Le seuil' },
];

describe('applyStorySceneRefs', () => {
  test('remplace scene:N par l’URL résolue et trace les clés utilisées', () => {
    const { markdown, usedKeys } = applyStorySceneRefs(
      'Début ![Vue](scene:1) milieu ![](scene:3) fin.',
      SCENES,
    );
    expect(markdown).toBe('Début ![Vue](/uploads/a.png) milieu ![Le seuil](/uploads/c.png) fin.');
    expect(usedKeys).toEqual(['recit_01-chap1_aaa', 'recit_01-chap1_ccc']);
  });

  test('alt vide sans légende → alt vide ; légende de scène en repli', () => {
    const { markdown } = applyStorySceneRefs('![](scene:2)', SCENES);
    expect(markdown).toBe('![](/uploads/b.png)');
  });

  test('référence non résoluble retirée du texte', () => {
    const { markdown, usedKeys } = applyStorySceneRefs('Avant ![x](scene:9) après', SCENES);
    expect(markdown).toBe('Avant  après');
    expect(usedKeys).toEqual([]);
  });

  test('scènes absentes (médiathèque vide) → toutes les références retirées', () => {
    const { markdown } = applyStorySceneRefs('![x](scene:1)', []);
    expect(markdown).toBe('');
  });

  test('même scène référencée deux fois → une seule clé exclue', () => {
    const { usedKeys } = applyStorySceneRefs('![a](scene:1) ![b](scene:1)', SCENES);
    expect(usedKeys).toEqual(['recit_01-chap1_aaa']);
  });

  test('texte sans référence inchangé', () => {
    const input = 'Récit ![image](/uploads/x.png) classique.';
    const { markdown, usedKeys } = applyStorySceneRefs(input, SCENES);
    expect(markdown).toBe(input);
    expect(usedKeys).toEqual([]);
  });
});

describe('hasStorySceneRefs', () => {
  test('détection', () => {
    expect(hasStorySceneRefs('a ![x](scene:2) b')).toBe(true);
    expect(hasStorySceneRefs('a ![x](/uploads/x.png) b')).toBe(false);
    expect(hasStorySceneRefs('')).toBe(false);
  });
});
