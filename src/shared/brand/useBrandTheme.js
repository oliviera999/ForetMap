import { useEffect, useMemo } from 'react';

import {
  NEUTRAL_BRAND_DEFAULTS,
  brandCssVariables,
  googleFontsHref,
  normalizeBrandCore,
} from './brandThemeCore.js';

/** Injecte (ou met à jour) une balise `<link>` identifiée, sans jamais en empiler deux. */
function upsertLink(id, attrs) {
  if (typeof document === 'undefined') return;
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('link');
    node.id = id;
    document.head.appendChild(node);
  }
  for (const [key, value] of Object.entries(attrs)) node[key] = value;
}

/**
 * Thème de marque d'un produit (lot 7) — généralisation de `useGLBrandTheme`.
 *
 * Applique un thème normalisé : variables CSS à rendre sur un conteneur (`style`), polices
 * Google chargées à la demande, favicon remplacé quand le produit en fournit un. Les
 * identifiants des balises injectées sont préfixés par produit : deux produits servis par le
 * même monorepo ne se marchent pas dessus.
 *
 * @param {object|null} rawBrand réglage brut (`ui.<produit>.brand`).
 * @param {object} [options]
 * @param {string} [options.prefix='fm'] préfixe des variables CSS et des balises injectées.
 * @param {object} [options.defaults] valeurs par défaut du produit.
 * @param {string} [options.fontFallback='serif']
 * @param {boolean} [options.applyFavicon=true]
 * @returns {{ brand: object, style: Record<string, string> }}
 */
export function useBrandTheme(
  rawBrand,
  {
    prefix = 'fm',
    defaults = NEUTRAL_BRAND_DEFAULTS,
    fontFallback = 'serif',
    applyFavicon = true,
  } = {},
) {
  const brand = useMemo(() => normalizeBrandCore(rawBrand, defaults), [rawBrand, defaults]);

  useEffect(() => {
    const href = googleFontsHref(brand.fonts.googleFamilies);
    if (!href) return;
    upsertLink(`${prefix}-brand-fonts`, { rel: 'stylesheet', href });
  }, [brand.fonts.googleFamilies, prefix]);

  useEffect(() => {
    if (!applyFavicon || !brand.faviconUrl) return;
    const lower = brand.faviconUrl.toLowerCase();
    upsertLink(`${prefix}-brand-favicon`, {
      rel: 'icon',
      type: lower.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
      href: brand.faviconUrl,
    });
  }, [brand.faviconUrl, prefix, applyFavicon]);

  const style = useMemo(
    () => brandCssVariables(brand, { prefix, fontFallback }),
    [brand, prefix, fontFallback],
  );

  return { brand, style };
}
