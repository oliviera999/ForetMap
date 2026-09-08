-- Métadonnées taxonomiques additives (aucun ENUM, aucun changement de PK).
-- NULL = non renseigné. Valeurs attendues pour taxon_rank : species|genus|family|clade.

ALTER TABLE gl_species
  ADD COLUMN IF NOT EXISTS taxon_rank VARCHAR(16) DEFAULT NULL AFTER nom_scientifique;
ALTER TABLE gl_species
  ADD COLUMN IF NOT EXISTS taxon_source VARCHAR(120) DEFAULT NULL AFTER taxon_rank;
ALTER TABLE gl_species
  ADD COLUMN IF NOT EXISTS taxon_source_url VARCHAR(1024) DEFAULT NULL AFTER taxon_source;

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS taxon_rank VARCHAR(16) DEFAULT NULL AFTER scientific_name;

UPDATE gl_species
   SET taxon_rank = 'genus'
 WHERE species_code IN ('SP0015', 'SP0045', 'SP0221', 'SP0227')
   AND (taxon_rank IS NULL OR taxon_rank = '');
