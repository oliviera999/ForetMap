-- Ordre manuel des tâches (drag & drop côté n3boss/admin)
ALTER TABLE tasks ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER importance_level;
