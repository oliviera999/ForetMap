ALTER TABLE tasks
  ADD COLUMN start_date VARCHAR(32) DEFAULT NULL;

ALTER TABLE tasks
  ADD INDEX idx_tasks_start_date (start_date);
