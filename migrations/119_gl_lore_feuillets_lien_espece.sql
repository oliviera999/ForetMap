-- Feuillets Sélène : liaisons espèce / pays pour révélation par étude d'espèces.

SET @glLoreFeuilletsHasLienCanal = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_lore_feuillets'
     AND COLUMN_NAME = 'lien_canal'
);

SET @sql = IF(
  @glLoreFeuilletsHasLienCanal = 0,
  'ALTER TABLE gl_lore_feuillets
     ADD COLUMN lien_canal VARCHAR(16) DEFAULT NULL AFTER lien_qcm_biome,
     ADD COLUMN lien_ref VARCHAR(120) DEFAULT NULL AFTER lien_canal,
     ADD COLUMN lien_pays TINYINT UNSIGNED DEFAULT NULL AFTER lien_ref,
     ADD COLUMN lien_ordre_recit INT DEFAULT NULL AFTER lien_pays,
     ADD COLUMN lien_note VARCHAR(255) DEFAULT NULL AFTER lien_ordre_recit',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @glFeuiLienIndexExists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_lore_feuillets'
     AND INDEX_NAME = 'idx_gl_feui_lien'
);

SET @sql = IF(
  @glFeuiLienIndexExists = 0,
  'ALTER TABLE gl_lore_feuillets ADD INDEX idx_gl_feui_lien (lien_canal, lien_pays, lien_ordre_recit)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Étend unlocked_via pour tracer les révélations via étude d'espèce.
ALTER TABLE gl_game_feuillet_states
  MODIFY COLUMN unlocked_via ENUM('zone', 'manual', 'story', 'gemme', 'espece') DEFAULT NULL;
