/**
 * Puce « Parcours » du Plan — façade sur le composant partagé (classes plan conservées via CSS).
 */
import { MapRoutePicker } from '../../shared/map-routes/MapRoutePicker.jsx';

export function PlanRoutePicker(props) {
  return <MapRoutePicker {...props} className="plan-routes-host" />;
}
