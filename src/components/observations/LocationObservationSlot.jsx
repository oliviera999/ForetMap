import { SpeciesObservationActions } from './SpeciesObservationActions.jsx';
import { OBSERVATION_TEXTS as T } from './observationTexts.js';

/**
 * Point de montage d'un **lieu de la carte** (fiche d'une zone ou d'un repère) : « Signaler une
 * observation ici », lieu présélectionné, et « Mes observations ». Rien pour un lieu pas encore
 * enregistré (création en cours) ni sans session.
 *
 * @param {object} props
 * @param {'zone'|'marker'} props.kind
 * @param {{ id?: string, map_id?: string, name?: string, label?: string }|null} props.location
 * @param {() => void} [props.onForceLogout]
 */
export function LocationObservationSlot({ kind, location, onForceLogout = null }) {
  if (!location?.id || !location?.map_id) return null;
  const label = kind === 'marker' ? location.label || 'Repère' : location.name || 'Zone';
  return (
    <SpeciesObservationActions
      mapId={String(location.map_id)}
      place={{ kind, id: String(location.id), label }}
      reportLabel={T.reportHereButton}
      onForceLogout={onForceLogout}
    />
  );
}
