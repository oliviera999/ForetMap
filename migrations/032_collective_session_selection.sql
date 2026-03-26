CREATE TABLE IF NOT EXISTS collective_session_tasks (
  session_id BIGINT UNSIGNED NOT NULL,
  task_id VARCHAR(64) NOT NULL,
  added_by_user_type VARCHAR(16) DEFAULT NULL,
  added_by_user_id VARCHAR(64) DEFAULT NULL,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, task_id),
  INDEX idx_collective_session_tasks_task (task_id),
  CONSTRAINT fk_collective_session_tasks_session FOREIGN KEY (session_id) REFERENCES collective_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_collective_session_tasks_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collective_session_students (
  session_id BIGINT UNSIGNED NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  added_by_user_type VARCHAR(16) DEFAULT NULL,
  added_by_user_id VARCHAR(64) DEFAULT NULL,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, student_id),
  INDEX idx_collective_session_students_student (student_id),
  CONSTRAINT fk_collective_session_students_session FOREIGN KEY (session_id) REFERENCES collective_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_collective_session_students_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
