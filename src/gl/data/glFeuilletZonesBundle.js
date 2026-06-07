import zonesFeuilletsRaw from './zones_feuillets.json';
import {
  getRuntimeFeuilletZonesForPlateauFromRaw,
  loadAndValidateFeuilletZones,
} from '../../utils/glFeuilletZones.js';

const validated = loadAndValidateFeuilletZones(zonesFeuilletsRaw);

/** Zones runtime pour un plateau (1–5), bundle Vite. */
export function getRuntimeFeuilletZonesForPlateau(plateauNumber) {
  return getRuntimeFeuilletZonesForPlateauFromRaw(zonesFeuilletsRaw, plateauNumber);
}

export function getValidatedFeuilletZoneCount() {
  return validated.zones.length;
}
