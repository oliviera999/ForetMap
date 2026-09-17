import { MAP_GUIDE_BAR_FOCUS_INSET_PX, MapGuideBar } from '../../shared/map-guide/MapGuideBar.jsx';
import { placeDisplayParts } from '../utils/planPlaces.js';

/** Hauteur approximative de la barre (px scène) pour recadrer la carte au-dessus d'elle. */
export const PLAN_GUIDE_BAR_FOCUS_INSET_PX = MAP_GUIDE_BAR_FOCUS_INSET_PX;

/**
 * Barre de guidage « Y aller » du Plan : enveloppe du composant partagé
 * (`shared/map-guide/MapGuideBar`), comme `PlanRouteBar` l'est de `MapRouteBar`.
 */
export function PlanGuideBar(props) {
  return <MapGuideBar {...props} displayParts={placeDisplayParts} testId="plan-guide-bar" />;
}
