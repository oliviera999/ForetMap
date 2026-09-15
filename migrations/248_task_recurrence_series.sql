-- Séries de récurrence : identifiant partagé + anti-doublon (series_id, due_date).
-- Voir lib/recurringTasks.js. Idempotent (ADD COLUMN IF NOT EXISTS / index guard via runner).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_series_id VARCHAR(64) NULL DEFAULT NULL
  AFTER parent_task_id;

-- Backfill : chaque tâche récurrente sans série reçoit un UUID ; les clones héritent
-- de la racine de la chaîne parent_task_id (boucle applicative impossible en SQL pur
-- portable — on pose d'abord un id par ligne, puis on aligne les enfants sur le parent
-- en plusieurs passes).

UPDATE tasks
   SET recurrence_series_id = UUID()
 WHERE recurrence IN ('weekly', 'biweekly', 'monthly')
   AND (recurrence_series_id IS NULL OR TRIM(recurrence_series_id) = '');

-- Aligner les clones sur le parent (jusqu'à 8 niveaux de profondeur).
UPDATE tasks c
  INNER JOIN tasks p ON p.id = c.parent_task_id
   SET c.recurrence_series_id = p.recurrence_series_id
 WHERE c.parent_task_id IS NOT NULL
   AND p.recurrence_series_id IS NOT NULL
   AND (c.recurrence_series_id IS NULL OR c.recurrence_series_id <> p.recurrence_series_id);

UPDATE tasks c
  INNER JOIN tasks p ON p.id = c.parent_task_id
   SET c.recurrence_series_id = p.recurrence_series_id
 WHERE c.parent_task_id IS NOT NULL
   AND p.recurrence_series_id IS NOT NULL
   AND (c.recurrence_series_id IS NULL OR c.recurrence_series_id <> p.recurrence_series_id);

UPDATE tasks c
  INNER JOIN tasks p ON p.id = c.parent_task_id
   SET c.recurrence_series_id = p.recurrence_series_id
 WHERE c.parent_task_id IS NOT NULL
   AND p.recurrence_series_id IS NOT NULL
   AND (c.recurrence_series_id IS NULL OR c.recurrence_series_id <> p.recurrence_series_id);

UPDATE tasks c
  INNER JOIN tasks p ON p.id = c.parent_task_id
   SET c.recurrence_series_id = p.recurrence_series_id
 WHERE c.parent_task_id IS NOT NULL
   AND p.recurrence_series_id IS NOT NULL
   AND (c.recurrence_series_id IS NULL OR c.recurrence_series_id <> p.recurrence_series_id);

CREATE INDEX idx_tasks_recurrence_series_id ON tasks (recurrence_series_id);

-- Anti-doublon : une seule tâche par (série, échéance). Les NULL series_id
-- ne collisionnent pas entre elles (comportement MySQL/MariaDB).
CREATE UNIQUE INDEX uq_tasks_series_due ON tasks (recurrence_series_id, due_date);
