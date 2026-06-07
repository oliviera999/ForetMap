/**
 * Registre canonique des biomes G&L — source unique slugs + assets conventionnels.
 */

export const GL_BIOME_REGISTRY = [
  {
    slugCanonique: 'sahara',
    nom: 'Désert chaud (Sahara)',
    plateau: 1,
    aliases: ['desert_chaud'],
    assets: { board: 'plateau-1_fond', biome: 'biome_sahara', realiste: 'biome-realiste_sahara', biocenose: 'biocenose_sahara' },
  },
  {
    slugCanonique: 'jungle_afc',
    nom: 'Jungle d\'Afrique centrale',
    plateau: 1,
    aliases: ['jungle', 'jungle-afc'],
    assets: { board: 'plateau-1_fond', biome: 'biome_jungle_afc', realiste: 'biome-realiste_jungle_afc', biocenose: 'biocenose_jungle_afc' },
  },
  {
    slugCanonique: 'mangrove',
    nom: 'Mangrove',
    plateau: 1,
    aliases: [],
    assets: { board: 'plateau-1_fond', biome: 'biome_mangrove', realiste: 'biome-realiste_mangrove', biocenose: 'biocenose_mangrove' },
  },
  {
    slugCanonique: 'savane',
    nom: 'Savane tropicale',
    plateau: 2,
    aliases: [],
    assets: { board: 'plateau-2_fond', biome: 'biome_savane', realiste: 'biome-realiste_savane', biocenose: 'biocenose_savane' },
  },
  {
    slugCanonique: 'foret_mediterraneenne',
    nom: 'Forêt méditerranéenne',
    plateau: 2,
    aliases: ['foret-mediterraneenne'],
    assets: { board: 'plateau-2_fond', biome: 'biome_foret_mediterraneenne', realiste: 'biome-realiste_foret_mediterraneenne', biocenose: 'biocenose_foret_mediterraneenne' },
  },
  {
    slugCanonique: 'landes',
    nom: 'Landes atlantiques',
    plateau: 3,
    aliases: [],
    assets: { board: 'plateau-3_fond', biome: 'biome_landes', realiste: 'biome-realiste_landes', biocenose: 'biocenose_landes' },
  },
  {
    slugCanonique: 'foret_caducifoliee',
    nom: 'Forêt caducifoliée tempérée',
    plateau: 4,
    aliases: ['caduc', 'foret-caducifoliee', 'foret_caducifoliee'],
    assets: { board: 'plateau-4_fond', biome: 'biome_foret_caducifoliee', realiste: 'biome-realiste_foret_caducifoliee', biocenose: 'biocenose_foret_caducifoliee' },
  },
  {
    slugCanonique: 'prairie_steppe',
    nom: 'Prairie tempérée / Steppe',
    plateau: 4,
    aliases: ['prairie-steppe'],
    assets: { board: 'plateau-4_fond', biome: 'biome_prairie_steppe', realiste: 'biome-realiste_prairie_steppe', biocenose: 'biocenose_prairie_steppe' },
  },
  {
    slugCanonique: 'taiga',
    nom: 'Taïga (forêt boréale)',
    plateau: 5,
    aliases: [],
    assets: { board: 'plateau-5_fond', biome: 'biome_taiga', realiste: 'biome-realiste_taiga', biocenose: 'biocenose_taiga' },
  },
  {
    slugCanonique: 'toundra',
    nom: 'Toundra arctique',
    plateau: 5,
    aliases: ['toundra-hiver', 'toundra_hiver', 'toundra-ete', 'toundra_ete'],
    saison: { ete: 'ete', hiver: 'hiver' },
    assets: { board: 'plateau-5_fond', biome: 'biome_toundra', realiste: 'biome-realiste_toundra', biocenose: 'biocenose_toundra' },
  },
  {
    slugCanonique: 'desert_froid',
    nom: 'Désert froid',
    plateau: 5,
    aliases: ['desert-froid'],
    assets: { board: 'plateau-5_fond', biome: 'biome_desert_froid', realiste: 'biome-realiste_desert_froid', biocenose: 'biocenose_desert_froid' },
  },
];

export function normalizeBiomeSlugKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/-/g, '_');
}

const ALIAS_INDEX = new Map();
for (const biome of GL_BIOME_REGISTRY) {
  ALIAS_INDEX.set(biome.slugCanonique, biome);
  for (const alias of biome.aliases) {
    ALIAS_INDEX.set(normalizeBiomeSlugKey(alias), biome);
  }
}

export function resolveBiome(anySlug) {
  const key = normalizeBiomeSlugKey(anySlug);
  if (!key) return null;
  return ALIAS_INDEX.get(key) || null;
}

export function biomeAssetSlug(biomeOrSlug, kind = 'biome', saison = null) {
  const biome = typeof biomeOrSlug === 'string' ? resolveBiome(biomeOrSlug) : biomeOrSlug;
  if (!biome?.assets) return null;
  let slug = biome.assets[kind] || null;
  if (!slug) return null;
  if (biome.slugCanonique === 'toundra' && saison && (kind === 'biome' || kind === 'realiste' || kind === 'biocenose')) {
    slug = `${slug}_${saison}`;
  }
  return slug;
}

export function listCanonicalBiomeSlugs() {
  return GL_BIOME_REGISTRY.map((row) => row.slugCanonique);
}
