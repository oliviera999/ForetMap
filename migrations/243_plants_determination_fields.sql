-- Section « Détermination » des fiches espèces : aider à une identification rigoureuse.
--
-- Trois champs volontairement neutres vis-à-vis du règne : le catalogue mêle végétaux,
-- animaux, champignons, micro-organismes et fiches-ressources. On parle donc de
-- « caractères observables » et de « stade », jamais de feuille ou de fleur.
--
--   identification_criteria — ce qu'il faut regarder pour être sûr de l'espèce.
--   lookalike_species       — espèces ressemblantes et critère qui tranche. Affiché en
--                             encadré d'alerte : la forêt est comestible et les élèves
--                             récoltent, la confusion est l'information à ne pas manquer.
--   identification_period   — période et conditions où l'espèce est déterminable.
--
-- Un ALTER par colonne : errno 1060 (colonne déjà présente) est ignoré instruction par
-- instruction par database.js, donc un lot groupé perdrait les colonnes suivantes si la
-- première existait déjà.
ALTER TABLE plants
  ADD COLUMN identification_criteria TEXT DEFAULT NULL COMMENT 'Caractères observables qui permettent de trancher';
ALTER TABLE plants
  ADD COLUMN lookalike_species TEXT DEFAULT NULL COMMENT 'Espèces ressemblantes et critère de distinction';
ALTER TABLE plants
  ADD COLUMN identification_period VARCHAR(255) DEFAULT NULL COMMENT 'Période / conditions où la détermination est possible';
