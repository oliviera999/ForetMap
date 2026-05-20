-- Auth joueurs Gnomes & Licornes : passage du PIN à un mot de passe (alignement ForetMap).
-- Idempotente : peut être rejouée sans effet de bord (errno 1060 / colonne déjà ajoutée ignoré ;
-- rename pin_hash → password_hash protégé par INFORMATION_SCHEMA ; reset forcé appliqué une seule fois).

-- Mémorise l'absence préalable de password_must_reset : la première application doit marquer
-- TOUS les joueurs déjà créés pour réinitialisation (ils n'ont qu'un ancien PIN).
SET @glPlayersHadMustReset = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND COLUMN_NAME = 'password_must_reset'
);

ALTER TABLE gl_players
  ADD COLUMN first_name VARCHAR(120) NOT NULL DEFAULT '' AFTER team_id;

ALTER TABLE gl_players
  ADD COLUMN last_name VARCHAR(120) NOT NULL DEFAULT '' AFTER first_name;

ALTER TABLE gl_players
  ADD COLUMN password_must_reset TINYINT(1) NOT NULL DEFAULT 0 AFTER pseudo;

-- Renomme pin_hash → password_hash si encore présent (cross MySQL 5.7 / 8.x via CHANGE COLUMN).
SET @glPlayersHasPinHash = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_players'
     AND COLUMN_NAME = 'pin_hash'
);
SET @sql = IF(
  @glPlayersHasPinHash > 0,
  'ALTER TABLE gl_players CHANGE COLUMN pin_hash password_hash VARCHAR(255) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Force la réinitialisation des comptes existants UNIQUEMENT lors de la première application
-- (le drapeau @glPlayersHadMustReset valait 0 avant l'ajout de la colonne).
SET @sql = IF(
  @glPlayersHadMustReset = 0,
  'UPDATE gl_players SET password_must_reset = 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
