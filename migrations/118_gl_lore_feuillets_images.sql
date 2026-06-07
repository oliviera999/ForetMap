-- Feuillets Sélène : illustrations de scène et coupes pédagogiques (pages-biome).
-- Table gl_lore_feuillets : InnoDB / utf8mb4 (hérités de la migration 117).

SET @glLoreFeuilletsHasImageUrl = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_lore_feuillets'
     AND COLUMN_NAME = 'image_url'
);

SET @sql = IF(
  @glLoreFeuilletsHasImageUrl = 0,
  'ALTER TABLE gl_lore_feuillets ADD COLUMN image_url VARCHAR(512) DEFAULT NULL AFTER texte',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @glLoreFeuilletsHasImageCoupeUrl = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_lore_feuillets'
     AND COLUMN_NAME = 'image_coupe_url'
);

SET @sql = IF(
  @glLoreFeuilletsHasImageCoupeUrl = 0,
  'ALTER TABLE gl_lore_feuillets ADD COLUMN image_coupe_url VARCHAR(512) DEFAULT NULL AFTER image_url',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
