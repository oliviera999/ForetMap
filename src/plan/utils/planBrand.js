/**
 * Valeurs par défaut du thème de marque du Plan Lyautey (lot 7).
 *
 * Ce sont les couleurs de `plan.css` : sans réglage `ui.plan.brand`, l'apparence du plan est
 * inchangée. Le réglage sert à poser l'identité visuelle de l'établissement (couleurs de la
 * barre haute, logo).
 */
export const PLAN_BRAND_DEFAULTS = Object.freeze({
  colors: Object.freeze({
    primary: '#1a4731',
    secondary: '#f0f4f0',
    tertiary: '#bdbfb4',
    text: '#1f2a22',
    link: '#4a7c59',
    linkHover: '#1a4731',
    topbar: '#1a4731',
    background: '#f0f4f0',
  }),
  fonts: Object.freeze({ body: '', heading: '', googleFamilies: Object.freeze([]) }),
  logoUrl: '',
  faviconUrl: '',
});
