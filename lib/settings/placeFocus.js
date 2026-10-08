'use strict';

/**
 * Réglages du domaine « zoom sur le lieu » (`app_settings`) : au clic sur une zone ou un
 * repère, la carte cadre d'abord le lieu (après l'arrivée de la mascotte quand la surface en a
 * une), puis ouvre sa fiche ; à la fermeture, elle revient au zoom et au centrage d'avant.
 *
 * Un interrupteur par surface (carte de travail, Visite, plans), puis des réglages communs.
 * Lus côté client par `src/shared/pct-map/placeFocusSettings.js` (`resolvePlaceFocusSettings`),
 * qui reprend ces défauts et ces bornes.
 */

const PLACE_FOCUS_SETTINGS = {
  /** Carte de travail ForetMap (élèves, profs), en consultation. */
  'ui.place_focus.work_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Visite publique. */
  'ui.place_focus.visit_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Plans (plan public, plan des personnels, plan e-nov). */
  'ui.place_focus.plan_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Durée du zoom et du retour (ms). Entier : le registre arrondit les nombres. */
  'ui.place_focus.duration_ms': {
    scope: 'public',
    type: 'number',
    min: 150,
    max: 800,
    default: 350,
  },
  /**
   * Zoom maximal du cadrage, en % de la carte entière (100 = carte entière). Une petite zone
   * ou un repère ne zooment pas au-delà.
   */
  'ui.place_focus.max_zoom_percent': {
    scope: 'public',
    type: 'number',
    min: 150,
    max: 800,
    default: 400,
  },
  /** À la fermeture de la fiche, revenir au zoom et au centrage d'avant. */
  'ui.place_focus.restore_on_close': { scope: 'public', type: 'boolean', default: true },
};

module.exports = { PLACE_FOCUS_SETTINGS };
