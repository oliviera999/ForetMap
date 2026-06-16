'use strict';

const GL_BIOME_REGISTRY = [
  {
    slugCanonique: 'sahara',
    nom: 'Désert chaud (Sahara)',
    plateau: 1,
    aliases: ['desert_chaud'],
    assets: {
      board: 'plateau-1_tropiques-africains',
      biome: 'biome_sahara',
      realiste: 'biome-realiste_sahara',
      biocenose: 'biocenose_sahara',
    },
  },
  {
    slugCanonique: 'jungle_afc',
    nom: "Jungle d'Afrique centrale",
    plateau: 1,
    aliases: ['jungle', 'jungle-afc'],
    assets: {
      board: 'plateau-1_tropiques-africains',
      biome: 'biome_jungle',
      realiste: 'biome-realiste_jungle',
      biocenose: 'biocenose_jungle',
    },
  },
  {
    slugCanonique: 'mangrove',
    nom: 'Mangrove',
    plateau: 1,
    aliases: [],
    assets: {
      board: 'plateau-1_tropiques-africains',
      biome: 'biome_mangrove',
      biocenose: null,
      realiste: null,
    },
  },
  {
    slugCanonique: 'savane',
    nom: 'Savane tropicale',
    plateau: 2,
    aliases: [],
    assets: {
      board: 'plateau-2_sahara-mediterranee',
      biome: 'biome_savane-africaine',
      realiste: 'biome_savane-africaine',
      biocenose: 'biocenose_savane',
    },
  },
  {
    slugCanonique: 'foret_mediterraneenne',
    nom: 'Forêt méditerranéenne',
    plateau: 2,
    aliases: ['foret-mediterraneenne'],
    assets: {
      board: 'plateau-2_sahara-mediterranee',
      biome: 'biome_foret-mediterraneenne',
      realiste: 'biome-realiste_foret-mediterraneenne',
      biocenose: 'biocenose_foret-mediterraneenne',
    },
  },
  {
    slugCanonique: 'landes',
    nom: 'Landes atlantiques',
    plateau: 3,
    aliases: [],
    assets: {
      board: 'plateau-3_forets-landes-atlantiques',
      biome: 'biome_landes-atlantiques',
      realiste: 'biome-realiste_landes-atlantiques',
      biocenose: 'biocenose_landes-atlantiques',
    },
  },
  {
    slugCanonique: 'foret_caducifoliee',
    nom: 'Forêt caducifoliée tempérée',
    plateau: 4,
    aliases: ['caduc', 'foret-caducifoliee'],
    assets: {
      board: 'plateau-4_taiga-desert_froid',
      biome: 'biome_foret-caducifoliee',
      realiste: 'biome-realiste_foret-caducifoliee',
      biocenose: 'biocenose_foret-caducifoliee',
    },
  },
  {
    slugCanonique: 'prairie_steppe',
    nom: 'Prairie tempérée / Steppe',
    plateau: 4,
    aliases: ['prairie-steppe'],
    assets: {
      board: 'plateau-4_taiga-desert_froid',
      biome: 'biome-realiste_prairie-montagne_concept',
      realiste: 'biome-realiste_prairie-montagne_concept',
      biocenose: null,
    },
  },
  {
    slugCanonique: 'taiga',
    nom: 'Taïga (forêt boréale)',
    plateau: 5,
    aliases: [],
    assets: {
      board: 'plateau-5_toundra-arctique',
      biome: 'biome-realiste_taiga',
      realiste: 'biome-realiste_taiga',
      biocenose: 'biocenose_taiga',
    },
  },
  {
    slugCanonique: 'toundra',
    nom: 'Toundra arctique',
    plateau: 5,
    aliases: ['toundra-hiver', 'toundra_hiver', 'toundra-ete', 'toundra_ete'],
    saison: { ete: 'ete', hiver: 'hiver' },
    assets: {
      board: 'plateau-5_toundra-arctique',
      biome: 'biome-realiste_toundra-ete',
      realiste: 'biome-realiste_toundra-ete',
      biocenose: 'biocenose_toundra-ete_legendee',
    },
  },
  {
    slugCanonique: 'desert_froid',
    nom: 'Désert froid',
    plateau: 5,
    aliases: ['desert-froid'],
    assets: {
      board: 'plateau-4_taiga-desert_froid',
      biome: 'biome-realiste_desert-froid',
      realiste: 'biome-realiste_desert-froid',
      biocenose: 'biocenose_desert-froid',
    },
  },
];

const ALIAS_INDEX = new Map();
for (const biome of GL_BIOME_REGISTRY) {
  ALIAS_INDEX.set(biome.slugCanonique, biome);
  for (const alias of biome.aliases) {
    ALIAS_INDEX.set(normalizeBiomeSlugKey(alias), biome);
  }
}

function normalizeBiomeSlugKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/-/g, '_');
}

function resolveBiome(anySlug) {
  const key = normalizeBiomeSlugKey(anySlug);
  if (!key) return null;
  return ALIAS_INDEX.get(key) || null;
}

function resolveToundraAssetSlug(kind, saison) {
  const s = saison === 'hiver' ? 'hiver' : 'ete';
  if (kind === 'biocenose') return `biocenose_toundra-${s}_legendee`;
  if (kind === 'realiste' || kind === 'biome') return `biome-realiste_toundra-${s}`;
  return null;
}

function biomeAssetSlug(biomeOrSlug, kind = 'biome', saison = null) {
  const biome = typeof biomeOrSlug === 'string' ? resolveBiome(biomeOrSlug) : biomeOrSlug;
  if (!biome?.assets) return null;
  if (
    biome.slugCanonique === 'toundra' &&
    (kind === 'biome' || kind === 'realiste' || kind === 'biocenose')
  ) {
    return resolveToundraAssetSlug(kind, saison);
  }
  const slug = biome.assets[kind];
  return slug || null;
}

function listCanonicalBiomeSlugs() {
  return GL_BIOME_REGISTRY.map((row) => row.slugCanonique);
}

const LORE_BIOME_SLUG_ALIASES = new Map([
  ['jungle', 'jungle_afc'],
  ['caduc', 'foret_caducifoliee'],
  ['toundra-hiver', 'toundra'],
  ['toundra_hiver', 'toundra'],
  ['toundra-ete', 'toundra'],
  ['toundra_ete', 'toundra'],
]);

function normalizeLoreBiomeSlug(value) {
  const key = normalizeBiomeSlugKey(value);
  if (!key) return null;
  if (LORE_BIOME_SLUG_ALIASES.has(key)) {
    return LORE_BIOME_SLUG_ALIASES.get(key);
  }
  const resolved = resolveBiome(key);
  return resolved?.slugCanonique || key;
}

module.exports = {
  GL_BIOME_REGISTRY,
  normalizeBiomeSlugKey,
  resolveBiome,
  biomeAssetSlug,
  listCanonicalBiomeSlugs,
  LORE_BIOME_SLUG_ALIASES,
  normalizeLoreBiomeSlug,
};
