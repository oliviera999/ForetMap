import { pctPointToNorm, pctPointsToNormPolygon } from './glNormMapCoords.js';

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

/**
 * « Tenir à deux » : réécrit `data/gl/tenir/chasse-zones.json` depuis les zones servies par
 * `GET /api/gl/admin/chasse-zones` (coordonnées déjà normalisées 0-1). Le fichier versionné
 * reste la source : l'éditeur dessine, l'export recopie.
 */
export function buildChasseZonesExportJson(zones) {
  return {
    format: 'chasse-zones v1 — coords normalisées 0-1, origine haut-gauche',
    zones: zones.map((zone) => ({
      zone_key: zone.zoneKey,
      plateau: zone.plateau,
      feuillet_code: zone.feuilletCode,
      titre_prive: zone.titrePrive || '',
      indice: zone.indice || '',
      polygone: Array.isArray(zone.polygone)
        ? zone.polygone.map(([x, y]) => [
            Number(Number(x).toFixed(4)),
            Number(Number(y).toFixed(4)),
          ])
        : null,
      polygone_ref: zone.polygoneRef || null,
      rang_case: zone.rangCase ?? null,
      question_code: zone.questionCode || null,
      theme_secours: zone.themeSecours || null,
      ordre: zone.ordre,
      actif: zone.actif !== false,
    })),
  };
}
