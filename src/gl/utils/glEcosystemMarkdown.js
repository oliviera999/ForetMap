/**
 * Nettoyage du markdown biotope / biocénose pour l’onglet Écosystèmes :
 * retrait des images déjà affichées via le registre catalogue et des titres redondants.
 */

import { biomeAssetSlug } from '../data/biomes.registry.js';
import {
  LEGACY_BASENAME_ALIASES,
  legacyMediaBasename,
  normalizeLegacyMediaBasename,
  resolveLegacyGlStableKey,
} from './glLegacyMediaUrl.js';

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** Titres de section génériques déjà rendus par l’UI (h4 Biotope / Biocénose). */
const REDUNDANT_HEADING_RE = /^##\s+biotope\s*$|^##\s+bioc[eé]nose\s*$/gim;

/**
 * @param {string} biomeSlug
 * @param {Array<'biome'|'realiste'|'biocenose'>} kinds
 * @returns {Set<string>}
 */
export function collectBiomeIllustrationKeys(biomeSlug, kinds = ['biome', 'realiste', 'biocenose']) {
  const keys = new Set();
  for (const kind of kinds) {
    const stable = biomeAssetSlug(biomeSlug, kind);
    if (stable) keys.add(stable);
  }
  for (const [legacy, stable] of Object.entries(LEGACY_BASENAME_ALIASES)) {
    if (keys.has(stable)) keys.add(legacy);
  }
  return keys;
}

/**
 * @param {string} href
 * @param {Set<string>} keys
 */
export function markdownImageMatchesCatalogKeys(href, keys) {
  if (!keys?.size) return false;
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('scene:')) return false;

  const basename = raw.includes('/') ? legacyMediaBasename(raw) : raw;
  const normalized = normalizeLegacyMediaBasename(basename);
  const stableKey = resolveLegacyGlStableKey(raw) || normalized;

  for (const key of keys) {
    const normalizedKey = normalizeLegacyMediaBasename(key);
    if (stableKey === key || stableKey === normalizedKey) return true;
    if (normalized === key || normalized === normalizedKey) return true;
    if (raw.includes(key) || raw.includes(normalizedKey)) return true;
  }
  return false;
}

/**
 * @param {string} markdown
 * @param {Set<string>} keys
 */
export function stripMarkdownCatalogImages(markdown, keys) {
  const raw = String(markdown ?? '');
  if (!raw || !keys?.size) return raw.trim();
  const cleaned = raw
    .replace(MD_IMAGE_RE, (match, _alt, href) =>
      markdownImageMatchesCatalogKeys(href, keys) ? '' : match,
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned;
}

/** Retire les titres `## Biotope` / `## Biocénose` redondants avec l’UI. */
export function stripRedundantEcosystemHeadings(markdown) {
  return String(markdown ?? '')
    .replace(REDUNDANT_HEADING_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {string} markdown
 * @param {string|null} biomeSlug
 * @param {Array<'biome'|'realiste'|'biocenose'>} stripKinds
 */
export function prepareEcosystemMarkdown(markdown, biomeSlug, stripKinds = []) {
  let text = stripRedundantEcosystemHeadings(markdown);
  if (biomeSlug && stripKinds.length > 0) {
    const keys = collectBiomeIllustrationKeys(biomeSlug, stripKinds);
    text = stripMarkdownCatalogImages(text, keys);
  }
  return text;
}
