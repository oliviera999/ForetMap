/**
 * Points de bascule — source UNIQUE, commune à ForêtMap, Gnomes & Licornes, au plan, au
 * staff et à e-Nov (lot R0 de l'audit UI/UX du 19/11/2026, `docs/AUDIT_UI_UX_2026-11-19.md`).
 *
 * Pourquoi un module JS et pas des propriétés `--bp-*` : une propriété personnalisée CSS
 * n'est PAS évaluée dans une condition `@media` (`@media (min-width: var(--bp-md))` est
 * ignorée par tous les navigateurs), et le dépôt n'a pas de PostCSS pour `@custom-media`.
 * Les feuilles de style écrivent donc la valeur en clair, mais SEULEMENT une valeur de
 * l'échelle ci-dessous : `tests/breakpoints-guard.test.js` lit ce fichier et plafonne
 * les valeurs hors échelle (cliquet, ne peut que baisser).
 *
 * Convention d'écriture, pour qu'aucun pixel n'appartienne aux deux côtés :
 *   - « à partir de » : `@media (min-width: 768px)`      ↔ `mediaUp('md')`
 *   - « en dessous de » : `@media (max-width: 767px)`    ↔ `mediaDown('md')`
 * La forme historique `max-width: 768px` (recouvrement d'un pixel) reste tolérée par le
 * garde-fou ; on ne l'écrit plus dans du code neuf.
 */

/** Échelle en pixels CSS. Ordre croissant, à ne modifier qu'avec le garde-fou. */
export const BREAKPOINTS = Object.freeze({
  /** Petit téléphone (iPhone SE, 375–390 px de large) en dessous. */
  xs: 480,
  /** Téléphone / petite tablette portrait : bascule la plus fréquente des feuilles. */
  sm: 640,
  /** Tablette portrait. */
  md: 768,
  /** Ordinateur (et tablette paysage) : panneaux latéraux, barre d'onglets haute. */
  lg: 1024,
});

function valeur(nom) {
  const px = BREAKPOINTS[nom];
  if (typeof px !== 'number') {
    throw new Error(
      `Point de bascule inconnu : « ${nom} » (attendu : ${Object.keys(BREAKPOINTS).join(', ')})`,
    );
  }
  return px;
}

/**
 * Condition « à partir de » ce point de bascule (inclus).
 * @param {keyof typeof BREAKPOINTS} nom
 * @returns {string} ex. `(min-width: 1024px)`
 */
export function mediaUp(nom) {
  return `(min-width: ${valeur(nom)}px)`;
}

/**
 * Condition « strictement en dessous de » ce point de bascule.
 * @param {keyof typeof BREAKPOINTS} nom
 * @returns {string} ex. `(max-width: 1023px)`
 */
export function mediaDown(nom) {
  return `(max-width: ${valeur(nom) - 1}px)`;
}

/** Conditions prêtes à passer à `useMediaQuery` (`src/shared/hooks/useMediaQuery.js`). */
export const MEDIA = Object.freeze({
  /** Téléphone : sous `sm`. */
  phone: mediaDown('sm'),
  /** Mise en page « ordinateur » : à partir de `lg`. */
  desktop: mediaUp('lg'),
  /** Tout ce qui n'est pas « ordinateur » : sous `lg`. */
  belowDesktop: mediaDown('lg'),
});
