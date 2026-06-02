-- Progression joueur GL : espèces étudiées, termes de glossaire appris, tutoriels lus (confirmation explicite)

CREATE TABLE IF NOT EXISTS gl_learning_acknowledgements (
  reader_user_type VARCHAR(40) NOT NULL,
  reader_user_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_code VARCHAR(64) NOT NULL,
  acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reader_user_type, reader_user_id, target_type, target_code),
  INDEX idx_gla_target (target_type, target_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gl_learning_acknowledgements (
  reader_user_type, reader_user_id, target_type, target_code, acknowledged_at
)
SELECT reader_user_type, reader_user_id, 'tutorial', CAST(tutorial_id AS CHAR), read_at
  FROM gl_tutorial_reads;

DROP TABLE IF EXISTS gl_tutorial_reads;
