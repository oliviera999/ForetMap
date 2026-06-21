/**
 * Résolution des clés audio plateau — aligné sur les fichiers GL_plateau-* uploadés.
 */
import { resolveBiome, normalizeBiomeSlugKey } from '../data/biomes.registry.js';

const AUDIO_BY_PLATEAU_BIOME = {
  1: {
    _default: 'plateau-1_jungle',
    sahara: 'plateau-1_desert-chaud',
    desert_chaud: 'plateau-1_desert-chaud',
    jungle_afc: 'plateau-1_jungle',
    mangrove: 'plateau-1_jungle',
  },
  2: {
    _default: 'plateau-2_savane',
    savane: 'plateau-2_savane',
    foret_mediterraneenne: 'plateau-2_mediterranee',
  },
  3: {
    _default: 'plateau-3_landes',
    landes: 'plateau-3_landes',
  },
  4: {
    _default: 'plateau-4_foret-caducifoliee',
    foret_caducifoliee: 'plateau-4_foret-caducifoliee',
    prairie_steppe: 'plateau-4_foret-caducifoliee',
    desert_froid: 'plateau-4_desert-froid',
  },
  5: {
    _default: 'plateau-5_taiga',
    taiga: 'plateau-5_taiga',
    toundra: '_toundra',
    desert_froid: 'plateau-5_taiga',
  },
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

export function resolvePlateauAudioSlug(
  plateauNumber,
  biomeSlug = null,
  saison = null,
  knownSlugs = [],
) {
  const n = Number(plateauNumber);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;

  const set = knownSlugs instanceof Set ? knownSlugs : new Set(knownSlugs || []);
  const plateauMap = AUDIO_BY_PLATEAU_BIOME[n];
  if (!plateauMap) return null;

  const biome = biomeSlug ? resolveBiome(biomeSlug) : null;
  const canon = biome?.slugCanonique || normalizeBiomeSlugKey(biomeSlug);
  const effectiveSaison = saison || inferSaisonFromBiomeSlug(biomeSlug);

  if (canon === 'toundra' || plateauMap[canon] === '_toundra') {
    const toundraKey = toundraAudioKey(effectiveSaison);
    if (set.has(toundraKey)) return toundraKey;
  }

  const mapped = canon ? plateauMap[canon] : null;
  if (mapped && mapped !== '_toundra') {
    const hit = pickExistingKey([mapped, plateauMap._default], set);
    if (hit) return hit;
  }

  const prefix = `plateau-${n}_`;
  const prefixMatches = [...set].filter((slug) => slug.startsWith(prefix)).sort();
  if (prefixMatches.length > 0) return prefixMatches[0];

  return pickExistingKey([plateauMap._default], set);
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
