-- Séances pédagogiques : preuve légère (démarrée / terminée) par utilisateur connecté.
-- Une ligne par couple (séance, utilisateur) ; compteurs cumulés pour rejouer / ludification.
-- Idempotent.

CREATE TABLE IF NOT EXISTS pedago_session_runs (
  session_id CHAR(36) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  first_started_at DATETIME DEFAULT NULL,
  last_started_at DATETIME DEFAULT NULL,
  start_count INT UNSIGNED NOT NULL DEFAULT 0,
  first_completed_at DATETIME DEFAULT NULL,
  last_completed_at DATETIME DEFAULT NULL,
  completion_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, user_id),
  INDEX idx_pedago_session_runs_user (user_id),
  CONSTRAINT fk_pedago_session_runs_session FOREIGN KEY (session_id)
    REFERENCES pedago_sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pedago_session_runs_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
