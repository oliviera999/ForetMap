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

CREATE INDEX idx_tasks_archived_at ON tasks (archived_at);
CREATE INDEX idx_task_projects_archived_at ON task_projects (archived_at);
