import { useCallback, useMemo } from 'react';
import { chapterIllustrations, img, GL_ASSET_PLACEHOLDER_URL } from '../assets/index.js';
import { useGlAssetsReady } from '../components/GLFeuilletIllustration.jsx';
import { resolveGlMarkdownForEditorDisplay } from '../utils/glMarkdownEditorDisplay.js';

/**
 * Résout le markdown chapitre pour l’aperçu éditeur admin (legacy + scènes récit).
 * @param {number|string|null|undefined} plateauNumber
 */
export function useGlChapterEditorMarkdownResolver(plateauNumber) {
  const assetsReady = useGlAssetsReady();
  const chapterNumber = Number(plateauNumber);
  const hasChapter = Number.isInteger(chapterNumber) && chapterNumber >= 1 && chapterNumber <= 5;

  const scenes = useMemo(
    () => (assetsReady && hasChapter ? chapterIllustrations(chapterNumber) : []),
    [assetsReady, hasChapter, chapterNumber],
  );

  const resolveLegacyUrl = useCallback(
    (stableKey) => {
      if (!assetsReady) return null;
      const url = img(stableKey);
      return url && url !== GL_ASSET_PLACEHOLDER_URL ? url : null;
    },
    [assetsReady],
  );

  const resolveForEditor = useCallback(
    (markdown, { withSceneRefs = false } = {}) =>
      resolveGlMarkdownForEditorDisplay(markdown, {
        scenes: withSceneRefs ? scenes : [],
        resolveLegacyUrl: assetsReady ? resolveLegacyUrl : null,
        withSceneRefs,
      }),
    [assetsReady, resolveLegacyUrl, scenes],
  );

  return resolveForEditor;
}
