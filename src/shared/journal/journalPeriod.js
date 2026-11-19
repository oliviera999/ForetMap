/**
 * Bornes du filtre de période du carnet, en **heure locale** (audit ForetMap du 19/11, F9).
 *
 * `new Date('AAAA-MM-JJ')` est lu comme minuit UTC : à UTC+1, un article écrit entre 0 h et
 * 1 h (heure locale) sortait de la période qui commence ce jour-là, et la borne de fin
 * débordait d'une heure sur le lendemain. Les champs `<input type="date">` donnent une date
 * civile locale : on la construit avec `new Date(a, m - 1, j)`.
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minuit local du jour `AAAA-MM-JJ` (ms), ou `null` si la chaîne n'est pas une date. */
export function localDayStartMs(ymd) {
  const m = YMD_RE.exec(String(ymd || '').trim());
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Dernière milliseconde locale du jour `AAAA-MM-JJ` : minuit du lendemain moins 1 ms (juste
 * aussi les jours de changement d'heure, qui ne durent pas 24 h).
 */
export function localDayEndMs(ymd) {
  const m = YMD_RE.exec(String(ymd || '').trim());
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime() - 1;
  return Number.isFinite(t) ? t : null;
}

/** Filtre des lignes `{ createdAt }` sur une période locale `[periodStart, periodEnd]` (inclus). */
export function filterRowsByLocalPeriod(rows, periodStart, periodEnd) {
  let out = Array.isArray(rows) ? rows : [];
  const t0 = periodStart ? localDayStartMs(periodStart) : null;
  const t1 = periodEnd ? localDayEndMs(periodEnd) : null;
  if (t0 != null) {
    out = out.filter((row) => {
      const t = row?.createdAt ? new Date(row.createdAt).getTime() : 0;
      return Number.isFinite(t) && t >= t0;
    });
  }
  if (t1 != null) {
    out = out.filter((row) => {
      const t = row?.createdAt ? new Date(row.createdAt).getTime() : 0;
      return Number.isFinite(t) && t <= t1;
    });
  }
  return out;
}
