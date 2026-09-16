/**
 * Textes de l'onglet « Info » d'un lieu (zone / repère).
 *
 * La bascule carte → visite recopie `description` (zone) / `note` (repère) dans
 * `short_description` (liste blanche `lib/visitMapToVisitFields.js`), qui revient
 * ensuite sur la fiche carte en `visit_short_description`. Sans déduplication,
 * l'onglet Info affiche **deux fois** le même paragraphe : une fois comme
 * description de travail, une fois comme accroche de visite.
 */

/** Description de travail du lieu (zone → `description`, repère → `note`). */
export function locationMainDescription(entity, kind) {
  const raw = kind === 'zone' ? entity?.description : entity?.note;
  return raw == null ? '' : String(raw);
}

/** Deux textes rendus à l'identique (espaces / casse ignorés) ? */
export function sameLocationText(a, b) {
  const normalize = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const left = normalize(a);
  if (!left) return false;
  return left === normalize(b);
}

/**
 * Accroche de visite à afficher dans l'onglet Info : chaîne vide quand elle
 * reprend mot pour mot la description de travail déjà affichée au-dessus.
 * @param {object} entity zone ou repère
 * @param {'zone'|'marker'} kind
 * @returns {string}
 */
export function visitAsideShortDescription(entity, kind) {
  const short = String(entity?.visit_short_description || '').trim();
  if (!short) return '';
  return sameLocationText(short, locationMainDescription(entity, kind)) ? '' : short;
}
