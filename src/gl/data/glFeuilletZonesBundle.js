import zonesFeuilletsRaw from './zones_feuillets.json';
import { getRuntimeFeuilletZonesForPlateauFromRaw } from '../utils/glFeuilletZones.js';

/** Zones runtime pour un plateau (1–5), bundle Vite. */
export function getRuntimeFeuilletZonesForPlateau(plateauNumber) {
  return getRuntimeFeuilletZonesForPlateauFromRaw(zonesFeuilletsRaw, plateauNumber);
}
