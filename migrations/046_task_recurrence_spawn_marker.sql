-- Marqueur d idempotence : derniere due_date source pour laquelle un clone recurrent a ete cree (voir lib/recurringTasks.js).
ALTER TABLE tasks ADD COLUMN recurrence_spawned_for_due_date VARCHAR(32) DEFAULT NULL;
CREATE INDEX idx_tasks_recurrence_spawn ON tasks (recurrence_spawned_for_due_date);
