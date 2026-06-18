import { useCallback } from 'react';
import { img, GL_ASSET_PLACEHOLDER_URL } from '../assets/index.js';
import { useGlAssetsReady } from '../components/GLFeuilletIllustration.jsx';
import { resolveGlMarkerIconDisplayUrl } from '../utils/resolveGlMarkerIconDisplayUrl.js';

export function useResolveGlMarkerIconDisplayUrl() {
  const assetsReady = useGlAssetsReady();
  return useCallback(
    (rawUrl) =>
      resolveGlMarkerIconDisplayUrl(rawUrl, {
        assetsReady,
        resolveStableKey: (key) => {
          const url = img(key);
          return url && url !== GL_ASSET_PLACEHOLDER_URL ? url : null;
        },
      }),
    [assetsReady],
  );
}
