/**
 * Variantes du produit « plan » : le Plan Lyautey public (`planlyautey`) et le plan des
 * personnels (`proflyautey`, alias `stafflyautey`).
 *
 * Les deux affichent **le même écran**, servi par le même composant `AppPlan` — une carte
 * plein écran, une recherche, des puces de catégorie, des fiches de lieu, des parcours. Ce
 * qui les sépare tient dans cet objet : l'API interrogée, la porte d'entrée, les clés de
 * stockage local et l'habillage. Dupliquer l'écran pour ces quelques lignes reviendrait à
 * entretenir deux fois chaque correction d'ergonomie.
 *
 * Le pendant serveur est `lib/planContent.js` (surface + lecteur) et `lib/products.js`
 * (host, PWA, icônes).
 */

import { clearStaffToken, getStaffToken } from '../staffSession.js';

/** Plan Lyautey public : ouvert à tous, éventuellement derrière un code de diffusion. */
export const PLAN_VARIANT = Object.freeze({
  id: 'plan',
  apiBase: '/api/plan',
  usageProduct: 'plan',
  storagePrefix: 'plan',
  defaultTitle: 'Plan Lyautey',
  bodyClass: 'plan-body',
  /** L'entrée demande-t-elle un compte ForetMap ? */
  requiresAccount: false,
  accessIntro:
    'Ce plan est réservé à l’établissement. Saisissez le code qui vous a été communiqué.',
});

/**
 * Plan des personnels : entrée par compte ForetMap (profil dans
 * `ui.staff_plan.allowed_role_slugs`, Google ou mot de passe), ou par code partagé si un
 * administrateur l'a activé. Montre les lieux retirés du plan public et les compléments
 * confidentiels des fiches.
 *
 * `getToken` n'est défini que sur cette variante : le plan public ne signe aucune requête, et
 * n'a donc rien à importer de la session.
 */
export const STAFF_PLAN_VARIANT = Object.freeze({
  id: 'staff',
  apiBase: '/api/staff-plan',
  usageProduct: 'plan',
  storagePrefix: 'staff-plan',
  defaultTitle: 'Plan personnels — Lyautey',
  bodyClass: 'plan-body staff-plan-body',
  requiresAccount: true,
  accessIntro: 'Réservé aux personnels du lycée.',
  getToken: getStaffToken,
  /** Déconnexion : le jeton quitte l'appareil (le laissez-passer, lui, est effacé côté serveur). */
  clearToken: clearStaffToken,
});

/**
 * Clés de stockage local d'une variante. Elles sont préfixées par variante : les deux plans
 * peuvent être ouverts sur le même appareil, et les filtres de l'un n'ont rien à faire dans
 * l'autre — leurs catégories ne sont même pas les mêmes.
 *
 * Deux d'entre elles portent **en plus la carte affichée** : les catégories cochées et le
 * parcours quitté ne parlent que du plan où ils ont été posés. Depuis que l'établissement
 * peut en publier plusieurs (« Réglages → Plan affiché »), les partager reviendrait à
 * proposer « Reprendre le parcours » pour un parcours d'un autre bâtiment. Les autres sont
 * des préférences d'appareil, indifférentes à la carte.
 *
 * @param {object} variant variante de plan (`PLAN_VARIANT`, `STAFF_PLAN_VARIANT`).
 * @param {string} [mapId] carte réellement affichée ; vide tant que la charge n'est pas là.
 */
export function planStorageKeys(variant, mapId = '') {
  const prefix = String(variant?.storagePrefix || 'plan');
  const map = String(mapId || '').trim();
  const perMap = (base) => (map ? `${prefix}:${base}:${map}` : `${prefix}:${base}`);
  return {
    categories: perMap('categories'),
    welcome: `${prefix}:welcome-seen`,
    headingUp: `${prefix}:heading-up`,
    scaleCompass: `${prefix}:scale-compass`,
    // Parcours quitté : le slug **et** l'étape, pour que « Reprendre » reprenne.
    route: perMap('route-resume'),
    // Plan choisi dans les réglages : un personnel qui travaille sur l'annexe doit la
    // retrouver au prochain déverrouillage, pas revenir sur le bâtiment principal.
    mapId: `${prefix}:map-id`,
  };
}
