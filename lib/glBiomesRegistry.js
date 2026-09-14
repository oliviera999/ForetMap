'use strict';

/**
 * Registre des biomes G&L côté serveur : le noyau (slugs, alias, assets) vient du miroir
 * généré `lib/shared/glBiomesRegistryCore.js` — même source que le client
 * (`src/shared/glBiomesRegistryCore.js`, audit du 13/09/2026, §4.1). Ne restent ici que les
 * alias propres au lore (ancien nommage des feuillets), sans équivalent côté client.
 */
const {
  GL_BIOME_REGISTRY,
  normalizeBiomeSlugKey,
  resolveBiome,
  biomeAssetSlug,
  listCanonicalBiomeSlugs,
} = require('./shared/glBiomesRegistryCore');

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
