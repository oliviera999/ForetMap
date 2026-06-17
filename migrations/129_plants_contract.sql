-- Contract biodiversité : retrait colonnes legacy plants (Lot 7)
-- Rollback : réimport sql/foretmap_bdd_complete.sql ou restaurer dump pré-migration.

ALTER TABLE plants DROP COLUMN group_1;
ALTER TABLE plants DROP COLUMN group_2;
ALTER TABLE plants DROP COLUMN group_3;
ALTER TABLE plants DROP COLUMN group_4;
ALTER TABLE plants DROP COLUMN optimal_ph;
ALTER TABLE plants DROP COLUMN ideal_temperature_c;
ALTER TABLE plants DROP COLUMN agroecosystem_category;
ALTER TABLE plants DROP COLUMN longevity;
