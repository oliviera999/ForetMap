/**
 * Page de garde de la connexion Gnomes & Licornes.
 *
 * Métaphore d'entrée : « Franchir le miroir » (le seuil vers le monde vivant).
 * Les trois accroches couvrent trois registres et tournent au hasard à chaque
 * chargement (cf. pickGlAuthTagline) afin de tester les registres en conditions
 * réelles. Textes volontairement isolés ici pour pouvoir, plus tard, les piloter
 * via gl_settings sans retoucher le composant.
 *
 * Note narrative : l'intro cinématique conserve la métaphore « boîte / copiste » ;
 * le « miroir » ne se superpose pour l'instant que sur l'écran de connexion.
 */

export const GL_AUTH_TAGLINES = Object.freeze([
  Object.freeze({
    id: 'mystere',
    registre: 'Mystère',
    text: "Le carnet s'efface. Le voyage commence.",
  }),
  Object.freeze({
    id: 'mission',
    registre: 'Mission',
    text: 'Cinq mondes, une année, un carnet à sauver.',
  }),
  Object.freeze({
    id: 'emerveillement',
    registre: 'Émerveillement',
    text: "Tout un monde vivant, à voir avant qu'il ne disparaisse.",
  }),
]);

export const GL_AUTH_BASELINE =
  "De l'équateur au pôle, réécrivez le monde vivant avant que le Souffle ne l'efface.";

/**
 * Quatrième de couverture (≈ 85 mots) — dépliée à la demande sur la page de garde
 * (« Lire la quatrième de couverture »). Tableau de paragraphes pour une typographie
 * soignée. Source unique de ce texte dans l'application.
 */
export const GL_AUTH_BACK_COVER = Object.freeze([
  "Une voyageuse est partie avant vous — de l'équateur au pôle Nord, pour connaître et nommer tout le vivant. Elle a tout consigné dans un carnet. Puis le carnet est revenu seul. Et il s'efface.",
  "Car une force le ronge : le Souffle, qui dessèche le monde jusqu'au nom des êtres. Franchissez le miroir, devenez Gnome qui répare ou Licorne qui révèle, et reprenez sa route. Observer, comprendre, nommer le vivant suffit à le faire réapparaître.",
  "Une année entière pour réécrire le carnet — avant qu'il ne disparaisse.",
]);

export const GL_AUTH_CTA_LABEL = 'Franchir le miroir';

/**
 * Choisit une accroche au hasard parmi GL_AUTH_TAGLINES.
 * @param {() => number} [rng] générateur 0..1 (injectable pour les tests).
 * @returns {{ id: string, registre: string, text: string }}
 */
export function pickGlAuthTagline(rng = Math.random) {
  const list = GL_AUTH_TAGLINES;
  const raw = typeof rng === 'function' ? rng() : Math.random();
  const ratio = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999) : 0;
  const index = Math.floor(ratio * list.length);
  return list[index] || list[0];
}
