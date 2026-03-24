-- Support multi-cartes (foret + n3)
CREATE TABLE IF NOT EXISTS maps (
  id VARCHAR(32) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  map_image_url VARCHAR(512) DEFAULT NULL,
  sort_order INT UNSIGNED DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO maps (id, label, map_image_url, sort_order) VALUES
  ('foret', 'Forêt comestible', '/maps/map-foret.svg', 1),
  ('n3', 'N3', '/maps/plan%20n3.jpg', 2);

ALTER TABLE zones ADD COLUMN map_id VARCHAR(32) NOT NULL DEFAULT 'foret';
UPDATE zones SET map_id = 'foret' WHERE map_id IS NULL OR map_id = '';
ALTER TABLE zones ADD INDEX idx_zones_map_id (map_id);
ALTER TABLE zones ADD CONSTRAINT fk_zones_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT;

ALTER TABLE map_markers ADD COLUMN map_id VARCHAR(32) NOT NULL DEFAULT 'foret';
UPDATE map_markers SET map_id = 'foret' WHERE map_id IS NULL OR map_id = '';
ALTER TABLE map_markers ADD INDEX idx_map_markers_map_id (map_id);
ALTER TABLE map_markers ADD CONSTRAINT fk_map_markers_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE RESTRICT;

ALTER TABLE tasks ADD COLUMN map_id VARCHAR(32) DEFAULT NULL;
UPDATE tasks t
INNER JOIN zones z ON z.id = t.zone_id
SET t.map_id = z.map_id
WHERE t.zone_id IS NOT NULL AND t.map_id IS NULL;
ALTER TABLE tasks ADD INDEX idx_tasks_map_id (map_id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL;

UPDATE schema_version SET version = 15;
