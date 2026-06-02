-- Points de vie et points de pouvoir persistants par joueur (inter-parties)

SET @has_health_points := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND COLUMN_NAME = 'health_points'
);

SET @sql_health := IF(
  @has_health_points = 0,
  'ALTER TABLE gl_players ADD COLUMN health_points INT UNSIGNED NOT NULL DEFAULT 3 AFTER is_active',
  'SELECT 1'
);
PREPARE stmt_health FROM @sql_health;
EXECUTE stmt_health;
DEALLOCATE PREPARE stmt_health;

SET @has_power_points := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND COLUMN_NAME = 'power_points'
);

SET @sql_power := IF(
  @has_power_points = 0,
  'ALTER TABLE gl_players ADD COLUMN power_points INT UNSIGNED NOT NULL DEFAULT 3 AFTER health_points',
  'SELECT 1'
);
PREPARE stmt_power FROM @sql_power;
EXECUTE stmt_power;
DEALLOCATE PREPARE stmt_power;

INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at)
VALUES
  ('gameplay.vitality_enabled', 'false', NULL, NOW()),
  ('gameplay.default_health_points', '3', NULL, NOW()),
  ('gameplay.default_power_points', '3', NULL, NOW())
ON DUPLICATE KEY UPDATE
  updated_at = updated_at;
