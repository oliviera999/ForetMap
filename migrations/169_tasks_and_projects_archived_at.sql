-- Archivage (soft-delete) des tâches et des projets de tâches.
-- Colonne horodatée nullable : NULL = actif, valeur = date d'archivage.
-- L'archivage masque l'entité des listes actives sans la supprimer (données conservées).
-- Idempotent : le runner de migration ignore l'errno 1060 (colonne déjà présente) et
-- 1061 (index déjà présent) — cf. MYSQL_MIGRATION_EXPECTED_ERRNO dans database.js.
ALTER TABLE tasks
  ADD COLUMN archived_at DATETIME NULL DEFAULT NULL AFTER status;

-- Marqueur : 1 si la tâche a été archivée PAR l'archivage de son projet (cascade).
-- Sert au désarchivage du projet à ne restaurer que ces tâches-là, sans dépendre d'un
-- matching par horodatage (fragile : deux archivages dans la même seconde entreraient en collision).
ALTER TABLE tasks
  ADD COLUMN archived_via_project TINYINT(1) NOT NULL DEFAULT 0 AFTER archived_at;

ALTER TABLE task_projects
  ADD COLUMN archived_at DATETIME NULL DEFAULT NULL AFTER status;

-- Horodatage de validation / fin, référence de délai pour l'archivage AUTOMATIQUE
-- (réglages tasks.auto_archive_enabled / tasks.auto_archive_after_days). Posé à la
-- validation ; NULL tant que non validé (le job d'archivage auto ignore alors la ligne).
ALTER TABLE tasks
  ADD COLUMN validated_at DATETIME NULL DEFAULT NULL AFTER archived_via_project;

ALTER TABLE task_projects
  ADD COLUMN finished_at DATETIME NULL DEFAULT NULL AFTER archived_at;

CREATE INDEX idx_tasks_archived_at ON tasks (archived_at);
CREATE INDEX idx_task_projects_archived_at ON task_projects (archived_at);
CREATE INDEX idx_tasks_validated_at ON tasks (validated_at);

-- Backfill : les éléments DÉJÀ terminés reçoivent la date de migration comme point de
-- départ du délai (pas d'archivage massif rétroactif au premier passage du job ; ils
-- deviendront éligibles après le délai à partir de maintenant).
UPDATE tasks SET validated_at = NOW() WHERE status = 'validated' AND validated_at IS NULL;
UPDATE task_projects SET finished_at = NOW() WHERE status = 'validated' AND finished_at IS NULL;
