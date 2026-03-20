-- Tâches récurrentes : champs de récurrence sur la table tasks
ALTER TABLE tasks ADD COLUMN recurrence VARCHAR(32) DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN recurrence_end VARCHAR(32) DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN parent_task_id VARCHAR(64) DEFAULT NULL;

UPDATE schema_version SET version = 5;
