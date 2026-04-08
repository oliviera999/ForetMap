-- Degré d'importance des tâches (optionnel ; NULL = non renseigné).
ALTER TABLE tasks ADD COLUMN importance_level VARCHAR(32) NULL DEFAULT NULL;
