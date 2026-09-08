-- Composition automatique des équipes GL (lot v3, docs/GL_EQUIPES_AUTO_CONCEPTION.md § 6) :
-- politique de brassage et taille d'équipe par défaut, portées par la classe.
--   team_policy        carry_over            : reconduire les équipes d'un chapitre au suivant
--                      reshuffle_each        : rebrasser à chaque chapitre (défaut)
--                      reshuffle_per_plateau : reconduire tant que le plateau ne change pas
--   team_size_default  taille visée proposée par défaut dans le dialogue MJ (4).
-- Idempotent : chaque colonne n'est ajoutée que si elle manque.

SET @has_team_policy := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_classes'
     AND COLUMN_NAME = 'team_policy'
);

SET @sql_team_policy := IF(
  @has_team_policy = 0,
  'ALTER TABLE gl_classes ADD COLUMN team_policy ENUM(''carry_over'', ''reshuffle_each'', ''reshuffle_per_plateau'') NOT NULL DEFAULT ''reshuffle_each'' AFTER is_active',
  'SELECT 1'
);
PREPARE stmt_team_policy FROM @sql_team_policy;
EXECUTE stmt_team_policy;
DEALLOCATE PREPARE stmt_team_policy;

SET @has_team_size_default := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_classes'
     AND COLUMN_NAME = 'team_size_default'
);

SET @sql_team_size_default := IF(
  @has_team_size_default = 0,
  'ALTER TABLE gl_classes ADD COLUMN team_size_default TINYINT UNSIGNED NOT NULL DEFAULT 4 AFTER team_policy',
  'SELECT 1'
);
PREPARE stmt_team_size_default FROM @sql_team_size_default;
EXECUTE stmt_team_size_default;
DEALLOCATE PREPARE stmt_team_size_default;
