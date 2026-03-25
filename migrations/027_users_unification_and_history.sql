-- Unification progressive des identités + historique structuré

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  user_type VARCHAR(16) NOT NULL,
  legacy_user_id VARCHAR(64) DEFAULT NULL,
  email VARCHAR(255) DEFAULT NULL,
  pseudo VARCHAR(50) DEFAULT NULL,
  first_name VARCHAR(255) DEFAULT NULL,
  last_name VARCHAR(255) DEFAULT NULL,
  display_name VARCHAR(255) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  avatar_path VARCHAR(512) DEFAULT NULL,
  affiliation VARCHAR(16) DEFAULT 'both',
  password_hash VARCHAR(255) DEFAULT NULL,
  auth_provider VARCHAR(32) NOT NULL DEFAULT 'local',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_seen VARCHAR(32) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_type_legacy (user_type, legacy_user_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_pseudo (pseudo),
  INDEX idx_users_type_active (user_type, is_active),
  INDEX idx_users_display_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id VARCHAR(64) DEFAULT NULL,
  actor_user_type VARCHAR(16) DEFAULT NULL,
  action VARCHAR(96) NOT NULL,
  target_type VARCHAR(32) DEFAULT NULL,
  target_id VARCHAR(64) DEFAULT NULL,
  result VARCHAR(16) NOT NULL DEFAULT 'success',
  reason VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  payload_json JSON DEFAULT NULL,
  INDEX idx_security_events_occurred (occurred_at),
  INDEX idx_security_events_actor (actor_user_id, occurred_at),
  INDEX idx_security_events_action (action, occurred_at),
  INDEX idx_security_events_target (target_type, target_id, occurred_at),
  CONSTRAINT fk_security_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE task_assignments
  ADD COLUMN student_id VARCHAR(64) DEFAULT NULL;

ALTER TABLE task_assignments
  ADD INDEX idx_task_assignments_student_id (student_id);

ALTER TABLE task_assignments
  ADD CONSTRAINT fk_task_assignments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;

ALTER TABLE task_logs
  ADD COLUMN student_id VARCHAR(64) DEFAULT NULL;

ALTER TABLE task_logs
  ADD INDEX idx_task_logs_student_id (student_id);

ALTER TABLE task_logs
  ADD CONSTRAINT fk_task_logs_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;

ALTER TABLE audit_log
  ADD COLUMN actor_user_type VARCHAR(16) DEFAULT NULL;

ALTER TABLE audit_log
  ADD COLUMN actor_user_id VARCHAR(64) DEFAULT NULL;

ALTER TABLE audit_log
  ADD COLUMN result VARCHAR(16) NOT NULL DEFAULT 'success';

ALTER TABLE audit_log
  ADD COLUMN occurred_at DATETIME DEFAULT NULL;

ALTER TABLE audit_log
  ADD COLUMN payload_json JSON DEFAULT NULL;

ALTER TABLE audit_log
  ADD INDEX idx_audit_actor (actor_user_type, actor_user_id, id);

ALTER TABLE audit_log
  ADD INDEX idx_audit_action (action, id);

UPDATE audit_log
SET occurred_at = COALESCE(occurred_at, CURRENT_TIMESTAMP)
WHERE occurred_at IS NULL;

UPDATE schema_version SET version = 27;
