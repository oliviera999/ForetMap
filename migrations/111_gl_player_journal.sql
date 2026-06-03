-- Carnet personnel joueur GL (markdown + illustrations)

CREATE TABLE IF NOT EXISTS gl_player_journals (
  player_id INT UNSIGNED NOT NULL,
  body_markdown MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id),
  CONSTRAINT fk_gl_player_journals_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gl_player_journal_assets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id INT UNSIGNED NOT NULL,
  asset_path VARCHAR(512) NOT NULL,
  mime_type VARCHAR(64) DEFAULT NULL,
  byte_size INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gl_player_journal_assets_player (player_id),
  CONSTRAINT fk_gl_player_journal_assets_player FOREIGN KEY (player_id) REFERENCES gl_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('modules.player_journal_enabled', 'true', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('gameplay.player_journal_max_chars', '20000', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES ('gameplay.player_journal_max_assets', '30', NULL, NOW())
ON DUPLICATE KEY UPDATE updated_at = updated_at;
