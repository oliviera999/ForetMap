-- Lien optionnel tâche -> repère de carte
ALTER TABLE tasks ADD COLUMN marker_id VARCHAR(64) DEFAULT NULL;
ALTER TABLE tasks ADD INDEX idx_tasks_marker_id (marker_id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_marker FOREIGN KEY (marker_id) REFERENCES map_markers(id) ON DELETE SET NULL;

UPDATE tasks t
INNER JOIN map_markers m ON m.id = t.marker_id
SET t.map_id = m.map_id
WHERE t.marker_id IS NOT NULL AND t.map_id IS NULL;

UPDATE schema_version SET version = 18;
