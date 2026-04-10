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

/** Ordre conservé depuis `living_beings` (JSON) ; `primary` sert de repli si la liste est vide (colonnes legacy). */
export function orderedLivingBeingsForForm(value, primary) {
  return parseLivingBeings(value, primary);
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

/** Libellé court pour listes déroulantes (noms séparés par des virgules, troncature). */
export function formatLivingBeingsListLine(names, maxLen = 56) {
  if (!Array.isArray(names) || !names.length) return '';
  const s = names.join(', ');
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}
