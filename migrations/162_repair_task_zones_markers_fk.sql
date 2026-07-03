-- =====================================================================
-- ForetMap — Réparation FK task_zones / task_markers (drift BDD locale).
--
-- CREATE TABLE IF NOT EXISTS (019) ne pose pas les FK si les tables existaient
-- déjà sans contraintes. Les tests d'atomicité (tasks-queries-atomic) exigent
-- un rejet INSERT sur zone_id / marker_id invalide.
-- Idempotent : nettoyage orphelins puis pose des FK si absentes.
-- =====================================================================

DELETE tz
  FROM task_zones tz
  LEFT JOIN zones z ON z.id = tz.zone_id
 WHERE z.id IS NULL;

DELETE tm
  FROM task_markers tm
  LEFT JOIN map_markers m ON m.id = tm.marker_id
 WHERE m.id IS NULL;

SET @tzHasZoneFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'task_zones'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     AND CONSTRAINT_NAME = 'fk_task_zones_zone'
);
SET @sql = IF(
  @tzHasZoneFk = 0,
  'ALTER TABLE task_zones ADD CONSTRAINT fk_task_zones_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tzHasTaskFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'task_zones'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     AND CONSTRAINT_NAME = 'fk_task_zones_task'
);
SET @sql = IF(
  @tzHasTaskFk = 0,
  'ALTER TABLE task_zones ADD CONSTRAINT fk_task_zones_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tmHasMarkerFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'task_markers'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     AND CONSTRAINT_NAME = 'fk_task_markers_marker'
);
SET @sql = IF(
  @tmHasMarkerFk = 0,
  'ALTER TABLE task_markers ADD CONSTRAINT fk_task_markers_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tmHasTaskFk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'task_markers'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     AND CONSTRAINT_NAME = 'fk_task_markers_task'
);
SET @sql = IF(
  @tmHasTaskFk = 0,
  'ALTER TABLE task_markers ADD CONSTRAINT fk_task_markers_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
