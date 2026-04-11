/**
 * Placement initial de la mascotte sur le plan visite (carte N3 + repère « entrée »).
 */

/** Décalage vertical (%, vers le bas) sous le repère « entrée N3 » au début de la visite. */
export const VISIT_MASCOT_BELOW_N3_ENTRANCE_YP = 5.5;

/**
 * Repère visite « entrée N3 » (libellés possibles côté contenu).
 * Ex. « Entrée N3 », « 📍 Entrée N3 », « n3 entrée », « Portail N3 ».
 */
export const VISIT_N3_ENTRANCE_LABEL_RE =
  /entr[ée]e.*n3|n3.*entr[ée]e|entr[ée]e\s*\(?\s*n3|portail.*n3|acc[èe]s.*n3/i;

export function findVisitN3EntranceMarker(markers) {
  if (!Array.isArray(markers)) return null;
  return markers.find((mk) => VISIT_N3_ENTRANCE_LABEL_RE.test(String(mk.label || '').trim())) || null;
}

export function computeVisitMascotStartPct(mapId, markers) {
  if (mapId === 'n3') {
    const m = findVisitN3EntranceMarker(markers);
    if (m && Number.isFinite(Number(m.x_pct)) && Number.isFinite(Number(m.y_pct))) {
      const xp = Math.max(0, Math.min(100, Number(m.x_pct)));
      const yp = Math.max(
        0,
        Math.min(100, Number(m.y_pct) + VISIT_MASCOT_BELOW_N3_ENTRANCE_YP)
      );
      return { xp, yp };
    }
  }
  return { xp: 50, yp: 50 };
}
