-- Projets de tâches (V1): regroupement de tâches par carte
CREATE TABLE IF NOT EXISTS task_projects (
  id VARCHAR(64) PRIMARY KEY,
  map_id VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  created_at VARCHAR(32) DEFAULT NULL,
  INDEX idx_task_projects_map_id (map_id),
  INDEX idx_task_projects_title (title),
  CONSTRAINT fk_task_projects_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tasks
  ADD COLUMN project_id VARCHAR(64) DEFAULT NULL;

ALTER TABLE tasks
  ADD INDEX idx_tasks_project_id (project_id);

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES task_projects(id) ON DELETE SET NULL;

UPDATE schema_version SET version = 26;
