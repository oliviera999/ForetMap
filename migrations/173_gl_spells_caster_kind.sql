-- Peuple autorisé à lancer un sortilège : gnomes, licornes ou les deux.
-- Le « peuple » d'un lanceur est le type de son équipe (`gl_teams.type`), on réutilise
-- donc les mêmes valeurs ('gnome' / 'unicorn') plutôt qu'un vocabulaire parallèle.
-- 'any' (défaut) conserve exactement le comportement actuel : tout le monde peut lancer.

SET @glSpellsHasCasterKind = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gl_spells'
     AND COLUMN_NAME = 'caster_kind'
);

SET @sql = IF(
  @glSpellsHasCasterKind = 0,
  'ALTER TABLE gl_spells ADD COLUMN caster_kind ENUM(''any'', ''gnome'', ''unicorn'') NOT NULL DEFAULT ''any'' COMMENT ''any = gnomes et licornes ; gnome / unicorn = un seul peuple'' AFTER cast_scope',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE INDEX idx_gl_spells_caster_kind ON gl_spells (caster_kind);
