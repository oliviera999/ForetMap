ALTER TABLE tasks
  ADD COLUMN completion_mode VARCHAR(32) NOT NULL DEFAULT 'single_done';

ALTER TABLE task_assignments
  ADD COLUMN done_at VARCHAR(32) DEFAULT NULL;
