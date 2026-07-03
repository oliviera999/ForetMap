import { z } from 'zod';
import { normPointToPct, normPolygonToPctPoints } from './glNormMapCoords.js';

const normCoord = z.number().min(0).max(1);

const feuilletZoneSchema = z.object({
  zone_id: z.string().min(1),
  plateau: z.number().int().min(1).max(5),
  board_image: z.string().optional(),
  feuillet_code: z.string().min(1),
  titre: z.string().min(1),
  centre: z.tuple([normCoord, normCoord]),
  polygone: z.array(z.tuple([normCoord, normCoord])).min(3),
  declenchement: z.literal('traversee_unique'),
  cout_gemme: z.number().int().min(0),
  gain_coeur: z.number().int().min(0),
  popover: z.string().min(1),
});

const feuilletZonesFileSchema = z.object({
  zones: z.array(z.unknown()),
});

function warnInvalidZone(zoneId, message) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[zones feuillets] zone ignorée${zoneId ? ` (${zoneId})` : ''} : ${message}`);
  }
}

/**
 * Valide et charge les zones feuillets (fail-soft par zone).
 * @param {unknown} [raw]
 * @returns {{ zones: object[], errors: string[] }}
 */
export function loadAndValidateFeuilletZones(raw) {
  if (!raw) {
    return { zones: [], errors: ['Données zones feuillets absentes'] };
  }
  const errors = [];
  const parsed = feuilletZonesFileSchema.safeParse(raw);
  if (!parsed.success) {
    errors.push('Fichier zones_feuillets.json invalide');
    return { zones: [], errors };
  }

  const seenIds = new Set();
  const zones = [];

  for (const entry of parsed.data.zones) {
    const zoneId = String(entry?.zone_id || '').trim();
    const result = feuilletZoneSchema.safeParse(entry);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join(', ');
      errors.push(`${zoneId || '?'}: ${msg}`);
      warnInvalidZone(zoneId, msg);
      continue;
    }
    if (seenIds.has(result.data.zone_id)) {
      const msg = 'zone_id dupliqué';
      errors.push(`${result.data.zone_id}: ${msg}`);
      warnInvalidZone(result.data.zone_id, msg);
      continue;
    }
    seenIds.add(result.data.zone_id);
    zones.push(result.data);
  }

  return { zones, errors };
}

/** @param {ReturnType<typeof loadAndValidateFeuilletZones>['zones']} zones */
export function getFeuilletZonesForPlateau(zones, plateauNumber) {
  const plateau = Number(plateauNumber);
  if (!Number.isFinite(plateau) || plateau < 1 || plateau > 5) return [];
  return zones.filter((z) => Number(z.plateau) === plateau);
}

/**
 * Convertit une zone JSON en zone runtime (coords % 0–100).
 * @param {z.infer<typeof feuilletZoneSchema>} zone
 */
export function toRuntimeFeuilletZone(zone) {
  const centre = normPointToPct(zone.centre);
  const points = normPolygonToPctPoints(zone.polygone);
  return {
    zoneId: zone.zone_id,
    plateau: zone.plateau,
    boardImage: zone.board_image || '',
    feuilletCode: zone.feuillet_code,
    titre: zone.titre,
    centre,
    centreXp: centre.x,
    centreYp: centre.y,
    points,
    popover: zone.popover,
    coutGemme: Number(zone.cout_gemme) || 0,
    gainCoeur: Number(zone.gain_coeur) || 0,
    declenchement: zone.declenchement,
  };
}

export function getRuntimeFeuilletZonesForPlateauFromRaw(raw, plateauNumber) {
  const { zones } = loadAndValidateFeuilletZones(raw);
  return getFeuilletZonesForPlateau(zones, plateauNumber).map(toRuntimeFeuilletZone);
}
