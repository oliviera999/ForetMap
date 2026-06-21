import { isQuestionMarker } from '../../utils/glMarkerEventConfig.js';
import { shouldPresentMarkerOnArrival } from '../../utils/glMarkerEffects.js';
import { sortMarkersByPath, targetMarkerAfterDice } from './glBoardPath.js';

/**
 * Calcule la cible d'avancement après un jet de dés (chemin numéroté).
 * @returns {{ teamId: number, marker: object, shouldPresent: boolean } | null}
 */
export function resolveDicePathAdvance({
  markers = [],
  team = null,
  roll = null,
  boardMovement = null,
  teamId = null,
  markerArrivalEnabled = true,
}) {
  if (!boardMovement?.isNumberedPath || teamId == null) return null;
  const sortedMarkers = sortMarkersByPath(markers);
  const target = targetMarkerAfterDice(
    sortedMarkers,
    team,
    roll?.total,
    boardMovement.startIndex,
  );
  if (!target?.marker) return null;
  const marker = target.marker;
  const shouldPresent =
    markerArrivalEnabled &&
    (isQuestionMarker(marker) || shouldPresentMarkerOnArrival(marker));
  return { teamId: Number(teamId), marker, shouldPresent };
}
