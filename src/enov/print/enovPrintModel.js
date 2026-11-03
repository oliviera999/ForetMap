/**
 * Plan annoté imprimable du plan e-nov (`/impression` sur `enov.*`) — logique pure, testée
 * sans rendu (`tests-ui/enov/enovPrintModel.test.js`).
 *
 * Le cahier des charges du label (domaine 1, niveau 3) demande d'attester, **par un plan de
 * l'établissement**, que plusieurs espaces de types différents ont été aménagés. La page
 * produit donc, pour chaque carte publiée (bâtiment principal, complexe sportif…), une feuille
 * A4 : la carte, les lieux innovants numérotés dessus, et une légende en deux niveaux — les
 * espaces retenus par le dossier, rangés par type d'espace avec un texte court tiré de leur
 * description e-nov, puis les autres lieux d'innovation, en légende compacte.
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
    // Espaces insécables fines dans les nombres et devant les unités : « 3 000 m² » ne se
    // coupe pas en fin de ligne.
    .replace(/(\d) (?=\d{3}\b)/g, '$1\u202f')
    .replace(/(\d) (?=(m²|m|km|kW|ha|%)(?![\p{L}\d]))/gu, '$1\u00a0')
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

/** Niveaux de mise en avant (miroir de `lib/enovPlan.js`). */
export const TIER_PRIMARY = 'primary';
export const TIER_SECONDARY = 'secondary';

/** Niveau d'un lieu mis en avant : le second niveau porte `map_highlight_tone: 'secondary'`. */
export function placeTier(place) {
  return place?.map_highlight_tone === 'secondary' ? TIER_SECONDARY : TIER_PRIMARY;
}

/**
 * Nom commun d'une série de lieux : ce qui précède le tiret de précision
 * (« Point de tri végétalisé — cour du collège » → « Point de tri végétalisé »).
 */
export function placeBaseName(name) {
  return String(name || '')
    .split(/\s[—–]\s/)[0]
    .trim();
}

/**
 * Entrées de légende d'un niveau. Les lieux d'une même **série** — même nom commun, même
 * texte e-nov (les cinq points de tri, les deux points de nourrissage) — partagent une seule
 * entrée et un seul numéro, posé sur chacun d'eux : la légende dit une fois ce qui vaut pour
 * tous, au lieu de répéter cinq fois le même texte.
 */
function prepareEntries(places, tier, summaryLength) {
  const series = new Map();
  for (const place of places) {
    const { emoji, name } = placeDisplayParts(place);
    const fullName = String(name || place.name || '').trim();
    const base = placeBaseName(fullName);
    const description = String(place.enov_description || '').trim();
    const key = `${base.toLocaleLowerCase('fr-FR')}\u0000${description}`;
    const anchor = placeAnchorPct(place);
    const existing = base && base !== fullName ? series.get(key) : null;
    if (existing) {
      existing.places.push(place);
      if (anchor) existing.anchors.push(anchor);
      continue;
    }
    const typeLabel = enovSpaceTypeLabel(place.enov_space_type);
    const entry = {
      tier,
      place,
      places: [place],
      name: fullName,
      baseName: base,
      emoji: String(emoji || ''),
      typeId: typeLabel ? String(place.enov_space_type) : UNTYPED_SPACE_ID,
      typeLabel: typeLabel || UNTYPED_SPACE_LABEL,
      summary: summaryLength > 0 ? summarizeEnovText(description, summaryLength) : '',
      anchor,
      anchors: anchor ? [anchor] : [],
    };
    if (base && base !== fullName) series.set(key, entry);
    else series.set(`${key}\u0000${place.kind}:${place.id}`, entry);
  }
  return [...series.values()].map((entry) =>
    entry.places.length > 1
      ? { ...entry, name: entry.baseName, count: entry.places.length }
      : { ...entry, count: 1 },
  );
}

function groupByType(entries) {
  const groups = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.typeId === entry.typeId) last.entries.push(entry);
    else groups.push({ typeId: entry.typeId, label: entry.typeLabel, entries: [entry] });
  }
  return groups;
}

/** Aire (en %²) d'un polygone, pour faire passer les grandes zones d'abord. */
function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.xp * b.yp - b.xp * a.yp;
  }
  return Math.abs(area) / 2;
}

/**
 * Noms de repérage des autres zones, **sans chevauchement** : les grandes zones d'abord, et un
 * nom n'est posé que s'il ne tombe ni sur un nom déjà posé ni sur un numéro. Les distances
 * sont en pourcentage de la carte : une étiquette fait environ `labelW` × `labelH`.
 *
 * @param {Array<object>} others lieux non mis en avant.
 * @param {Array<{xp:number,yp:number}>} pins ancres des numéros.
 * @returns {Array<{ place: object, name: string, anchor: {xp:number,yp:number} }>}
 */
export function pickOtherLabels(others, pins = [], { labelW = 11, labelH = 3.4, pinR = 3.2 } = {}) {
  const candidates = (others || [])
    .filter((place) => place?.kind === 'zone')
    .map((place) => {
      const { name } = placeDisplayParts(place);
      const points = parsePctPolygonPoints(place.points);
      return {
        place,
        name: String(name || '').trim(),
        anchor: placeAnchorPct(place),
        area: polygonArea(points),
      };
    })
    .filter((c) => c.name && c.anchor)
    .sort((a, b) => b.area - a.area);
  const placed = [];
  for (const candidate of candidates) {
    const { xp, yp } = candidate.anchor;
    const onPin = pins.some(
      (pin) => Math.abs(pin.xp - xp) < pinR + labelW / 2 && Math.abs(pin.yp - yp) < pinR,
    );
    if (onPin) continue;
    const onLabel = placed.some(
      (other) => Math.abs(other.anchor.xp - xp) < labelW && Math.abs(other.anchor.yp - yp) < labelH,
    );
    if (onLabel) continue;
    placed.push(candidate);
  }
  return placed.map(({ place, name, anchor }) => ({ place, name, anchor }));
}

