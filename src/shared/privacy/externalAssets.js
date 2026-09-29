import { withAppBase } from '../appBase.js';

/**
 * Ressources tierces chargées par le navigateur (réglage `privacy.external_assets_mode`,
 * audit RGPD du 28/09/2026, § 7).
 *
 * En mode `local` (défaut), le navigateur ne contacte ni Google Fonts ni Wikimedia : les
 * polices sont servies par l'application et les images Wikimedia passent par le relais
 * `GET /api/media/remote`, qui les met en cache côté serveur. `external` rétablit le chargement
 * direct.
 *
 * Le mode est posé une fois par produit, dès que ses réglages publics sont connus
 * (`setExternalAssetsMode`). Avant cela, la valeur `local` s'applique : c'est la plus sûre.
 */

export const EXTERNAL_ASSETS_MODES = Object.freeze(['local', 'external']);

/** Hôtes dont les images sont relayées par le serveur en mode `local`. */
export const PROXIED_IMAGE_HOSTS = Object.freeze(['upload.wikimedia.org', 'commons.wikimedia.org']);

/** Familles embarquées par l'application (`src/shared/fonts/`, `/fonts/local-fonts.css`). */
export const LOCAL_FONT_FAMILIES = Object.freeze([
  'Playfair Display',
  'DM Sans',
  'Caudex',
  'Cinzel',
  'DM Mono',
  'Bebas Neue',
  'Special Elite',
]);

let currentMode = 'local';

export function normalizeExternalAssetsMode(value) {
  return value === 'external' ? 'external' : 'local';
}

export function setExternalAssetsMode(value) {
  currentMode = normalizeExternalAssetsMode(value);
}

export function getExternalAssetsMode() {
  return currentMode;
}

function parseHttpsUrl(raw) {
  const text = String(raw || '').trim();
  if (!/^https:\/\//i.test(text)) return null;
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

/**
 * Largeurs de vignette servies par Wikimedia sans rendu à la demande (les largeurs
 * arbitraires sont limitées) : https://www.mediawiki.org/wiki/Common_thumbnail_sizes
 */
export const WIKIMEDIA_THUMB_WIDTHS = Object.freeze([120, 250, 330, 500, 960, 1280, 1920]);

const WIKIMEDIA_ORIGINAL_RE =
  /^\/wikipedia\/([\w-]+)\/(?!thumb\/)([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/i;
const WIKIMEDIA_THUMB_RE =
  /^\/wikipedia\/([\w-]+)\/thumb\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)\/\d+px-[^/]+$/i;

/**
 * Vignette Wikimedia (`…/thumb/a/ab/Fichier.jpg/330px-Fichier.jpg`) d'au moins `width` px,
 * arrondie à une largeur standard. Toute autre URL est rendue telle quelle. Un original plus
 * petit que la vignette demandée échoue côté Wikimedia : l'appelant garde l'original en repli.
 * @param {string} url
 * @param {number} width largeur d'affichage souhaitée (px CSS × densité)
 */
export function wikimediaThumbUrl(url, width) {
  const parsed = parseHttpsUrl(url);
  if (!parsed || parsed.hostname.toLowerCase() !== 'upload.wikimedia.org') return url;
  const target = Number(width);
  if (!(target > 0)) return url;
  const bucket =
    WIKIMEDIA_THUMB_WIDTHS.find((w) => w >= target) ??
    WIKIMEDIA_THUMB_WIDTHS[WIKIMEDIA_THUMB_WIDTHS.length - 1];
  const match =
    WIKIMEDIA_ORIGINAL_RE.exec(parsed.pathname) || WIKIMEDIA_THUMB_RE.exec(parsed.pathname);
  if (!match) return url;
  const [, project, a, ab, file] = match;
  // Les vignettes d'un SVG, d'un TIFF ou d'un PDF sont rendues en PNG / JPEG.
  const suffix = /\.svg$/i.test(file) ? '.png' : /\.(tiff?|pdf)$/i.test(file) ? '.jpg' : '';
  parsed.pathname = `/wikipedia/${project}/thumb/${a}/${ab}/${file}/${bucket}px-${file}${suffix}`;
  parsed.search = '';
  return parsed.toString();
}

/**
 * URL à donner à une balise `<img>` pour une image éventuellement hébergée chez un tiers.
 * En mode `local`, une image Wikimedia passe par le relais du serveur ; toute autre URL
 * (relative, data:, blob:, autre hôte) est rendue telle quelle. `width` demande une vignette
 * Wikimedia plutôt que l'original (tuiles, catalogues).
 * @param {string} url
 * @param {{ mode?: 'local'|'external', width?: number }} [options]
 */
export function resolveExternalImageUrl(url, { mode, width } = {}) {
  if (width) url = wikimediaThumbUrl(url, width);
  const effective = normalizeExternalAssetsMode(mode ?? currentMode);
  if (effective === 'external') return url;
  const parsed = parseHttpsUrl(url);
  if (!parsed || !PROXIED_IMAGE_HOSTS.includes(parsed.hostname.toLowerCase())) return url;
  return withAppBase(`/api/media/remote?url=${encodeURIComponent(parsed.toString())}`);
}

/**
 * Familles de marque à demander à Google Fonts : aucune en mode `local` ; en mode `external`,
 * seulement celles que l'application n'embarque pas déjà (sinon double chargement).
 * @param {string[]} families
 * @param {'local'|'external'} mode
 */
export function remoteBrandFontFamilies(families, mode) {
  if (normalizeExternalAssetsMode(mode) !== 'external') return [];
  const bundled = new Set(LOCAL_FONT_FAMILIES.map((f) => f.toLowerCase()));
  return (families || [])
    .map((item) => String(item || '').trim())
    .filter((item) => item && !bundled.has(item.toLowerCase()));
}
