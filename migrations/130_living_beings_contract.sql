-- Contract biodiversité : retrait colonne JSON living_beings (lecture junction uniquement)
-- Rollback : réimport sql/foretmap_bdd_complete.sql ou restaurer dump pré-migration.

ALTER TABLE zones DROP COLUMN living_beings;
ALTER TABLE map_markers DROP COLUMN living_beings;
ALTER TABLE tasks DROP COLUMN living_beings;