/**
 * Écarte les numéros qui se chevauchent. Deux lieux voisins (n³ et le fablab, deux points de
 * tri…) posaient leurs pastilles l'une sur l'autre : chaque paire trop proche est repoussée,
 * à parts égales, le long de l'axe qui la sépare, jusqu'à ce qu'aucune ne recouvre l'autre ou
 * que le nombre de passes soit atteint. Les positions restent dans la carte.
 *
 * Les tailles sont en pourcentage de la carte, dans chaque sens : une pastille ronde occupe
 * moins de largeur relative que de hauteur relative sur une carte en largeur.
 *
 * @param {Array<{xp:number,yp:number}>} pins positions d'origine (ancres).
 * @param {{ minX?: number, minY?: number, iterations?: number }} [options]
 * @returns {Array<{xp:number,yp:number,moved:boolean}>} positions, dans le même ordre.
 */
export function spreadPins(pins, { minX = 4.4, minY = 3.7, iterations = 40 } = {}) {
  const out = (pins || []).map((pin) => ({ xp: pin.xp, yp: pin.yp }));
  const clamp = (v) => Math.min(99, Math.max(1, v));
  for (let pass = 0; pass < iterations; pass += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        // Distance normalisée : 1 = pastilles tangentes.
        let dx = (b.xp - a.xp) / minX;
        let dy = (b.yp - a.yp) / minY;
        const dist = Math.hypot(dx, dy);
        if (dist >= 1) continue;
        if (dist < 1e-6) {
          // Superposition exacte : on écarte à l'horizontale, l'ordre décide du côté.
          dx = 1;
          dy = 0;
        } else {
          dx /= dist;
          dy /= dist;
        }
        const push = (1 - Math.min(dist, 1)) / 2 + 0.01;
        a.xp = clamp(a.xp - dx * push * minX);
        a.yp = clamp(a.yp - dy * push * minY);
        b.xp = clamp(b.xp + dx * push * minX);
        b.yp = clamp(b.yp + dy * push * minY);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out.map((pin, index) => ({
    ...pin,
    moved: Math.hypot(pin.xp - pins[index].xp, pin.yp - pins[index].yp) > 0.6,
  }));
}

/**
 * Plan annoté d'une carte, prêt à dessiner.
 *
 * Deux niveaux, dans l'ordre du dossier de labellisation :
 * - les **espaces retenus** (premier niveau) : numérotés d'abord, rangés par type d'espace
 *   (ordre de `ENOV_SPACE_TYPES`, non renseignés en dernier), puis par nom, avec leur texte ;
 * - les **autres lieux d'innovation** (`map_highlight_tone: 'secondary'`) : numérotés à la
 *   suite, dans le même ordre, en légende compacte (texte court seulement si demandé).
 *
 * @param {Array<object>} places lieux de la charge (`planPlacesFromContent`).
 * @param {object} [options]
 * @param {number} [options.summaryLength] longueur du texte court des espaces retenus.
 * @param {number} [options.secondarySummaryLength] idem pour le second niveau (0 = noms seuls).
 * @returns {{
 *   entries: Array<object>, groups: Array<object>, secondaryEntries: Array<object>,
 *   secondaryGroups: Array<object>, others: Array<object>, typeCount: number,
 *   primaryCount: number, secondaryCount: number,
 * }}
 */
export function buildAnnotatedPlan(
  places,
  { summaryLength = DEFAULT_SUMMARY_LENGTH, secondarySummaryLength = 0 } = {},
) {
  const list = Array.isArray(places) ? places : [];
  const collator = new Intl.Collator('fr-FR', { sensitivity: 'base', numeric: true });
  const primary = [];
  const secondary = [];
  const others = [];
  for (const place of list) {
    if (!place) continue;
    if (place.map_highlight !== true) others.push(place);
    else if (placeTier(place) === TIER_SECONDARY) secondary.push(place);
    else primary.push(place);
  }
  const sortEntries = (entries) =>
    entries.sort(
      (a, b) => typeRank(a.typeId) - typeRank(b.typeId) || collator.compare(a.name, b.name),
    );
  const primaryEntries = sortEntries(prepareEntries(primary, TIER_PRIMARY, summaryLength));
  const secondaryPrepared = sortEntries(
    prepareEntries(secondary, TIER_SECONDARY, secondarySummaryLength),
  );
  let number = 0;
  const entries = primaryEntries.map((entry) => ({ ...entry, number: (number += 1) }));
  const secondaryEntries = secondaryPrepared.map((entry) => ({ ...entry, number: (number += 1) }));
  const groups = groupByType(entries);
  const secondaryGroups = groupByType(secondaryEntries);
  const typeCount = groups.filter((group) => group.typeId !== UNTYPED_SPACE_ID).length;
  return {
    entries,
    groups,
    secondaryEntries,
    secondaryGroups,
    others,
    typeCount,
    primaryCount: entries.length,
    secondaryCount: secondaryEntries.length,
  };
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
