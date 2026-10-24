'use strict';

/**
 * Réglages du domaine « parcours » (`app_settings`) : comportement du **mode parcours** sur les
 * trois surfaces qui le proposent (Visite, carte de travail, plans).
 *
 * Ils décrivent une manière de guider, pas un parcours : les parcours eux-mêmes (étapes,
 * surfaces, publication) vivent dans `map_routes`. Un seul jeu de valeurs pour toutes les
 * surfaces — la Visite et le plan public guident le même visiteur, avec les mêmes gestes.
 *
 * Lus côté client par `src/shared/map-routes/routeSettings.js` (`resolveRouteSettings`), qui
 * reprend ces défauts et ces bornes : une valeur absente ou hors bornes y retombe sur le défaut.
 */

const ROUTES_SETTINGS = {
  /** Démarrer un parcours montre d'abord tout le tracé, étapes numérotées. */
  'ui.routes.overview_enabled': { scope: 'public', type: 'boolean', default: true },
  /** « Commencer le parcours » active la position (« Me situer ») si la carte la permet. */
  'ui.routes.auto_locate': { scope: 'public', type: 'boolean', default: true },
  /**
   * Caméra guidée pendant les étapes : cadrage position + étape, puis zoom sur la personne en
   * marche. Décoché : la carte centre simplement le lieu de chaque étape (comportement antérieur).
   */
  'ui.routes.camera_enabled': { scope: 'public', type: 'boolean', default: true },
  /**
   * Zoom de marche, en % de la carte entière (100 = carte entière, 300 = trois fois plus
   * près). Entier : le registre arrondit les nombres. Sert aussi de zoom maximal des cadrages
   * (vue d'ensemble, position + étape) : deux lieux voisins ne zooment pas au-delà.
   */
  'ui.routes.walking_zoom_percent': {
    scope: 'public',
    type: 'number',
    min: 150,
    max: 800,
    default: 300,
  },
  /** Distance parcourue (m) depuis le début d'une étape avant de passer au zoom de marche. */
  'ui.routes.walking_trigger_m': { scope: 'public', type: 'number', min: 2, max: 100, default: 8 },
  /**
   * Anticipation vers l'étape en marche (% de la demi-vue) : 0 = la personne reste au centre ;
   * plus la valeur est haute, plus la vue s'ouvre devant elle, vers la ligne à suivre.
   */
  'ui.routes.lookahead_percent': {
    scope: 'public',
    type: 'number',
    min: 0,
    max: 90,
    default: 60,
  },
  /** Chevrons animés sur la ligne de guidage (toujours figés si « mouvement réduit »). */
  'ui.routes.line_animated': { scope: 'public', type: 'boolean', default: true },
};

module.exports = { ROUTES_SETTINGS };
