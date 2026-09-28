/**
 * Calendrier scolaire : regroupement des jours en périodes lisibles pour les réglages.
 *
 * Le serveur stocke un jour par ligne ; les vacances y sont saisies jour par jour, les
 * week-ends compris gardant le type « week-end ». Pour afficher « Vacances du 19 au 30 oct. »,
 * on enjambe donc les week-ends intercalés, et une période s'arrête au premier jour ouvert
 * ordinaire ou au changement de type / libellé.
 */

/** 0 = dimanche … 6 = samedi ; l'ordre d'affichage commence au lundi. */
export const WEEKDAYS = Object.freeze([
  { value: 1, short: 'Lun', long: 'lundi' },
  { value: 2, short: 'Mar', long: 'mardi' },
  { value: 3, short: 'Mer', long: 'mercredi' },
  { value: 4, short: 'Jeu', long: 'jeudi' },
  { value: 5, short: 'Ven', long: 'vendredi' },
  { value: 6, short: 'Sam', long: 'samedi' },
  { value: 0, short: 'Dim', long: 'dimanche' },
]);

export const PERIOD_KIND_LABELS = Object.freeze({
  vacation: 'Vacances',
  holiday: 'Jour férié',
  closed: 'Fermeture',
  extra_open: 'Ouverture exceptionnelle',
});

/** Types posés à la main ; `open` et `weekend` découlent des jours ouvrables. */
const PERIOD_KINDS = new Set(Object.keys(PERIOD_KIND_LABELS));

/**
 * @param {{date: string, kind: string, label?: string|null}[]} days jours triés ou non
 * @returns {{from: string, to: string, kind: string, label: string|null, days: number}[]}
 *   `days` = nombre de jours du type (week-ends enjambés non comptés).
 */
export function groupCalendarPeriods(days) {
  const sorted = (Array.isArray(days) ? days : [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d?.date || '')))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const periods = [];
  let current = null;
  for (const d of sorted) {
    const label = d.label || null;
    if (PERIOD_KINDS.has(d.kind)) {
      if (current && current.kind === d.kind && current.label === label) {
        current.to = d.date;
        current.days += 1;
      } else {
        current = { from: d.date, to: d.date, kind: d.kind, label, days: 1 };
        periods.push(current);
      }
    } else if (d.kind !== 'weekend') {
      current = null;
    }
  }
  return periods;
}

/** « lun. 19 oct. » */
export function formatCalendarDate(value) {
  const raw = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date(`${raw}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** « le lun. 11 nov. » ou « du lun. 19 oct. au ven. 30 oct. » */
export function formatPeriodRange(period) {
  if (!period) return '';
  if (period.from === period.to) return `le ${formatCalendarDate(period.from)}`;
  return `du ${formatCalendarDate(period.from)} au ${formatCalendarDate(period.to)}`;
}

/** Liste des jours ouvrables en clair : « du lundi au vendredi », « lundi, mardi, jeudi ». */
export function describeOpenWeekdays(values) {
  const set = new Set((Array.isArray(values) ? values : []).map(Number));
  const ordered = WEEKDAYS.filter((w) => set.has(w.value));
  if (ordered.length === 0) return 'aucun jour';
  const indexes = ordered.map((w) => WEEKDAYS.indexOf(w));
  const contiguous = indexes.every((idx, i) => i === 0 || idx === indexes[i - 1] + 1);
  if (ordered.length >= 3 && contiguous) {
    return `du ${ordered[0].long} au ${ordered[ordered.length - 1].long}`;
  }
  return ordered.map((w) => w.long).join(', ');
}
