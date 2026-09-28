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
 * URL à donner à une balise `<img>` pour une image éventuellement hébergée chez un tiers.
 * En mode `local`, une image Wikimedia passe par le relais du serveur ; toute autre URL
 * (relative, data:, blob:, autre hôte) est rendue telle quelle.
 * @param {string} url
 * @param {{ mode?: 'local'|'external' }} [options]
 */
export function resolveExternalImageUrl(url, { mode } = {}) {
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
