/**
 * Plan annoté imprimable du plan e-nov (`/impression` sur `enov.*`) — logique pure, testée
 * sans rendu (`tests-ui/enov/enovPrintModel.test.js`).
 *
 * Le cahier des charges du label (domaine 1, niveau 3) demande d'attester, **par un plan de
 * l'établissement**, que plusieurs espaces de types différents ont été aménagés. La page
 * produit donc, pour chaque carte publiée (bâtiment principal, complexe sportif…), une feuille
 * A4 : la carte, les lieux innovants numérotés dessus, et une légende rangée par type
 * d'espace, chaque entrée portant un texte court tiré de sa description e-nov.
 */
import { parsePctPolygonPoints } from '../../shared/pct-map/pctPolygon.js';
import { ENOV_SPACE_TYPES, enovSpaceTypeLabel } from '../../shared/enov/enovSpaceTypes.js';
import { planPlaceFocusPct, placeDisplayParts } from '../../plan/utils/planPlaces.js';

/** Chemin de la page (tolère un préfixe de déploiement, comme `/confidentialite`). */
export const ENOV_PRINT_PATH = '/impression';

/** Type des lieux innovants sans type renseigné : rangés en fin de légende. */
export const UNTYPED_SPACE_ID = '';
export const UNTYPED_SPACE_LABEL = 'Type d’espace non renseigné';

/** Longueur par défaut du texte court d'une entrée de légende (caractères). */
export const DEFAULT_SUMMARY_LENGTH = 180;

/** L'adresse demandée est-elle celle de la page d'impression ? */
export function isEnovPrintPath(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '');
  return path === ENOV_PRINT_PATH || path.endsWith(ENOV_PRINT_PATH);
}

/**
 * Cartes demandées par l'adresse (`?map_id=a,b` ou `?map_id=a&map_id=b`), dans l'ordre, sans
 * doublon. Vide = toutes les cartes publiées.
 * @param {string} search `window.location.search`
 * @returns {string[]}
 */
export function readPrintMapIds(search) {
  const params = new URLSearchParams(String(search || ''));
  const ids = params
    .getAll('map_id')
    .flatMap((value) => String(value || '').split(','))
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * Texte court d'une description e-nov : premier paragraphe, coupé à la dernière fin de phrase
 * qui tient dans `max` caractères, sinon au dernier mot, avec une ellipse. Les liens écrits en
 * toutes lettres sont retirés : ils ne se cliquent pas sur papier.
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
export function summarizeEnovText(text, max = DEFAULT_SUMMARY_LENGTH) {
  const firstParagraph = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)[0]
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
  const limit = Math.max(20, Number(max) || DEFAULT_SUMMARY_LENGTH);
  if (firstParagraph.length <= limit) return firstParagraph;
  const head = firstParagraph.slice(0, limit);
  const sentenceEnd = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
  );
  if (sentenceEnd >= limit * 0.5) return head.slice(0, sentenceEnd + 1);
  const wordEnd = head.lastIndexOf(' ');
  const cut = wordEnd > limit * 0.5 ? head.slice(0, wordEnd) : head;
  return `${cut.replace(/[\s,;:.]+$/, '')}…`;
}

/**
 * Point d'ancrage d'un lieu sur la carte, en pourcentages : le repère lui-même, ou le centre
 * des sommets d'une zone. `null` si le lieu n'a pas de géométrie exploitable.
 * @param {object} place
 * @returns {{ xp: number, yp: number }|null}
 */
export function placeAnchorPct(place) {
  const pct = planPlaceFocusPct(place, parsePctPolygonPoints);
  if (!pct || !Number.isFinite(pct.xp) || !Number.isFinite(pct.yp)) return null;
  return {
    xp: Math.min(100, Math.max(0, pct.xp)),
    yp: Math.min(100, Math.max(0, pct.yp)),
  };
}

const TYPE_ORDER = new Map(ENOV_SPACE_TYPES.map((type, index) => [type.id, index]));

function typeRank(typeId) {
  return TYPE_ORDER.has(typeId) ? TYPE_ORDER.get(typeId) : ENOV_SPACE_TYPES.length;
}

/**
 * Plan annoté d'une carte, prêt à dessiner.
 *
 * Les lieux mis en avant (`map_highlight`) sont **numérotés dans l'ordre de la légende** —
 * par type d'espace (ordre de `ENOV_SPACE_TYPES`, non renseignés en dernier), puis par nom —
 * pour que les numéros se suivent quand on lit la légende de haut en bas.
 *
 * @param {Array<object>} places lieux de la charge (`planPlacesFromContent`).
 * @param {object} [options]
 * @param {number} [options.summaryLength] longueur du texte court.
 * @returns {{
 *   entries: Array<{ number: number, place: object, name: string, emoji: string,
 *     typeId: string, typeLabel: string, summary: string, anchor: {xp:number,yp:number}|null }>,
 *   groups: Array<{ typeId: string, label: string, entries: Array<object> }>,
 *   others: Array<object>,
 *   typeCount: number,
 * }}
 */
export function buildAnnotatedPlan(places, { summaryLength = DEFAULT_SUMMARY_LENGTH } = {}) {
  const list = Array.isArray(places) ? places : [];
  const collator = new Intl.Collator('fr-FR', { sensitivity: 'base', numeric: true });
  const highlighted = [];
  const others = [];
  for (const place of list) {
    if (place?.map_highlight === true) highlighted.push(place);
    else if (place) others.push(place);
  }
  const prepared = highlighted.map((place) => {
    const { emoji, name } = placeDisplayParts(place);
    const typeLabel = enovSpaceTypeLabel(place.enov_space_type);
    const typeId = typeLabel ? String(place.enov_space_type) : UNTYPED_SPACE_ID;
    return {
      place,
      name: String(name || place.name || '').trim(),
      emoji: String(emoji || ''),
      typeId,
      typeLabel: typeLabel || UNTYPED_SPACE_LABEL,
      summary: summarizeEnovText(place.enov_description, summaryLength),
      anchor: placeAnchorPct(place),
    };
  });
  prepared.sort(
    (a, b) => typeRank(a.typeId) - typeRank(b.typeId) || collator.compare(a.name, b.name),
  );
  const entries = prepared.map((entry, index) => ({ ...entry, number: index + 1 }));
  const groups = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.typeId === entry.typeId) last.entries.push(entry);
    else groups.push({ typeId: entry.typeId, label: entry.typeLabel, entries: [entry] });
  }
  const typeCount = groups.filter((group) => group.typeId !== UNTYPED_SPACE_ID).length;
  return { entries, groups, others, typeCount };
}

/**
 * Date d'état imprimée en pied de page (« 28 octobre 2026 »).
 * @param {Date} [date]
 */
export function formatPrintDate(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date);
  } catch {
    return '';
  }
}
