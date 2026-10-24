-- =====================================================================
-- Double authentification (TOTP) des comptes administrateur et n3boss.
--
-- `user_totp` : une ligne par compte enrôlé (ou en cours d'enrôlement).
--   * `secret_enc` / `secret_key_id` : secret actif, **chiffré** en AES-256-GCM par
--     `lib/auth/totpCrypto.js` avec la clé `TOTP_ENCRYPTION_KEY` (jamais en clair en base),
--     et identifiant de la clé qui l'a chiffré (rotation) ;
--   * `pending_*` : secret proposé à l'enrôlement, actif seulement après confirmation par un
--     premier code (l'ancien secret reste valable jusque-là lors d'un changement d'appareil) ;
--   * `last_used_step` : pas de temps du dernier code accepté (anti-rejeu) ;
--   * `failed_attempts` / `locked_until` : limiteur d'essais par compte, persistant.
-- `user_totp_backup_codes` : codes de secours à usage unique, **hachés** (bcrypt).
-- `v_user_totp_status` : statut sans aucune colonne secrète, lu par l'administration.
--
-- IDEMPOTENCE : `CREATE TABLE IF NOT EXISTS`, index et clés étrangères gardés par
-- INFORMATION_SCHEMA, vue recréée (`DROP VIEW IF EXISTS` puis `CREATE`). Aucune donnée
-- existante n'est réécrite.
-- Retour arrière : DROP VIEW v_user_totp_status; DROP TABLE user_totp_backup_codes;
-- DROP TABLE user_totp; (efface les enrôlements).
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_totp (
  user_id VARCHAR(64) NOT NULL PRIMARY KEY,
  secret_enc VARCHAR(255) DEFAULT NULL COMMENT 'Secret actif chiffré (AES-256-GCM, v1.iv.ct.tag)',
  secret_key_id VARCHAR(32) DEFAULT NULL COMMENT 'Identifiant de la clé de chiffrement',
  enabled_at DATETIME DEFAULT NULL COMMENT 'Activation confirmée par un premier code',
  pending_secret_enc VARCHAR(255) DEFAULT NULL COMMENT 'Secret proposé, en attente de confirmation',
  pending_key_id VARCHAR(32) DEFAULT NULL,
  pending_created_at DATETIME DEFAULT NULL,
  last_used_step BIGINT UNSIGNED DEFAULT NULL COMMENT 'Pas TOTP du dernier code accepté (anti-rejeu)',
  last_used_at DATETIME DEFAULT NULL,
  failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_totp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_totp_backup_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  code_hash VARCHAR(100) NOT NULL COMMENT 'Hachage bcrypt du code de secours',
  used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_totp_backup_codes_user (user_id, used_at),
  CONSTRAINT fk_user_totp_backup_codes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table préexistante sans son index ou ses clés étrangères (création interrompue, base
-- restaurée partiellement) : complétée, sinon rien.
SET @totpBackupIdx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_totp_backup_codes'
     AND INDEX_NAME = 'idx_user_totp_backup_codes_user'
);
SET @sql = IF(
  @totpBackupIdx = 0,
  'CREATE INDEX idx_user_totp_backup_codes_user ON user_totp_backup_codes (user_id, used_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @totpUserFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_totp'
     AND CONSTRAINT_NAME = 'fk_user_totp_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @totpUserFk = 0,
  'ALTER TABLE user_totp ADD CONSTRAINT fk_user_totp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @totpBackupFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_totp_backup_codes'
     AND CONSTRAINT_NAME = 'fk_user_totp_backup_codes_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @totpBackupFk = 0,
  'ALTER TABLE user_totp_backup_codes ADD CONSTRAINT fk_user_totp_backup_codes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Statut sans secret : `SQL SECURITY INVOKER`, sans `DEFINER`, noms non qualifiés.
DROP VIEW IF EXISTS v_user_totp_status;
CREATE SQL SECURITY INVOKER VIEW v_user_totp_status AS
  SELECT t.user_id,
         t.enabled_at,
         t.last_used_at,
         t.locked_until,
         t.pending_created_at,
         (SELECT COUNT(*) FROM user_totp_backup_codes c
           WHERE c.user_id = t.user_id AND c.used_at IS NULL) AS backup_codes_remaining
    FROM user_totp t;
