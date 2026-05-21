-- Profils GL : avatar/description + rattachement compte ForetMap pour staff.

SET @glPlayersHasAvatarPath = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND COLUMN_NAME = 'avatar_path'
);

SET @sql = IF(
  @glPlayersHasAvatarPath = 0,
  'ALTER TABLE gl_players ADD COLUMN avatar_path VARCHAR(512) DEFAULT NULL AFTER google_sub',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @glPlayersHasDescription = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND COLUMN_NAME = 'description'
);

SET @sql = IF(
  @glPlayersHasDescription = 0,
  'ALTER TABLE gl_players ADD COLUMN description VARCHAR(300) DEFAULT NULL AFTER avatar_path',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @glAdminsHasAvatarPath = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_admins'
     AND COLUMN_NAME = 'avatar_path'
);

SET @sql = IF(
  @glAdminsHasAvatarPath = 0,
  'ALTER TABLE gl_admins ADD COLUMN avatar_path VARCHAR(512) DEFAULT NULL AFTER google_sub',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @glAdminsHasDescription = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_admins'
     AND COLUMN_NAME = 'description'
);

SET @sql = IF(
  @glAdminsHasDescription = 0,
  'ALTER TABLE gl_admins ADD COLUMN description VARCHAR(300) DEFAULT NULL AFTER avatar_path',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @glAdminsHasForetmapUserId = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_admins'
     AND COLUMN_NAME = 'foretmap_user_id'
);

SET @sql = IF(
  @glAdminsHasForetmapUserId = 0,
  'ALTER TABLE gl_admins ADD COLUMN foretmap_user_id VARCHAR(64) DEFAULT NULL AFTER description',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
