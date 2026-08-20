-- G11 (option A) — le logiciel n'exécute pas l'effet d'un sortilège : c'est le MJ qui
-- l'applique à la table. On garde donc la trace de cette application, pour qu'un sort
-- payé dont l'effet a été oublié se voie (file « Sortilèges à appliquer » côté MJ).
--
-- NULL = effet pas encore appliqué. Renseigné une seule fois, par le MJ qui coche.

SET @hasEffectAppliedAt = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_spell_cast_drafts'
     AND COLUMN_NAME = 'effect_applied_at'
);

SET @sql = IF(
  @hasEffectAppliedAt = 0,
  'ALTER TABLE gl_spell_cast_drafts ADD COLUMN effect_applied_at DATETIME DEFAULT NULL COMMENT ''Horodatage de l''''application de l''''effet par le MJ (NULL = pas encore appliqué)''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @hasEffectAppliedByType = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_spell_cast_drafts'
     AND COLUMN_NAME = 'effect_applied_by_actor_type'
);

SET @sql = IF(
  @hasEffectAppliedByType = 0,
  'ALTER TABLE gl_spell_cast_drafts ADD COLUMN effect_applied_by_actor_type VARCHAR(16) DEFAULT NULL AFTER effect_applied_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @hasEffectAppliedById = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_spell_cast_drafts'
     AND COLUMN_NAME = 'effect_applied_by_actor_id'
);

SET @sql = IF(
  @hasEffectAppliedById = 0,
  'ALTER TABLE gl_spell_cast_drafts ADD COLUMN effect_applied_by_actor_id VARCHAR(64) DEFAULT NULL AFTER effect_applied_by_actor_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Sert la file « à appliquer » : les sorts lancés dont l'effet n'est pas encore coché.
CREATE INDEX idx_gl_spell_cast_drafts_effect_pending
  ON gl_spell_cast_drafts (game_id, status, effect_applied_at);
