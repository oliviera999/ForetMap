/**
 * Lecture tolérante de coordonnées GPS saisies à la main ou collées.
 *
 * Le calage GPS des plans (outil prof) demande des latitudes/longitudes en **degrés
 * décimaux**. Une saisie brute est pourtant très variable : virgule décimale française
 * (`48,8534`), champ `type="number"` qui se re-formate selon la locale du navigateur,
 * hémisphère en lettre (`48.8534 N`, `2°17'40" O`), copier-coller Google Maps
 * (`48.8534, 2.3488` ou une URL `.../@48.8534,2.3488,17z`). Plutôt que d'imposer un
 * seul format, on normalise tout ce qui est lisible sans ambiguïté.
 *
 * Principe : ne jamais deviner. Une entrée ambiguë (`48,85` — décimal français ou paire
 * « 48 puis 85 » ?) est traitée comme une seule coordonnée, jamais comme une paire.
 *
 * @typedef {'lat'|'lng'} GeoAxis
 * @typedef {{ value: number, axis: GeoAxis|null }} GeoToken
 */

/** Signe et axe impliqués par une lettre d'hémisphère (O = Ouest, W = West). */
const HEMISPHERES = {
  N: { sign: 1, axis: 'lat' },
  S: { sign: -1, axis: 'lat' },
  E: { sign: 1, axis: 'lng' },
  W: { sign: -1, axis: 'lng' },
  O: { sign: -1, axis: 'lng' },
};

/** Amplitude maximale acceptée par axe (axe inconnu → borne la plus large). */
const AXIS_LIMITS = { lat: 90, lng: 180 };

