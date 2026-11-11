import { useBrandTheme } from '../shared/brand/useBrandTheme.js';
import {
  normalizeExternalAssetsMode,
  setExternalAssetsMode,
} from '../shared/privacy/externalAssets.js';
import { FORETMAP_BRAND_DEFAULTS } from '../constants/brand.js';

/**
 * Thème de marque de l'établissement (lot 7 du plan de convergence) : réglage
 * `ui.foret.brand`, mécanique partagée avec G&L et le Plan Lyautey. Sans réglage, les
 * valeurs par défaut reproduisent exactement le thème forêt historique. Extrait tel quel
 * d'`App.jsx` (lot 6).
 *
 * Pose aussi, **pendant le rendu**, le mode de chargement des ressources externes : les vues
 * enfants résolvent leurs URL d'images dans ce même passage.
 *
 * @param {object|null} publicSettings Réglages publics.
 * @returns {{ brand: object, style: object }} Valeur de `useBrandTheme`.
 */
export function useForetBrandTheme(publicSettings) {
  const externalAssetsMode = normalizeExternalAssetsMode(
    publicSettings?.privacy?.external_assets_mode,
  );
  // Posé pendant le rendu : les vues enfants résolvent leurs URL d'images dans ce même passage.
  setExternalAssetsMode(externalAssetsMode);
  return useBrandTheme(publicSettings?.foret?.brand, {
    prefix: 'fm-brand',
    defaults: FORETMAP_BRAND_DEFAULTS,
    fontFallback: "'DM Sans', sans-serif",
    externalAssetsMode,
  });
}
