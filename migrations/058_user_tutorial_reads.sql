-- Accusé de lecture des tutoriels (engagement utilisateur connecté)
CREATE TABLE IF NOT EXISTS user_tutorial_reads (
  user_id VARCHAR(64) NOT NULL,
  tutorial_id INT UNSIGNED NOT NULL,
  acknowledged_at VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, tutorial_id),
  INDEX idx_user_tutorial_reads_tutorial (tutorial_id),
  CONSTRAINT fk_user_tutorial_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_tutorial_reads_tutorial FOREIGN KEY (tutorial_id) REFERENCES tutorials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
