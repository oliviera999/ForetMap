-- Snapshot zones/repères au moment de la validation (tâches récurrentes) pour le job de duplication (voir lib/recurringTasks.js).
ALTER TABLE tasks ADD COLUMN recurrence_template_zone_ids TEXT DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN recurrence_template_marker_ids TEXT DEFAULT NULL;
