/**
 * Résolution des clés audio plateau — aligné sur les fichiers GL_plateau-* uploadés.
 *
 * Les clés audio sont des identifiants stables (`data/gl/audio-pack/MANIFEST.json`) : leur
 * préfixe `plateau-N_` date d'un découpage du voyage antérieur et ne dit plus sur quel
 * plateau la piste joue. La piste se choisit donc **par biome**, le plateau ne fournissant
 * que la piste par défaut quand le biome est inconnu ou absent :
 *
 * | Plateau | Biomes                         | Pistes                                                    |
 * | ------- | ------------------------------ | --------------------------------------------------------- |
 * | 1       | jungle_afc / savane            | plateau-1_jungle / plateau-2_savane                       |
 * | 2       | sahara / foret_mediterraneenne | plateau-1_desert-chaud / plateau-2_mediterranee           |
 * | 3       | foret_caducifoliee / landes    | plateau-4_foret-caducifoliee / plateau-3_landes           |
 * | 4       | taiga / toundra                | plateau-5_taiga / plateau-5_toundra-jour puis -nuit       |
 */
import { resolveBiome, normalizeBiomeSlugKey } from '../data/biomes.registry.js';

/** Biome canonique → clé audio (`_toundra` : jour ou nuit selon la saison). */
const AUDIO_BY_BIOME = {
  jungle_afc: 'plateau-1_jungle',
  savane: 'plateau-2_savane',
  sahara: 'plateau-1_desert-chaud',
  foret_mediterraneenne: 'plateau-2_mediterranee',
  foret_caducifoliee: 'plateau-4_foret-caducifoliee',
  landes: 'plateau-3_landes',
  taiga: 'plateau-5_taiga',
  toundra: '_toundra',
  // Hors trajet : pistes historiques conservées pour un chapitre qui les porterait encore.
  mangrove: 'plateau-1_jungle',
  prairie_steppe: 'plateau-4_foret-caducifoliee',
  desert_froid: 'plateau-4_desert-froid',
};

/** Piste par défaut d'un plateau (biome absent ou inconnu). */
const DEFAULT_AUDIO_BY_PLATEAU = {
  1: 'plateau-1_jungle',
  2: 'plateau-1_desert-chaud',
  3: 'plateau-4_foret-caducifoliee',
  4: 'plateau-5_taiga',
  // Plus aucun chapitre narratif sur le plateau 5 (fusion des chapitres 4 et 5) ;
  // gardé pour un chapitre qu'un administrateur y rattacherait encore.
  5: 'plateau-5_taiga',
};

export function inferSaisonFromBiomeSlug(biomeSlug) {
  const raw = String(biomeSlug || '')
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw.includes('hiver')) return 'hiver';
  if (raw.includes('ete') || raw.includes('été')) return 'ete';
  return null;
}

function toundraAudioKey(saison) {
  return saison === 'hiver' ? 'plateau-5_toundra-nuit' : 'plateau-5_toundra-jour';
}

function pickExistingKey(candidates, knownSlugs) {
  const set = knownSlugs instanceof Set ? knownSlugs : new Set(knownSlugs || []);
  for (const key of candidates) {
    if (key && set.has(key)) return key;
  }
  return null;
}

/**
 * Clé audio de la musique de plateau.
 *
 * @param {number} plateauNumber plateau du chapitre (1–5)
 * @param {string|null} biomeSlug biome (slug catalogue, alias ou sous-biome de case :
 *   `toundra_hiver` donne la nuit polaire)
 * @param {'ete'|'hiver'|null} saison force la saison de la toundra
 * @param {string[]|Set<string>} knownSlugs clés connues de la médiathèque
 * @param {Record<string, { relativePath?: string }>|null} keyIndex index des clés : quand il
 *   est fourni, le repli par préfixe `plateau-N_` ne retient que des fichiers audio (une image
 *   de plateau `plateau-N_fond` ne doit jamais devenir une musique)
 */
export function resolvePlateauAudioSlug(
  plateauNumber,
  biomeSlug = null,
  saison = null,
  knownSlugs = [],
  keyIndex = null,
) {
  const n = Number(plateauNumber);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;

  const set = knownSlugs instanceof Set ? knownSlugs : new Set(knownSlugs || []);
  const defaultKey = DEFAULT_AUDIO_BY_PLATEAU[n] || null;

  const biome = biomeSlug ? resolveBiome(biomeSlug) : null;
  const canon = biome?.slugCanonique || normalizeBiomeSlugKey(biomeSlug);
  const effectiveSaison = saison || inferSaisonFromBiomeSlug(biomeSlug);
  const mapped = canon ? AUDIO_BY_BIOME[canon] : null;

  if (mapped === '_toundra') {
    const toundraKey = toundraAudioKey(effectiveSaison);
    if (set.has(toundraKey)) return toundraKey;
  }

  const hit = pickExistingKey([mapped !== '_toundra' ? mapped : null, defaultKey], set);
  if (hit) return hit;

  const index = keyIndex && typeof keyIndex === 'object' ? keyIndex : null;
  const isAudioKey = (slug) => {
    if (!index) return true;
    const rel = index[slug]?.relativePath;
    if (!rel) return true;
    return String(rel).replace(/\\/g, '/').includes('/audio/');
  };
  const prefix = `plateau-${n}_`;
  const prefixMatches = [...set]
    .filter((slug) => slug.startsWith(prefix) && isAudioKey(slug))
    .sort();
  if (prefixMatches.length > 0) return prefixMatches[0];

  return null;
}

export function resolveIntroAudioSlug(knownSlugs = []) {
  const set = knownSlugs instanceof Set ? knownSlugs : new Set(knownSlugs || []);
  return (
    pickExistingKey(['intro_ambiance', 'intro_loop', 'intro_01_la-boite'], set) ||
    [...set].find((slug) => slug.startsWith('intro_') && slug.includes('audio')) ||
    [...set].filter((slug) => slug.startsWith('intro_')).sort()[0] ||
    null
  );
}
