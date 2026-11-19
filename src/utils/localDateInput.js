/**
 * Date civile locale `AAAA-MM-JJ` pour pré-remplir un `<input type="date">` (audit ForetMap du
 * 19/11, F9). `toISOString().slice(0, 10)` donne la date **UTC** : à UTC+1 entre 0 h et 1 h,
 * « aujourd'hui » valait encore la veille. Le décalage se compte en jours civils (et non en
 * tranches de 24 h), ce qui reste juste les jours de changement d'heure.
 *
 * @param {number} [offsetDays=0] Décalage en jours (négatif = passé).
 * @param {Date} [now] Horloge injectable (tests).
 * @returns {string}
 */
export function localDateInput(offsetDays = 0, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(offsetDays || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
