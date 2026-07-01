-- Backfill déterministe : les feuillets « copiste » `cop-bio-<biome>` encodent leur biome
-- dans leur code mais avaient `biome_slug` vide → hors de tout canal d'acquisition (orphelins).
-- On renseigne `biome_slug` d'après le suffixe du code pour les rendre atteignables via le pool
-- du chapitre (biome). Idempotent : n'écrase pas un biome déjà posé (WHERE biome_slug IS NULL),
-- et no-op si le feuillet n'existe pas (environnements sans corpus importé, ex. BDD de test).
-- Cf. docs/AUDIT_FEUILLETS_ACCES.md §11.6.

UPDATE gl_lore_feuillets SET biome_slug = 'savane'                WHERE feuillet_code = 'cop-bio-savane'  AND biome_slug IS NULL;
UPDATE gl_lore_feuillets SET biome_slug = 'sahara'                WHERE feuillet_code = 'cop-bio-sahara'  AND biome_slug IS NULL;
UPDATE gl_lore_feuillets SET biome_slug = 'foret_mediterraneenne' WHERE feuillet_code = 'cop-bio-medit'   AND biome_slug IS NULL;
UPDATE gl_lore_feuillets SET biome_slug = 'foret_caducifoliee'    WHERE feuillet_code = 'cop-bio-caduc'   AND biome_slug IS NULL;
UPDATE gl_lore_feuillets SET biome_slug = 'landes'                WHERE feuillet_code = 'cop-bio-landes'  AND biome_slug IS NULL;
UPDATE gl_lore_feuillets SET biome_slug = 'taiga'                 WHERE feuillet_code = 'cop-bio-taiga'   AND biome_slug IS NULL;
UPDATE gl_lore_feuillets SET biome_slug = 'toundra'               WHERE feuillet_code = 'cop-bio-toundra' AND biome_slug IS NULL;
UPDATE gl_lore_feuillets SET biome_slug = 'desert_froid'          WHERE feuillet_code = 'cop-bio-dfroid'  AND biome_slug IS NULL;
