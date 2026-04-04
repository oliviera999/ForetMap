-- Référents tâche (utilisateurs contact pour questions)
CREATE TABLE IF NOT EXISTS task_referents (
  task_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (task_id, user_id),
  INDEX idx_task_referents_user (user_id),
  CONSTRAINT fk_task_referents_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_referents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
