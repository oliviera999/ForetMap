/**
 * Valeurs par défaut du thème de marque ForetMap (lot 7 du plan de convergence).
 *
 * Ce sont **exactement** les couleurs du thème forêt historique (`src/index.css`) : sans
 * réglage `ui.foret.brand`, l'apparence ne change pas d'un pixel. Le réglage ne sert qu'à
 * habiller l'application aux couleurs d'un établissement.
 */
export const FORETMAP_BRAND_DEFAULTS = Object.freeze({
  colors: Object.freeze({
    primary: '#1a4731',
    secondary: '#f0f4f0',
    tertiary: '#bdbfb4',
    text: '#1f2a22',
    link: '#2d6a4f',
    linkHover: '#1a4731',
    topbar: '#1a4731',
    background: '#f0f4f0',
  }),
  fonts: Object.freeze({ body: '', heading: '', googleFamilies: Object.freeze([]) }),
  logoUrl: '',
  faviconUrl: '',
});
