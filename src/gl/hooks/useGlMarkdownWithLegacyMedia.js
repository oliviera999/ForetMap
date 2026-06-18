import { useMemo } from 'react';
import { applyGlLegacyMediaRefs, img, GL_ASSET_PLACEHOLDER_URL } from '../assets/index.js';
import { useGlAssetsReady } from '../components/GLFeuilletIllustration.jsx';

/** Markdown GL avec réécriture des URLs legacy `gl-*` vers la médiathèque. */
export function useGlMarkdownWithLegacyMedia(markdown) {
  const assetsReady = useGlAssetsReady();
  return useMemo(() => {
    const raw = String(markdown ?? '');
    if (!raw || !assetsReady) return raw;
    return applyGlLegacyMediaRefs(raw, (stableKey) => {
      const url = img(stableKey);
      return url && url !== GL_ASSET_PLACEHOLDER_URL ? url : null;
    });
  }, [markdown, assetsReady]);
}
