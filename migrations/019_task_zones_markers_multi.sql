-- Liens multiples tâche <-> zones et tâche <-> repères
CREATE TABLE IF NOT EXISTS task_zones (
  task_id VARCHAR(64) NOT NULL,
  zone_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (task_id, zone_id),
  INDEX idx_task_zones_zone (zone_id),
  CONSTRAINT fk_task_zones_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_zones_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_markers (
  task_id VARCHAR(64) NOT NULL,
  marker_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (task_id, marker_id),
  INDEX idx_task_markers_marker (marker_id),
  CONSTRAINT fk_task_markers_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_markers_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO task_zones (task_id, zone_id)
SELECT id, zone_id FROM tasks WHERE zone_id IS NOT NULL;

INSERT IGNORE INTO task_markers (task_id, marker_id)
SELECT id, marker_id FROM tasks WHERE marker_id IS NOT NULL;

UPDATE schema_version SET version = 19;
