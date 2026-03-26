-- Réglages applicatifs + enrichissement des cartes pour console admin
ALTER TABLE maps ADD COLUMN frame_padding_px INT UNSIGNED DEFAULT NULL;
ALTER TABLE maps ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(191) NOT NULL PRIMARY KEY,
  scope ENUM('public','teacher','admin') NOT NULL DEFAULT 'public',
  value_json LONGTEXT NOT NULL,
  updated_by_user_type VARCHAR(32) DEFAULT NULL,
  updated_by_user_id VARCHAR(64) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE schema_version SET version = 30;
