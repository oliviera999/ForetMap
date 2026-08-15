-- Contract biodiversité : retrait colonne JSON living_beings (lecture junction uniquement)
-- Rollback : restaurer un dump pré-migration (scripts/db-backup.sh). Les exports SQL complets
-- ne sont pas versionnés (données personnelles) — voir .gitignore.

ALTER TABLE zones DROP COLUMN living_beings;
ALTER TABLE map_markers DROP COLUMN living_beings;
ALTER TABLE tasks DROP COLUMN living_beings;
