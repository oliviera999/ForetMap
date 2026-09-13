-- Carnet utilisateur ForetMap (parité « Mon journal » GL).
-- Articles markdown + assets + imports de ressources apprises.
-- La copie des observation_logs est faite au démarrage (lib/fmUserJournal.migrateObservationLogs).

CREATE TABLE IF NOT EXISTS user_journal_articles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) DEFAULT NULL,
  body_markdown MEDIUMTEXT NOT NULL,
  zone_id VARCHAR(64) DEFAULT NULL,
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_uja_user_created (user_id, created_at),
  INDEX idx_uja_user_pinned (user_id, pinned),
  CONSTRAINT fk_uja_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uja_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_journal_article_assets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  article_id INT UNSIGNED NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  asset_path VARCHAR(512) NOT NULL,
  mime_type VARCHAR(64) DEFAULT NULL,
  byte_size INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ujaa_article (article_id),
  INDEX idx_ujaa_user (user_id),
  CONSTRAINT fk_ujaa_article FOREIGN KEY (article_id) REFERENCES user_journal_articles(id) ON DELETE CASCADE,
  CONSTRAINT fk_ujaa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_journal_imports (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  resource_type VARCHAR(32) NOT NULL,
  resource_ref VARCHAR(64) NOT NULL,
  title VARCHAR(255) DEFAULT NULL,
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_uji_resource (user_id, resource_type, resource_ref),
  INDEX idx_uji_user_created (user_id, created_at),
  INDEX idx_uji_user_pinned (user_id, pinned),
  CONSTRAINT fk_uji_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Traçabilité de migration observation → article (évite les doublons au re-run).
CREATE TABLE IF NOT EXISTS user_journal_observation_map (
  observation_id INT UNSIGNED NOT NULL PRIMARY KEY,
  article_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ujom_article FOREIGN KEY (article_id) REFERENCES user_journal_articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO settings (`key`, value, updated_at)
VALUES ('observations.journal_max_chars', '0', NOW())
ON DUPLICATE KEY UPDATE `key` = `key`;

INSERT INTO settings (`key`, value, updated_at)
VALUES ('observations.journal_max_assets', '0', NOW())
ON DUPLICATE KEY UPDATE `key` = `key`;
