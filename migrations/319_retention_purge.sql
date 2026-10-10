-- =====================================================================
-- Durées de conservation et purge planifiée (scripts/retention-purge.js).
--
-- 1. `users.deactivated_at` — date de la DÉSACTIVATION du compte (synchronisation Moodle,
--    administrateur). C'est la date de départ constatée : la purge planifiée supprime un
--    compte élève ou personnel désactivé depuis plus de 12 mois. La colonne est posée à
--    chaque passage actif → inactif (lib/accounts/deactivation.js) et effacée à la
--    réactivation ; la purge rattrape toute désactivation non datée.
--
--    Rattrapage des comptes déjà désactivés : `updated_at`. Chaque désactivation écrit
--    `updated_at = NOW()` et la colonne ne fait que croître ensuite : elle est donc
--    POSTÉRIEURE OU ÉGALE à la vraie date de désactivation. Compter le délai depuis elle ne
--    peut que retarder une suppression, jamais l'avancer.
--
-- 2. `retention_purge_runs` — journal de purge : une ligne par exécution (simulation ou
--    réelle), avec les comptages par catégorie, la durée et l'issue. Aucune donnée de
--    personne : des comptages seulement. Conservé sans limite (preuve que la purge tourne).
--
-- Idempotente : colonnes et index gardés par INFORMATION_SCHEMA, CREATE TABLE IF NOT EXISTS,
-- rattrapage limité aux lignes encore sans date.
-- =====================================================================

SET @usersHasDeactivatedAt = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'deactivated_at'
);
SET @sql = IF(
  @usersHasDeactivatedAt = 0,
  'ALTER TABLE users ADD COLUMN deactivated_at DATETIME NULL DEFAULT NULL COMMENT ''Date de désactivation du compte (départ constaté, purge planifiée)'' AFTER is_active',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @usersHasDeactivatedIdx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
     AND INDEX_NAME = 'idx_users_type_deactivated'
);
SET @sql = IF(
  @usersHasDeactivatedIdx = 0,
  'ALTER TABLE users ADD INDEX idx_users_type_deactivated (user_type, is_active, deactivated_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- `updated_at = updated_at` : sans lui, ON UPDATE CURRENT_TIMESTAMP réécrirait la date de
-- dernière modification de chaque compte rattrapé.
UPDATE users
   SET deactivated_at = updated_at, updated_at = updated_at
 WHERE is_active = 0 AND deactivated_at IS NULL;

CREATE TABLE IF NOT EXISTS retention_purge_runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) DEFAULT NULL,
  mode ENUM('simulation','apply') NOT NULL,
  outcome ENUM('running','success','blocked','failure','interrupted') NOT NULL DEFAULT 'running',
  duration_ms INT UNSIGNED DEFAULT NULL,
  -- Comptages par catégorie (journaux, adresses IP, comptes…) : jamais de nom ni d'identifiant.
  counts_json JSON DEFAULT NULL,
  -- Durées appliquées pendant l'exécution (jours, mois), pour relire un rapport ancien.
  options_json JSON DEFAULT NULL,
  -- Message d'erreur nettoyé (adresses e-mail, IP et identifiants masqués).
  error_message VARCHAR(500) DEFAULT NULL,
  INDEX idx_retention_purge_runs_started (started_at),
  INDEX idx_retention_purge_runs_outcome (outcome, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
