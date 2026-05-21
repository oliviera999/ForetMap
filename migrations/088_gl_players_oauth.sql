-- Connexion Google joueurs Gnomes & Licornes (email direct ou via lien ForetMap).

SET @glPlayersHasEmail = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND COLUMN_NAME = 'email'
);

SET @sql = IF(
  @glPlayersHasEmail = 0,
  'ALTER TABLE gl_players ADD COLUMN email VARCHAR(255) DEFAULT NULL AFTER last_name',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @glPlayersHasGoogleSub = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND COLUMN_NAME = 'google_sub'
);

SET @sql = IF(
  @glPlayersHasGoogleSub = 0,
  'ALTER TABLE gl_players ADD COLUMN google_sub VARCHAR(255) DEFAULT NULL AFTER email',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @glPlayersHasEmailIndex = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND INDEX_NAME = 'uq_gl_players_email'
);

SET @sql = IF(
  @glPlayersHasEmailIndex = 0,
  'CREATE UNIQUE INDEX uq_gl_players_email ON gl_players (email)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