/** Caractères qui marquent une valeur « coordonnée » et non un entier isolé. */
const DECIMAL_MARKERS = /[.,°'"]/;

/** Séparateurs explicites de paire (la virgule est traitée à part : elle est ambiguë). */
const PAIR_SEPARATORS = [';', '|', '/'];

/**
 * Uniformise les variantes typographiques : signes moins, espaces insécables, primes,
 * guillemets et symboles de degré.
 * @param {string} raw
 * @returns {string}
 */
function normalizeTypography(raw) {
  return raw
    .replace(/[−‒–—―]/g, '-')
    .replace(/[     ]/g, ' ')
    .replace(/[′‵‘’´`]/g, "'")
    .replace(/[″‶“”]/g, '"')
    .replace(/[º°˚]/g, '°')
    .trim();
}

/**
 * Convertit une suite de chiffres à séparateur décimal libre (`.` ou `,`) en nombre.
 * Aucun espace interne n'est toléré : `48 2` reste deux valeurs, pas `482`.
 * @param {string} part
 * @returns {number|null}
 */
function toDecimal(part) {
  const compact = part.trim();
  if (!compact || /\s/.test(compact)) return null;
  const commas = (compact.match(/,/g) || []).length;
  const dots = (compact.match(/\./g) || []).length;
  // `1,234.56` : la virgule sépare les milliers ; `48,8534` : elle est décimale.
  const unified = dots > 0 ? compact.replace(/,/g, '') : compact.replace(',', '.');
  if (commas > 1 && dots === 0) return null;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(unified)) return null;
  const value = Number(unified);
  return Number.isFinite(value) ? value : null;
}

/**
 * Analyse une coordonnée isolée : décimal (`48,8534`), degrés-minutes-secondes
 * (`48°51'12.2"N`) ou degrés-minutes (`48°51.2' N`), avec hémisphère optionnel en
 * préfixe ou en suffixe.
 * @param {unknown} raw
 * @returns {GeoToken|null} valeur en degrés décimaux et axe déduit, ou null si illisible
 */
export function parseGeoToken(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, axis: null } : null;
  }
  if (typeof raw !== 'string') return null;

  let text = normalizeTypography(raw);
  if (!text) return null;

  // Hémisphère : une seule lettre, en tête ou en fin, jamais les deux.
  let axis = null;
  let hemisphereSign = 1;
  const head = text.match(/^([NSEWO])\s*/i);
  const tail = text.match(/\s*([NSEWO])$/i);
  if (head && tail) return null;
  const letter = (head || tail)?.[1];
  if (letter) {
    const hemisphere = HEMISPHERES[letter.toUpperCase()];
    axis = hemisphere.axis;
    hemisphereSign = hemisphere.sign;
    text = (head ? text.slice(head[0].length) : text.slice(0, tail.index)).trim();
  }

  // Signe explicite, conservé séparément pour se combiner avec l'hémisphère.
  let sign = 1;
  const signMatch = text.match(/^([+-])\s*/);
  if (signMatch) {
    if (signMatch[1] === '-') sign = -1;
    text = text.slice(signMatch[0].length).trim();
  }
  if (!text) return null;

  let magnitude = null;
  if (text.includes('°')) {
    const dms = text.match(/^(\S+)\s*°\s*(?:([^'"]+)\s*'\s*(?:([^"]+)\s*"?\s*)?)?$/);
    if (!dms) return null;
    const degrees = toDecimal(dms[1]);
    const minutes = dms[2] == null ? 0 : toDecimal(dms[2]);
    const seconds = dms[3] == null ? 0 : toDecimal(dms[3]);
    if (degrees == null || minutes == null || seconds == null) return null;
    if (degrees < 0 || minutes < 0 || seconds < 0) return null;
    if (minutes >= 60 || seconds >= 60) return null;
    magnitude = degrees + minutes / 60 + seconds / 3600;
  } else {
    magnitude = toDecimal(text);
    if (magnitude == null) return null;
    if (magnitude < 0) {
      // Double signe (`--48`) déjà exclu par toDecimal ; ici `-48` sans préfixe capté.
      sign *= -1;
      magnitude = Math.abs(magnitude);
    }
  }

  const value = magnitude * sign * hemisphereSign;
  return Number.isFinite(value) ? { value, axis } : null;
}

/**
 * Analyse une coordonnée pour un axe donné, avec contrôle d'amplitude.
 * @param {unknown} raw saisie utilisateur (nombre ou texte)
 * @param {GeoAxis} [axis] axe attendu ; borne la valeur (±90 en latitude, ±180 sinon)
 * @returns {number|null} degrés décimaux, ou null si illisible ou hors bornes
 */
export function parseGeoCoordinate(raw, axis) {
  const token = parseGeoToken(raw);
  if (!token) return null;
  // Un `2.3 N` demandé en longitude est une erreur de saisie, pas une valeur à corriger.
  if (axis && token.axis && token.axis !== axis) return null;
  const limit = AXIS_LIMITS[axis] ?? AXIS_LIMITS.lng;
  return Math.abs(token.value) <= limit ? token.value : null;
}

/**
 * Vérifie qu'une moitié de paire ressemble bien à une coordonnée (et pas à la partie
 * décimale d'un nombre français coupée sur sa virgule).
 * @param {string} part
 * @returns {boolean}
 */
function looksLikeCoordinate(part) {
  return DECIMAL_MARKERS.test(part) || /[NSEWO]/i.test(part);
}

/**
 * Ordonne deux jetons en (lat, lng) : les lettres d'hémisphère priment, sinon l'ordre
 * de saisie (latitude d'abord, convention Google Maps / OSM).
 * @param {GeoToken} first
 * @param {GeoToken} second
 * @returns {{lat: number, lng: number}|null}
 */
function orderPair(first, second) {
  let latToken = first;
  let lngToken = second;
  if (first.axis === 'lng' || second.axis === 'lat') {
    latToken = second;
    lngToken = first;
  }
  if (latToken.axis === 'lng' || lngToken.axis === 'lat') return null;
  if (Math.abs(latToken.value) > AXIS_LIMITS.lat) return null;
  if (Math.abs(lngToken.value) > AXIS_LIMITS.lng) return null;
  return { lat: latToken.value, lng: lngToken.value };
}

/**
 * Tente de lire une paire à partir d'une découpe candidate.
 * @param {string} left
 * @param {string} right
 * @param {{requireMarkers?: boolean}} [opts]
 * @returns {{lat: number, lng: number}|null}
 */
function tryPair(left, right, { requireMarkers = true } = {}) {
  if (!left.trim() || !right.trim()) return null;
  if (requireMarkers && !(looksLikeCoordinate(left) && looksLikeCoordinate(right))) return null;
  const first = parseGeoToken(left);
  const second = parseGeoToken(right);
  if (!first || !second) return null;
  return orderPair(first, second);
}

/**
 * Extrait une paire d'une URL de carte (Google Maps `@lat,lng`, `!3dlat!4dlng`,
 * paramètres `q=`/`ll=`/`center=`, ou OpenStreetMap `#map=zoom/lat/lng`).
 * @param {string} text
 * @returns {{lat: number, lng: number}|null}
 */
function parseMapUrl(text) {
  if (!/^https?:\/\//i.test(text)) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(text);
    } catch (_) {
      return text;
    }
  })();
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&#](?:q|query|ll|sll|center|destination|mlat)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /#map=[\d.]+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const pair = tryPair(match[1], match[2], { requireMarkers: false });
    if (pair) return pair;
  }
  return null;
}

/**
 * Lit une paire « latitude, longitude » collée d'un seul tenant.
 *
 * Accepte `48.8534, 2.3488`, `48,8534, 2,3488`, `48.8534 2.3488`, `48°51'12"N 2°17'40"E`,
 * `2.3488 E; 48.8534 N` et les URL Google Maps / OpenStreetMap. Refuse volontairement
 * `48,85` (une seule coordonnée en notation française) et `48, 2` (trop ambigu).
 *
 * @param {unknown} raw
 * @returns {{lat: number, lng: number}|null}
 */
export function parseGeoPair(raw) {
  if (typeof raw !== 'string') return null;
  const text = normalizeTypography(raw);
  if (!text) return null;

  const fromUrl = parseMapUrl(text);
  if (fromUrl) return fromUrl;

  for (const separator of PAIR_SEPARATORS) {
    const index = text.indexOf(separator);
    if (index <= 0 || text.indexOf(separator, index + 1) !== -1) continue;
    const pair = tryPair(text.slice(0, index), text.slice(index + 1), { requireMarkers: false });
    if (pair) return pair;
  }

  // Virgule : chaque position est testée, mais les deux moitiés doivent porter un
  // marqueur décimal — sinon `48,85` (décimal français) serait lu comme une paire.
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== ',') continue;
    const pair = tryPair(text.slice(0, i), text.slice(i + 1));
    if (pair) return pair;
  }

  const parts = text.split(/\s+/);
  if (parts.length === 2) {
    const pair = tryPair(parts[0], parts[1]);
    if (pair) return pair;
  }
  return null;
}

/**
 * Rend une coordonnée sous sa forme canonique (degrés décimaux, point décimal),
 * pour réafficher un champ après saisie.
 * @param {number|null|undefined} value
 * @param {number} [decimals=7] décimales maximales conservées (~1 cm)
 * @returns {string} chaîne vide si la valeur n'est pas un nombre fini
 */
export function formatGeoCoordinate(value, decimals = 7) {
  if (!Number.isFinite(value)) return '';
  return String(Number(Number(value).toFixed(decimals)));
}
