import { MAP_ROUTE_BAR_FOCUS_INSET_PX, MapRouteBar } from '../../shared/map-routes/MapRouteBar.jsx';

export const PLAN_ROUTE_BAR_FOCUS_INSET_PX = MAP_ROUTE_BAR_FOCUS_INSET_PX;

/** Barre d'étape du mode parcours Plan (alias du composant partagé). */
export function PlanRouteBar(props) {
  return <MapRouteBar {...props} testId="plan-route-sheet" />;
}
