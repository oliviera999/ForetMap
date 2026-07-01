'use strict';

/**
 * Correspondance biome → « pays » du voyage (1–5, ordre équateur→pôle), alignée sur
 * les 5 plateaux/chapitres. Module **pur** (aucune I/O) pour être réutilisable et testable
 * sans base : partagé par la révélation par espèce et le pool de feuillets d'un chapitre.
 */

const BIOME_TO_PAYS = Object.freeze({
  jungle_afc: 1,
  savane: 1,
  sahara: 2,
  foret_mediterraneenne: 2,
  foret_caducifoliee: 3,
  landes: 3,
  taiga: 4,
  desert_froid: 4,
  toundra: 5,
});

function biomeToPays(biomeSlug) {
  const slug = String(biomeSlug || '')
    .trim()
    .toLowerCase();
  if (!slug) return null;
  return BIOME_TO_PAYS[slug] ?? null;
}

module.exports = { BIOME_TO_PAYS, biomeToPays };
