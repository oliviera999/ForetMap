/**
 * Valeurs par défaut du thème de marque du Plan Lyautey (lot 7).
 *
 * Charte graphique du Lycée Lyautey (bleu marine du logo officiel et variantes).
 * Sans réglage `ui.plan.brand`, l'apparence du plan suit cette charte. Le réglage
 * sert à affiner couleurs / logo si l'établissement le souhaite.
 */
export const PLAN_BRAND_DEFAULTS = Object.freeze({
  colors: Object.freeze({
    primary: '#183058',
    secondary: '#eef1f6',
    tertiary: '#98a8c8',
    text: '#14233d',
    link: '#406088',
    linkHover: '#183058',
    topbar: '#183058',
    background: '#eef1f6',
  }),
  fonts: Object.freeze({ body: '', heading: '', googleFamilies: Object.freeze([]) }),
  logoUrl: '',
  faviconUrl: '',
});

/** Logo officiel du lycée (asset statique Plan) — distinct du logo configurable via brand. */
export const PLAN_SCHOOL_LOGO_URL = '/plan/logo-lyautey.png';
