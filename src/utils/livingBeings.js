/**
 * Normalisation des listes d’êtres vivants (noms du catalogue biodiversité),
 * alignée sur les zones / repères côté API.
 */

export function parseLivingBeings(value, fallback = '') {
  const raw = Array.isArray(value)
    ? value
    : (() => {
        if (!value) return [];
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
          } catch (_) {
            /* ignore */
          }
          return value.split(',');
        }
        return [];
      })();
  const cleaned = [...new Set(raw.map((v) => String(v || '').trim()).filter(Boolean))];
  if (cleaned.length === 0 && fallback) return [String(fallback).trim()];
  return cleaned;
}

/** Met l’être vivant « principal » en tête (zones/repères : current_plant / plant_name). */
export function orderedLivingBeingsForForm(value, primary) {
  const list = parseLivingBeings(value, primary);
  const p = primary != null && String(primary).trim() ? String(primary).trim() : '';
  if (!p) return list;
  const rest = list.filter((n) => n !== p);
  return [p, ...rest];
}

/**
 * Préserve l’ordre des sélections (Ctrl/Cmd + clic).
 * Les nouveaux noms suivent l’ordre du catalogue `plants`.
 */
export function nextLivingBeingsFromMultiSelect(prevOrdered, selectedNames, plants) {
  const selectedSet = new Set(selectedNames);
  const kept = prevOrdered.filter((name) => selectedSet.has(name));
  const added = plants
    .map((p) => p.name)
    .filter((name) => selectedSet.has(name) && !kept.includes(name));
  return [...kept, ...added];
}
