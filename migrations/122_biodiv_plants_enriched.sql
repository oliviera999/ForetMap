-- Biodiversité enrichie : colonnes normalisées sur plants (expand, idempotent)

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS taxon_kingdom varchar(64) DEFAULT NULL COMMENT 'Règne (vernaculaire pédagogique)',
  ADD COLUMN IF NOT EXISTS taxon_group varchar(96) DEFAULT NULL COMMENT 'Grand groupe',
  ADD COLUMN IF NOT EXISTS taxon_family varchar(96) DEFAULT NULL COMMENT 'Famille',
  ADD COLUMN IF NOT EXISTS taxon_genus varchar(96) DEFAULT NULL COMMENT 'Genre',
  ADD COLUMN IF NOT EXISTS gbif_key int unsigned DEFAULT NULL COMMENT 'Identifiant taxon GBIF',
  ADD COLUMN IF NOT EXISTS habitat_type enum('terrestre','aquatique','les_deux') DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trophic_role enum('producteur','consommateur','decomposeur') DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_ornamental tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS life_cycle enum('annuelle','bisannuelle','vivace','variable') DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS temp_min_c smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS temp_max_c smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ph_min decimal(3,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ph_max decimal(3,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_edible tinyint(1) DEFAULT NULL;
