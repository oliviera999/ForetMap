import { pctPointToNorm, pctPointsToNormPolygon } from '../../utils/glNormMapCoords.js';

export function buildFeuilletZonesExportJson(zones) {
  return {
    format:
      'coords normalisees 0-1, origine haut-gauche; superposer sur board_image; declenchement 1ere traversee',
    zones: zones.map((zone) => ({
      zone_id: zone.zoneId,
      plateau: zone.plateau,
      board_image: zone.boardImage || '',
      feuillet_code: zone.feuilletCode,
      titre: zone.titre,
      centre: pctPointToNorm({ x: zone.centreXp, y: zone.centreYp }),
      polygone: pctPointsToNormPolygon(zone.points),
      declenchement: 'traversee_unique',
      cout_gemme: zone.coutGemme,
      gain_coeur: zone.gainCoeur,
      popover: zone.popover,
    })),
  };
}
