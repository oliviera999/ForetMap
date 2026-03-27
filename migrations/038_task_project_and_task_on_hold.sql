ALTER TABLE task_projects
  ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active';
