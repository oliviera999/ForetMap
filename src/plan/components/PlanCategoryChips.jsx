import { MapCategoryChips } from '../../shared/map-discover/MapCategoryChips.jsx';

/**
 * Alias Plan : mêmes puces partagées (`MapCategoryChips`), classes `.plan-chip*`.
 * Conservé pour compatibilité des imports existants.
 */
export function PlanCategoryChips(props) {
  return <MapCategoryChips {...props} className="plan-chips" chipClassName="plan-chip" />;
}
