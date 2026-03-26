CREATE TABLE IF NOT EXISTS collective_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  context_type VARCHAR(16) NOT NULL,
  context_id VARCHAR(64) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_user_type VARCHAR(16) DEFAULT NULL,
  updated_by_user_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_collective_sessions_context (context_type, context_id),
  INDEX idx_collective_sessions_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collective_session_absences (
  session_id BIGINT UNSIGNED NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  marked_by_user_type VARCHAR(16) DEFAULT NULL,
  marked_by_user_id VARCHAR(64) DEFAULT NULL,
  marked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, student_id),
  INDEX idx_collective_absences_student (student_id),
  CONSTRAINT fk_collective_absences_session FOREIGN KEY (session_id) REFERENCES collective_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_collective_absences_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
